import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { hashPassword } from '../../lib/password.js';
import { storeEncryptedImage } from '../../lib/storage.js';
import { sanitizeCsvCell } from './csv.js';

describe('Admin Live Monitoring & Incident Investigation Test Suite (Prompt 08)', () => {
  let adminCookie: string;
  let studentCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let adminUserId: string;
  let studentUserId: string;
  let examId: string;
  let sessionId: string;
  let triggerId: string;
  let incidentCode: string;
  let evidenceStoragePath: string;
  let sampleJpeg: Buffer;

  beforeAll(async () => {
    // Generate clean synthetic JPEG
    sampleJpeg = await sharp({
      create: {
        width: 160,
        height: 120,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    // 1. Obtain CSRF Token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
    csrfToken = csrfRes.body.data.csrfToken;

    // 2. Create Admin
    const adminEmail = `inc_admin_${Date.now()}@test.local`;
    const adminPassword = 'AdminPassword1234!';
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Incident Admin Investigator',
        passwordHash: await hashPassword(adminPassword),
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;

    // Login Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: adminEmail, password: adminPassword });

    expect(adminLoginRes.status).toBe(200);
    const adminSetCookies = adminLoginRes.headers['set-cookie'];
    const adminCookieList = Array.isArray(adminSetCookies) ? adminSetCookies : [adminSetCookies as string];
    adminCookie = adminCookieList.find((c) => c.startsWith('eg_session=')) || '';

    // 3. Create Student
    const studentEmail = `inc_stu_${Date.now()}@test.local`;
    const studentPassword = 'StudentPassword1234!';
    const student = await prisma.user.create({
      data: {
        email: studentEmail,
        fullName: 'Monitored Candidate Student',
        passwordHash: await hashPassword(studentPassword),
        role: 'STUDENT',
        status: 'ACTIVE',
        studentProfile: {
          create: {
            studentId: `STU-INC-${Date.now().toString().slice(-4)}`,
            enrollmentStatusCache: 'APPROVED',
          },
        },
      },
    });
    studentUserId = student.id;

    // Login Student
    const studentLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: studentEmail, password: studentPassword });

    const studentSetCookies = studentLoginRes.headers['set-cookie'];
    const studentCookieList = Array.isArray(studentSetCookies) ? studentSetCookies : [studentSetCookies as string];
    studentCookie = studentCookieList.find((c) => c.startsWith('eg_session=')) || '';

    // 4. Create FaceProfile + 1 approved enrollment image
    const faceProfile = await prisma.faceProfile.create({
      data: {
        studentUserId: student.id,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
        approvedAt: new Date(),
        approvedBy: adminUserId,
      },
    });

    const storedEnrollment = await storeEncryptedImage({
      kind: 'enrollment',
      bytes: sampleJpeg,
    });

    await prisma.faceEnrollmentImage.create({
      data: {
        faceProfileId: faceProfile.id,
        angle: 'FRONT',
        storagePath: storedEnrollment.relativePath,
        sha256: storedEnrollment.sha256,
        mime: 'image/jpeg',
        byteSize: storedEnrollment.byteSize,
        width: 160,
        height: 120,
        encIv: storedEnrollment.iv as any,
        encTag: storedEnrollment.tag as any,
        encKeyVersion: storedEnrollment.keyVersion,
        quality: {},
        capturedAt: new Date(),
      },
    });

    // 5. Active verification setting
    const settings = await prisma.verificationSetting.findFirstOrThrow({
      where: { isActive: true },
    });

    // 6. Exam
    const exam = await prisma.exam.create({
      data: {
        title: 'Prompt 08 Final Proctored Exam',
        durationMinutes: 60,
        status: 'ACTIVE',
        createdBy: adminUserId,
        verificationSettingsId: settings.id,
      },
    });
    examId = exam.id;

    // 7. ExamSession
    const session = await prisma.examSession.create({
      data: {
        examId: exam.id,
        studentUserId: student.id,
        faceProfileId: faceProfile.id,
        settingsVersionId: settings.id,
        settingsSnapshot: {
          matchThresholdPct: 75.0,
          consecutiveMismatchLimit: 3,
        },
        status: 'IN_PROGRESS',
        activeStudentKey: student.id,
        startedAt: new Date(),
        lastSeenAt: new Date(),
        totalAttempts: 10,
        matchCount: 7,
        mismatchCount: 3,
        lastOutcome: 'MISMATCH',
        lastSimilarityPct: 18.2,
      },
    });
    sessionId = session.id;

    // 8. VerificationLog entry
    const vLog = await prisma.verificationLog.create({
      data: {
        sessionId: session.id,
        studentUserId: student.id,
        examId: exam.id,
        sequenceNo: 10,
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        similarityPct: 18.2,
        similarityRaw: 0.182,
        thresholdPct: 75.0,
        processingMs: 25,
        settingsVersionId: settings.id,
        createdAt: new Date(),
      },
    });

    // 9. SecurityTrigger
    incidentCode = `INC-20261111-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const trigger = await prisma.securityTrigger.create({
      data: {
        incidentCode,
        sessionId: session.id,
        studentUserId: student.id,
        examId: exam.id,
        triggerType: 'IDENTITY_MISMATCH',
        severity: 'CRITICAL',
        status: 'OPEN',
        activeDedupeKey: `IDENTITY_MISMATCH:${session.id}`,
        firstDetectedAt: new Date(),
        lastDetectedAt: new Date(),
        occurrenceCount: 1,
        firstSimilarityPct: 18.2,
        worstSimilarityPct: 18.2,
        firstVerificationLogId: vLog.id,
        lastVerificationLogId: vLog.id,
        evidenceStatus: 'CAPTURED',
      },
    });
    triggerId = trigger.id;

    await prisma.verificationLog.update({
      where: { id: vLog.id },
      data: { triggerId: trigger.id },
    });

    // 10. Store Encrypted TriggerEvidence
    const storedEvidence = await storeEncryptedImage({
      kind: 'evidence',
      bytes: sampleJpeg,
    });
    evidenceStoragePath = storedEvidence.relativePath;

    await prisma.triggerEvidence.create({
      data: {
        triggerId: trigger.id,
        verificationLogId: vLog.id,
        storagePath: storedEvidence.relativePath,
        sha256: storedEvidence.sha256,
        mime: 'image/jpeg',
        byteSize: storedEvidence.byteSize,
        width: 160,
        height: 120,
        encIv: storedEvidence.iv as any,
        encTag: storedEvidence.tag as any,
        encKeyVersion: storedEvidence.keyVersion,
        capturedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Clean up created evidence file on disk
    if (evidenceStoragePath) {
      const fullPath = path.resolve(env.STORAGE_ROOT, evidenceStoragePath);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath).catch(() => {});
      }
    }
  });

  describe('Unit: CSV Formula Injection Mitigation', () => {
    it('prefixes dangerous leading characters (=, +, -, @, tab, cr) with single quote', () => {
      expect(sanitizeCsvCell('=1+2')).toBe(`'=1+2`);
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe(`'+cmd|/c calc`);
      expect(sanitizeCsvCell('-50')).toBe(`'-50`);
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe(`'@SUM(A1:A10)`);
      expect(sanitizeCsvCell('\tTABBED')).toBe(`'\tTABBED`);

      // Normal safe text is cleanly unquoted or quoted when containing comma
      expect(sanitizeCsvCell('Safe Candidate Name')).toBe('Safe Candidate Name');
      expect(sanitizeCsvCell('Text "with quotes" inside')).toBe(`"Text ""with quotes"" inside"`);
      expect(sanitizeCsvCell('Text, with comma')).toBe(`"Text, with comma"`);
    });
  });

  describe('Integration: Live Monitoring Snapshot Endpoint', () => {
    it('GET /api/v1/admin/monitoring/sessions returns active sessions with signal health and incidents', async () => {
      const res = await request(app)
        .get('/api/v1/admin/monitoring/sessions')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('inProgress');
      expect(res.body.data).toHaveProperty('counts');
      expect(Array.isArray(res.body.data.inProgress)).toBe(true);

      const found = res.body.data.inProgress.find((s: any) => s.sessionId === sessionId);
      expect(found).toBeTruthy();
      expect(found.signalHealth).toBe('OK');
      expect(found.activeIncidentsCount).toBeGreaterThanOrEqual(1);
      expect(found.highestActiveSeverity).toBe('CRITICAL');
    });

    it('rejects unauthenticated requests to monitoring snapshot with 401', async () => {
      const res = await request(app).get('/api/v1/admin/monitoring/sessions');
      expect(res.status).toBe(401);
    });

    it('rejects student requests to monitoring snapshot with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/monitoring/sessions')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', studentCookie);
      expect(res.status).toBe(403);
    });
  });

  describe('Integration: Incidents Listing and Detail', () => {
    it('GET /api/v1/admin/incidents lists incidents with filters and cursor pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/incidents?status=OPEN&severity=CRITICAL&limit=10')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((inc: any) => inc.id === triggerId);
      expect(found).toBeTruthy();
      expect(found.incidentCode).toBe(incidentCode);
      expect(found.activeDedupeKey).toBeTruthy();
    });

    it('GET /api/v1/admin/incidents/:id returns full detail, registered images, evidence, and logs', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/incidents/${triggerId}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const { incident, student, exam, session, evidence, registeredImages, timelineLogs } = res.body.data;

      expect(incident.id).toBe(triggerId);
      expect(incident.incidentCode).toBe(incidentCode);
      expect(student.id).toBe(studentUserId);
      expect(exam.id).toBe(examId);
      expect(session.id).toBe(sessionId);
      expect(evidence.triggerId).toBe(triggerId);
      expect(evidence.url).toBe(`/api/v1/admin/images/evidence/${triggerId}`);
      expect(registeredImages.length).toBeGreaterThanOrEqual(1);
      expect(timelineLogs.length).toBeGreaterThanOrEqual(1);

      // Verifies VIEWED action was recorded in AdminInvestigationLog
      const viewLog = await prisma.adminInvestigationLog.findFirst({
        where: {
          triggerId,
          adminUserId,
          action: 'VIEWED',
        },
      });
      expect(viewLog).toBeTruthy();
    });
  });

  describe('Integration: Protected Evidence Streaming & Fail-Closed Integrity', () => {
    it('GET /api/v1/admin/images/evidence/:triggerId streams decrypted JPEG with strict headers and audit log', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/images/evidence/${triggerId}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('no-store, private');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.body.length).toBeGreaterThan(0);

      // Verify fail-closed audit log recorded
      const auditLog = await prisma.adminAuditLog.findFirst({
        where: {
          actorUserId: adminUserId,
          action: 'EVIDENCE_ACCESSED',
        },
      });
      expect(auditLog).toBeTruthy();

      const invLog = await prisma.adminInvestigationLog.findFirst({
        where: {
          triggerId,
          adminUserId,
          action: 'EVIDENCE_VIEWED',
        },
      });
      expect(invLog).toBeTruthy();
    });

    it('rejects student access to evidence image with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/images/evidence/${triggerId}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', studentCookie);

      expect(res.status).toBe(403);
    });

    it('detects tampering and returns 409 EVIDENCE_INTEGRITY_FAILED if evidence file is altered', async () => {
      const fullPath = path.resolve(env.STORAGE_ROOT, evidenceStoragePath);
      const originalFileBuffer = await fs.promises.readFile(fullPath);

      try {
        // Corrupt 1 byte in the ciphertext
        const corrupted = Buffer.from(originalFileBuffer);
        corrupted[corrupted.length - 1] ^= 0xff;
        await fs.promises.writeFile(fullPath, corrupted);

        const res = await request(app)
          .get(`/api/v1/admin/images/evidence/${triggerId}`)
          .set('Origin', 'http://localhost:3000')
          .set('Cookie', adminCookie);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('EVIDENCE_INTEGRITY_FAILED');

        // Verify tamper audit log created
        const tamperAudit = await prisma.adminAuditLog.findFirst({
          where: {
            actorUserId: adminUserId,
            action: 'EVIDENCE_INTEGRITY_FAILURE',
          },
        });
        expect(tamperAudit).toBeTruthy();
      } finally {
        // Restore original file
        await fs.promises.writeFile(fullPath, originalFileBuffer);
      }
    });
  });

  describe('Integration: Incident State Machine & Notes Workflow', () => {
    it('POST /api/v1/admin/incidents/:id/acknowledge transitions status to ACKNOWLEDGED', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/incidents/${triggerId}/acknowledge`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ note: 'Acknowledged incident for active investigation' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACKNOWLEDGED');

      // Verify idempotent re-acknowledgement
      const repeatRes = await request(app)
        .post(`/api/v1/admin/incidents/${triggerId}/acknowledge`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ note: 'Repeat ack' });

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.data.status).toBe('ACKNOWLEDGED');
    });

    it('POST /api/v1/admin/incidents/:id/notes adds an investigation note', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/incidents/${triggerId}/notes`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ note: 'Investigator contacted exam supervisor for room verification' });

      expect(res.status).toBe(201);
      expect(res.body.data.note).toBe('Investigator contacted exam supervisor for room verification');
    });

    it('POST /api/v1/admin/incidents/:id/review enforces minimum note length for CONFIRMED_CONCERN', async () => {
      const failRes = await request(app)
        .post(`/api/v1/admin/incidents/${triggerId}/review`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ disposition: 'CONFIRMED_CONCERN', note: 'too short' });

      expect(failRes.status).toBe(400);

      // Review with valid note >= 10 chars
      const successRes = await request(app)
        .post(`/api/v1/admin/incidents/${triggerId}/review`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          disposition: 'CONFIRMED_CONCERN',
          note: 'Confirmed identity mismatch: physical facial structure differs significantly from registered profile',
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.status).toBe('REVIEWED');
      expect(successRes.body.data.disposition).toBe('CONFIRMED_CONCERN');
    });
  });

  describe('Integration: Incident Reports Export', () => {
    it('GET /api/v1/admin/incidents/:id/report?format=csv returns safe CSV attachment', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/incidents/${triggerId}/report?format=csv`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=.*\.csv/);
      expect(res.text).toContain(incidentCode);
      expect(res.text).toContain('Candidate Name');
    });

    it('GET /api/v1/admin/incidents/:id/report?format=html returns clean print-ready HTML with zero external script tags', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/incidents/${triggerId}/report?format=html`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain(incidentCode);

      // Guarantee ZERO external script tags for security
      expect(res.text).not.toMatch(/<script\s+src/i);
    });
  });

  describe('Integration: Session Cancellation Workflow', () => {
    it('POST /api/v1/admin/sessions/:id/cancel cancels session, clears active dedupe keys and student locks', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/sessions/${sessionId}/cancel`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Severe persistent proctoring violation confirmed by proctor' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      // Verify database state
      const dbSession = await prisma.examSession.findUnique({
        where: { id: sessionId },
      });
      expect(dbSession?.status).toBe('CANCELLED');
      expect(dbSession?.activeStudentKey).toBeNull();
      expect(dbSession?.cancelledBy).toBe(adminUserId);

      // Verify active_dedupe_key on security triggers cleared
      const dbTrigger = await prisma.securityTrigger.findUnique({
        where: { id: triggerId },
      });
      expect(dbTrigger?.activeDedupeKey).toBeNull();

      // Verify SESSION_CANCELLED audit entry
      const cancelAudit = await prisma.adminAuditLog.findFirst({
        where: {
          actorUserId: adminUserId,
          action: 'SESSION_CANCELLED',
        },
      });
      expect(cancelAudit).toBeTruthy();
    });

    it('rejects cancellation of already cancelled session with 409', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/sessions/${sessionId}/cancel`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Duplicate cancellation attempt' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });
});
