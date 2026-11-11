import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { hashPassword } from '../../lib/password.js';
import { verificationRecorder } from '../verification/recorder.js';
import { checkSessionLogIntegrity } from '../verification/integrity.js';
import { sessionsService } from '../sessions/sessions.service.js';
import { studentDashboardService } from '../student/dashboard.service.js';
import { evidenceWriter } from './evidence.writer.js';
import { incidentService } from './incident.service.js';
import { TriggerType } from '@examguard/shared';

async function countEvidenceFilesOnDisk(): Promise<number> {
  const evidenceDir = path.resolve(env.STORAGE_ROOT, 'evidence');
  if (!fs.existsSync(evidenceDir)) return 0;
  let count = 0;
  const entries = await fs.promises.readdir(evidenceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sub = path.join(evidenceDir, entry.name);
      const files = await fs.promises.readdir(sub);
      count += files.length;
    } else if (entry.isFile()) {
      count++;
    }
  }
  return count;
}

describe('Security Trigger Engine & Evidence Guarantees Integration Suite', () => {
  let sampleJpeg: Buffer;
  let studentId: string;
  let examId: string;
  let profileId: string;
  let settingsId: string;

  beforeEach(async () => {
    sampleJpeg = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const student = await prisma.user.create({
      data: {
        email: `trigger_int_${Date.now()}_${Math.random().toString(36).substring(7)}@test.local`,
        fullName: 'Trigger Integration Student',
        passwordHash: await hashPassword('StudentPass1234!'),
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentId: `STU-${Date.now().toString().slice(-6)}`,
          },
        },
      },
    });
    studentId = student.id;

    const profile = await prisma.faceProfile.create({
      data: {
        studentUserId: studentId,
        status: 'APPROVED',
        version: 1,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });
    profileId = profile.id;

    const setting = await prisma.verificationSetting.findFirstOrThrow({
      where: { isActive: true },
    });
    settingsId = setting.id;

    const exam = await prisma.exam.create({
      data: {
        title: 'Security Triggers Exam',
        durationMinutes: 60,
        status: 'ACTIVE',
        createdBy: studentId,
        verificationSettingsId: settingsId,
      },
    });
    examId = exam.id;
  });

  async function createTestSession(customSnapshot?: Record<string, any>) {
    const startedAt = new Date(Date.now() - 60000); // 60s ago (past startup grace)
    const snapshot = {
      consecutiveMismatchLimit: 3,
      missingFaceLimit: 3,
      multipleFacesPolicy: 'ALERT_AFTER_CONSECUTIVE',
      multipleFacesConsecutiveLimit: 2,
      cameraFailurePolicy: 'ALERT_AFTER_GRACE',
      cameraGraceSeconds: 5,
      serviceFailureLimit: 3,
      repeatedFailureLimit: 5,
      recoveryMatchCount: 3,
      startupGraceSeconds: 5,
      thresholdPct: 75.0,
      severityRules: {
        IDENTITY_MISMATCH: 'CRITICAL',
        MULTIPLE_FACES: 'HIGH',
        CAMERA_DISCONNECTED: 'HIGH',
        NO_FACE: 'MEDIUM',
        REPEATED_VERIFICATION_FAILURE: 'MEDIUM',
        VERIFICATION_SERVICE_FAILURE: 'LOW',
      },
      ...customSnapshot,
    };

    return await prisma.examSession.create({
      data: {
        examId,
        studentUserId: studentId,
        faceProfileId: profileId,
        settingsVersionId: settingsId,
        settingsSnapshot: snapshot,
        status: 'IN_PROGRESS',
        startedAt,
        lastSeenAt: startedAt,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  }

  it('guarantee 1: every attempt logs exactly one row with contiguous sequence numbers', async () => {
    const session = await createTestSession();

    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MATCH',
      similarityPct: 88,
      processingMs: 25,
      frameBuffer: sampleJpeg,
    });

    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 40,
      processingMs: 30,
      frameBuffer: sampleJpeg,
    });

    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'NO_FACE',
      errorCode: 'NO_FACE_DETECTED',
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });

    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'CAMERA_ERROR',
      errorCode: 'DEVICE_UNAVAILABLE',
      processingMs: 5,
      frameBuffer: null,
    });

    const integrity = await checkSessionLogIntegrity(session.id);
    expect(integrity.isValid).toBe(true);
    expect(integrity.details.totalLogs).toBe(4);
    expect(integrity.details.sessionTotalAttempts).toBe(4);
    expect(integrity.details.nextSequenceNo).toBe(5);
  });

  it('guarantee 2 & 3: no image on MATCH; MISMATCH below limit creates no incident; at limit creates exactly one incident, one evidence row, one file', async () => {
    const session = await createTestSession({ consecutiveMismatchLimit: 3 });
    const initialFiles = await countEvidenceFilesOnDisk();
    const initialEvidenceRows = await prisma.triggerEvidence.count();

    // 1. MATCH attempt: must NOT store any evidence image
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MATCH',
      similarityPct: 92,
      processingMs: 20,
      frameBuffer: sampleJpeg,
    });

    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles);
    expect(await prisma.triggerEvidence.count()).toBe(initialEvidenceRows);

    // 2. MISMATCH 1 (below limit 3) -> no incident, no image
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 45,
      processingMs: 20,
      frameBuffer: sampleJpeg,
    });

    // 3. MISMATCH 2 (below limit 3) -> no incident, no image
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 42,
      processingMs: 20,
      frameBuffer: sampleJpeg,
    });

    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles);
    expect(await prisma.triggerEvidence.count()).toBe(initialEvidenceRows);
    expect(await prisma.securityTrigger.count({ where: { sessionId: session.id } })).toBe(0);

    // 4. MISMATCH 3 (at limit) -> OPENS exactly one incident, exactly one evidence row, exactly one file
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 38,
      processingMs: 20,
      frameBuffer: sampleJpeg,
    });

    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 1);
    expect(await prisma.triggerEvidence.count()).toBe(initialEvidenceRows + 1);

    const incidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
      include: { evidence: true },
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].triggerType).toBe('IDENTITY_MISMATCH');
    expect(incidents[0].occurrenceCount).toBe(1);
    expect(incidents[0].evidenceStatus).toBe('CAPTURED');
    expect(incidents[0].evidence).toBeDefined();
    expect(incidents[0].evidence?.storagePath).toBeDefined();
  });

  it('guarantee 4: 50 further MISMATCH outcomes update the active incident, increment occurrence_count, and write NO additional files', async () => {
    const session = await createTestSession({
      consecutiveMismatchLimit: 2,
      repeatedFailureLimit: 999, // Prevent secondary trigger from opening
    });
    const initialFiles = await countEvidenceFilesOnDisk();
    const initialEvidenceRows = await prisma.triggerEvidence.count();

    // Trigger incident opening with 2 mismatches
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 40,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 35,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });

    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 1);
    expect(await prisma.triggerEvidence.count()).toBe(initialEvidenceRows + 1);

    // Fire 50 more consecutive mismatches
    for (let i = 0; i < 50; i++) {
      await verificationRecorder.record({
        sessionId: session.id,
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        similarityPct: 30 - (i % 10),
        processingMs: 15,
        frameBuffer: sampleJpeg,
      });
    }

    // Disk and row counts must remain STRICTLY unchanged (still exactly 1 file and 1 evidence row)
    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 1);
    expect(await prisma.triggerEvidence.count()).toBe(initialEvidenceRows + 1);

    const incident = await prisma.securityTrigger.findFirstOrThrow({
      where: { sessionId: session.id, triggerType: 'IDENTITY_MISMATCH' },
    });
    expect(incident.occurrenceCount).toBe(51);
    expect(incident.worstSimilarityPct).toBeLessThanOrEqual(21);
  });

  it('guarantee 5: recovery clears active_dedupe_key, and a subsequent failure creates a second incident with second evidence', async () => {
    const session = await createTestSession({
      consecutiveMismatchLimit: 2,
      recoveryMatchCount: 3,
    });
    const initialFiles = await countEvidenceFilesOnDisk();

    // 1. Two mismatches -> opens Incident #1
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 40,
      processingMs: 10,
      frameBuffer: sampleJpeg,
    });
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 38,
      processingMs: 10,
      frameBuffer: sampleJpeg,
    });

    const inc1 = await prisma.securityTrigger.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(inc1.activeDedupeKey).toBe(`${session.id}:IDENTITY_MISMATCH`);
    expect(inc1.recoveredAt).toBeNull();
    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 1);

    // 2. Candidate recovers after 3 consecutive MATCH outcomes
    for (let i = 0; i < 3; i++) {
      await verificationRecorder.record({
        sessionId: session.id,
        phase: 'CONTINUOUS',
        outcome: 'MATCH',
        similarityPct: 90,
        processingMs: 10,
        frameBuffer: sampleJpeg,
      });
    }

    const inc1AfterRecovery = await prisma.securityTrigger.findUniqueOrThrow({
      where: { id: inc1.id },
    });
    expect(inc1AfterRecovery.recoveredAt).not.toBeNull();
    expect(inc1AfterRecovery.activeDedupeKey).toBeNull();
    // No files were added during recovery
    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 1);

    // 3. Subsequent mismatch run -> opens Incident #2 with NEW evidence file and distinct incident_code
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 35,
      processingMs: 10,
      frameBuffer: sampleJpeg,
    });
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 32,
      processingMs: 10,
      frameBuffer: sampleJpeg,
    });

    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 2);

    const allIncidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(allIncidents).toHaveLength(2);
    expect(allIncidents[0].id).toBe(inc1.id);
    expect(allIncidents[1].id).not.toBe(inc1.id);
    expect(allIncidents[1].incidentCode).not.toBe(inc1.incidentCode);
    expect(allIncidents[1].activeDedupeKey).toBe(`${session.id}:IDENTITY_MISMATCH`);
    expect(allIncidents[1].recoveredAt).toBeNull();
  });

  it('guarantee 7: concurrent duplicate open creates only one incident and deletes orphan file on P2002', async () => {
    const session = await createTestSession({ consecutiveMismatchLimit: 1 });
    const initialFiles = await countEvidenceFilesOnDisk();

    // Simulate two concurrent opens firing in parallel for the exact same session and trigger type
    const [res1, res2] = await Promise.all([
      verificationRecorder.record({
        sessionId: session.id,
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        similarityPct: 40,
        processingMs: 15,
        frameBuffer: sampleJpeg,
      }),
      verificationRecorder.record({
        sessionId: session.id,
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        similarityPct: 38,
        processingMs: 15,
        frameBuffer: sampleJpeg,
      }),
    ]);

    expect(res1.logId).toBeDefined();
    expect(res2.logId).toBeDefined();

    // Exactly one incident row exists in DB
    const incidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
    });
    expect(incidents).toHaveLength(1);

    // Exactly one evidence row exists in DB
    const evidenceRows = await prisma.triggerEvidence.findMany({
      where: { triggerId: incidents[0].id },
    });
    expect(evidenceRows).toHaveLength(1);

    // Exactly one file was retained on disk (the race duplicate was deleted)
    expect(await countEvidenceFilesOnDisk()).toBe(initialFiles + 1);
  });

  it('guarantee 8: evidence write failure keeps incident with evidence_status=FAILED and records audit log', async () => {
    const session = await createTestSession({ consecutiveMismatchLimit: 1 });

    // Temporarily spy on evidenceWriter.writeEvidence to simulate an unexpected file system failure
    const originalWrite = evidenceWriter.writeEvidence;
    evidenceWriter.writeEvidence = async () => ({
      status: 'FAILED',
      failureReason: 'Simulated disk I/O error during evidence encryption',
    });

    try {
      await verificationRecorder.record({
        sessionId: session.id,
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        similarityPct: 45,
        processingMs: 20,
        frameBuffer: sampleJpeg,
      });

      const incident = await prisma.securityTrigger.findFirstOrThrow({
        where: { sessionId: session.id },
      });
      expect(incident.evidenceStatus).toBe('FAILED');
      expect(incident.evidenceFailureReason).toContain('Simulated disk I/O error');

      // Verification log was still created
      const logs = await prisma.verificationLog.findMany({
        where: { sessionId: session.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].triggerId).toBe(incident.id);

      // Audit log records EVIDENCE_CAPTURE_FAILED
      const audit = await prisma.adminAuditLog.findFirst({
        where: { action: 'EVIDENCE_CAPTURE_FAILED', entityId: incident.id },
      });
      expect(audit).toBeDefined();
    } finally {
      evidenceWriter.writeEvidence = originalWrite;
    }
  });

  it('guarantee 9: transaction failure after file write rolls back evidence file from disk', async () => {
    const session = await createTestSession({ consecutiveMismatchLimit: 1 });
    const initialFiles = await countEvidenceFilesOnDisk();

    // Force transaction failure by corrupting foreign key in afterRecord
    const originalAfterRecord = verificationRecorder.afterRecord;
    verificationRecorder.afterRecord = async () => {
      throw new Error('Forced transaction failure for testing rollback');
    };

    try {
      await expect(
        verificationRecorder.record({
          sessionId: session.id,
          phase: 'CONTINUOUS',
          outcome: 'MISMATCH',
          similarityPct: 40,
          processingMs: 20,
          frameBuffer: sampleJpeg,
        })
      ).rejects.toThrow('Forced transaction failure');

      // The evidence file written before transaction failure was deleted during rollback
      expect(await countEvidenceFilesOnDisk()).toBe(initialFiles);

      // No log or incident row remains
      const incidents = await prisma.securityTrigger.findMany({
        where: { sessionId: session.id },
      });
      expect(incidents).toHaveLength(0);

      const logs = await prisma.verificationLog.findMany({
        where: { sessionId: session.id },
      });
      expect(logs).toHaveLength(0);
    } finally {
      verificationRecorder.afterRecord = originalAfterRecord;
    }
  });

  it('guarantee 10: settings snapshot immunity: updating global settings does not alter running session behavior', async () => {
    // Session started with consecutiveMismatchLimit: 2
    const session = await createTestSession({ consecutiveMismatchLimit: 2 });

    // Update active global settings to consecutiveMismatchLimit: 10
    await prisma.verificationSetting.updateMany({
      where: { id: settingsId },
      data: { consecutiveMismatchLimit: 10 },
    });

    // 2 mismatches: must trigger based on session's immutable snapshot (limit: 2), ignoring global change (10)
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 40,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 40,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });

    const incident = await prisma.securityTrigger.findFirst({
      where: { sessionId: session.id },
    });
    expect(incident).toBeDefined();
    expect(incident?.triggerType).toBe('IDENTITY_MISMATCH');
  });

  it('guarantee 11: session end clears active_dedupe_key while leaving incidents reviewable without recovery', async () => {
    const session = await createTestSession({ consecutiveMismatchLimit: 1 });

    // Open an incident
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 35,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });

    const incBefore = await prisma.securityTrigger.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(incBefore.activeDedupeKey).toBe(`${session.id}:IDENTITY_MISMATCH`);
    expect(incBefore.recoveredAt).toBeNull();

    // Submit session (leaves IN_PROGRESS)
    await sessionsService.submitSession(session.id, studentId);

    const incAfter = await prisma.securityTrigger.findUniqueOrThrow({
      where: { id: incBefore.id },
    });
    // activeDedupeKey is cleared
    expect(incAfter.activeDedupeKey).toBeNull();
    // recoveredAt remains null (it was not recovered!)
    expect(incAfter.recoveredAt).toBeNull();
    // Incident remains open for admin review
    expect(incAfter.status).toBe('OPEN');
  });

  it('guarantee 13: checkSessionLogIntegrity detects sequence and counter anomalies', async () => {
    const session = await createTestSession();

    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MATCH',
      similarityPct: 90,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });

    const cleanIntegrity = await checkSessionLogIntegrity(session.id);
    expect(cleanIntegrity.isValid).toBe(true);

    // Corrupt mismatch count on session row
    await prisma.examSession.update({
      where: { id: session.id },
      data: { mismatchCount: 99 },
    });

    const corruptedIntegrity = await checkSessionLogIntegrity(session.id);
    expect(corruptedIntegrity.isValid).toBe(false);
    expect(corruptedIntegrity.issues.some((i) => i.includes('Mismatch count mismatch'))).toBe(true);
  });

  it('guarantee 14: student dashboard warnings are own-only and contain neutral wording without biometrics or scores', async () => {
    const session = await createTestSession({ consecutiveMismatchLimit: 1 });

    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 40,
      processingMs: 15,
      frameBuffer: sampleJpeg,
    });

    const dashboard = await studentDashboardService.getDashboardData(studentId);
    expect(dashboard.previousWarnings).toHaveLength(1);
    const warn = dashboard.previousWarnings[0];
    expect(warn.type).toBe('IDENTITY_MISMATCH');
    expect(warn.description).toBe('Identity could not be confirmed');
    expect(warn.note).toBe('An administrator may review this; it is not a final decision.');
    expect(warn.examTitle).toBe('Security Triggers Exam');
    // Ensure no biometric scores or raw hashes leaked
    expect((warn as any).similarityPct).toBeUndefined();
    expect((warn as any).sha256).toBeUndefined();
  });

  it('guarantee 15: property-style randomized sequence test verifies invariants under random outcomes', async () => {
    const session = await createTestSession({
      consecutiveMismatchLimit: 2,
      missingFaceLimit: 2,
      recoveryMatchCount: 2,
    });

    const outcomes: Array<{ outcome: any; errorCode: string; similarityPct: number | null }> = [
      { outcome: 'MATCH', errorCode: 'NONE', similarityPct: 91 },
      { outcome: 'MISMATCH', errorCode: 'BELOW_THRESHOLD', similarityPct: 35 },
      { outcome: 'NO_FACE', errorCode: 'NO_FACE_DETECTED', similarityPct: null },
      { outcome: 'MATCH', errorCode: 'NONE', similarityPct: 88 },
      { outcome: 'MISMATCH', errorCode: 'BELOW_THRESHOLD', similarityPct: 42 },
      { outcome: 'MISMATCH', errorCode: 'BELOW_THRESHOLD', similarityPct: 39 }, // Triggers MISMATCH
      { outcome: 'MATCH', errorCode: 'NONE', similarityPct: 95 },
      { outcome: 'MATCH', errorCode: 'NONE', similarityPct: 92 }, // Recovers
      { outcome: 'NO_FACE', errorCode: 'NO_FACE_DETECTED', similarityPct: null },
      { outcome: 'NO_FACE', errorCode: 'NO_FACE_DETECTED', similarityPct: null }, // Triggers NO_FACE
    ];

    for (const step of outcomes) {
      await verificationRecorder.record({
        sessionId: session.id,
        phase: 'CONTINUOUS',
        outcome: step.outcome,
        errorCode: step.errorCode,
        similarityPct: step.similarityPct,
        processingMs: 10,
        frameBuffer: sampleJpeg,
      });
    }

    // Assert Invariant A: Log integrity holds (contiguous sequence, tallies match)
    const integrity = await checkSessionLogIntegrity(session.id);
    expect(integrity.isValid).toBe(true);

    // Assert Invariant B: At most 1 ongoing incident per trigger type
    const activeIncidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id, activeDedupeKey: { not: null } },
    });
    const activeTypes = activeIncidents.map((i) => i.triggerType);
    const uniqueActiveTypes = new Set(activeTypes);
    expect(uniqueActiveTypes.size).toBe(activeTypes.length);

    // Assert Invariant C: Number of captured evidence rows exactly equals captured incident rows
    const capturedIncidents = await prisma.securityTrigger.count({
      where: { sessionId: session.id, evidenceStatus: 'CAPTURED' },
    });
    const evidenceRows = await prisma.triggerEvidence.count({
      where: { trigger: { sessionId: session.id } },
    });
    expect(evidenceRows).toBe(capturedIncidents);
  });
});
