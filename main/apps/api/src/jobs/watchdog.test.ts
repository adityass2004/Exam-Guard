import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { SessionWatchdogJob, WatchdogClock } from './watchdog.js';
import { sessionLockManager } from '../modules/verification/sessionLock.js';
import { hashPassword } from '../lib/password.js';
import { verificationRecorder } from '../modules/verification/recorder.js';

class MockClock implements WatchdogClock {
  private currentTime: Date;

  constructor(initial: Date = new Date()) {
    this.currentTime = new Date(initial);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  setTime(time: Date): void {
    this.currentTime = new Date(time);
  }
}

describe('Session Watchdog Job Suite', () => {
  let mockClock: MockClock;
  let watchdog: SessionWatchdogJob;
  let studentId: string;
  let examId: string;
  let profileId: string;

  beforeEach(async () => {
    sessionLockManager.clear();
    await prisma.examSession.updateMany({
      where: { status: 'IN_PROGRESS' },
      data: { status: 'CANCELLED' },
    });
    mockClock = new MockClock(new Date('2026-11-10T10:00:00Z'));
    watchdog = new SessionWatchdogJob(mockClock, 5000, prisma);

    // Create student
    const email = `watchdog_student_${Date.now()}@examguard.test`;
    const passwordHash = await hashPassword('StudentPass1234!');
    const student = await prisma.user.create({
      data: {
        email,
        fullName: 'Watchdog Student Tester',
        passwordHash,
        role: 'STUDENT',
      },
    });
    studentId = student.id;

    // Create profile
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

    // Get active settings
    const settings = await prisma.verificationSetting.findFirstOrThrow({
      where: { isActive: true },
    });

    // Create exam
    const exam = await prisma.exam.create({
      data: {
        title: 'Watchdog Verification Exam',
        durationMinutes: 60,
        status: 'ACTIVE',
        createdBy: studentId,
        verificationSettingsId: settings.id,
      },
    });
    examId = exam.id;
  });

  afterEach(() => {
    watchdog.stop();
    sessionLockManager.clear();
  });

  async function createActiveSession(startedAt: Date, lastSeenAt: Date) {
    const settings = await prisma.verificationSetting.findFirstOrThrow({
      where: { isActive: true },
    });

    const snapshot = {
      intervalMs: 2000,
      cameraGraceSeconds: 5,
      cameraFailurePolicy: 'ALERT_AFTER_GRACE',
      startupGraceSeconds: 10,
      recoveryMatchCount: 2,
      severityRules: {
        CAMERA_DISCONNECTED: 'HIGH',
      },
    };

    return await prisma.examSession.create({
      data: {
        examId,
        studentUserId: studentId,
        faceProfileId: profileId,
        settingsVersionId: settings.id,
        settingsSnapshot: snapshot,
        status: 'IN_PROGRESS',
        startedAt,
        lastSeenAt,
        expiresAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
      },
    });
  }

  it('ignores healthy sessions with recent verification signals', async () => {
    const startedAt = mockClock.now();
    const lastSeenAt = mockClock.now();
    const session = await createActiveSession(startedAt, lastSeenAt);

    // Advance 5 seconds (interval: 2s, timeout threshold: 2*3 + 5 = 11s)
    mockClock.advanceSeconds(5);

    const result = await watchdog.sweep();
    expect(result.flagged).toBe(0);

    const incidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
    });
    expect(incidents).toHaveLength(0);

    const logs = await prisma.verificationLog.findMany({
      where: { sessionId: session.id },
    });
    expect(logs).toHaveLength(0);
  });

  it('skips silent session if inside startup grace period', async () => {
    const startedAt = mockClock.now();
    const lastSeenAt = mockClock.now();
    const session = await createActiveSession(startedAt, lastSeenAt);

    // Advance 8s (still within 10s startup grace)
    mockClock.advanceSeconds(8);

    const result = await watchdog.sweep();
    expect(result.flagged).toBe(0);

    const incidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
    });
    expect(incidents).toHaveLength(0);
  });

  it('skips session if its in-process verification lock is currently held', async () => {
    const startedAt = mockClock.now();
    const session = await createActiveSession(startedAt, startedAt);

    // Advance past grace and timeout: 20 seconds
    mockClock.advanceSeconds(20);

    // Hold lock on session
    sessionLockManager.acquire(session.id);

    const result = await watchdog.sweep();
    expect(result.flagged).toBe(0);

    const incidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
    });
    expect(incidents).toHaveLength(0);

    // Release lock
    sessionLockManager.release(session.id);
  });

  it('detects silent session past threshold, creates exactly one NO_SIGNAL log and one incident', async () => {
    const startedAt = mockClock.now();
    const session = await createActiveSession(startedAt, startedAt);

    // Advance 20 seconds past startup grace (10s) and silence timeout (11s)
    mockClock.advanceSeconds(20);

    const result = await watchdog.sweep();
    expect(result.flagged).toBe(1);

    // Exactly one incident opened
    const incidents = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
    });
    expect(incidents).toHaveLength(1);
    const incident = incidents[0];
    expect(incident.triggerType).toBe('CAMERA_DISCONNECTED');
    expect(incident.status).toBe('OPEN');
    expect(incident.evidenceStatus).toBe('NOT_AVAILABLE');
    expect(incident.occurrenceCount).toBe(1);
    expect(incident.activeDedupeKey).toBe(`${session.id}:CAMERA_DISCONNECTED`);

    // Exactly one log row with outcome=CAMERA_ERROR, errorCode=NO_SIGNAL
    const logs = await prisma.verificationLog.findMany({
      where: { sessionId: session.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].outcome).toBe('CAMERA_ERROR');
    expect(logs[0].errorCode).toBe('NO_SIGNAL');
    expect(logs[0].triggerId).toBe(incident.id);

    // Second sweep on continuing silence: updates occurrence count, NO extra log row
    mockClock.advanceSeconds(10);
    const result2 = await watchdog.sweep();
    expect(result2.flagged).toBe(0);
    expect(result2.updated).toBe(1);

    const logsAfter = await prisma.verificationLog.findMany({
      where: { sessionId: session.id },
    });
    expect(logsAfter).toHaveLength(1); // Still exactly one log row!

    const incidentsAfter = await prisma.securityTrigger.findMany({
      where: { sessionId: session.id },
    });
    expect(incidentsAfter).toHaveLength(1); // Still exactly one incident!
    expect(incidentsAfter[0].occurrenceCount).toBe(2);
  });

  it('recovers after candidate resumes verification and achieves recovery match count', async () => {
    const startedAt = mockClock.now();
    const session = await createActiveSession(startedAt, startedAt);

    // 1. Silent -> trigger CAMERA_DISCONNECTED
    mockClock.advanceSeconds(20);
    await watchdog.sweep();

    const incident = await prisma.securityTrigger.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(incident.activeDedupeKey).toBe(`${session.id}:CAMERA_DISCONNECTED`);
    expect(incident.recoveredAt).toBeNull();

    // 2. Client signals resume: Match 1
    mockClock.advanceSeconds(2);
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MATCH',
      errorCode: 'NONE',
      similarityPct: 88,
      processingMs: 20,
      now: mockClock.now(),
    });

    const incidentMid = await prisma.securityTrigger.findUniqueOrThrow({
      where: { id: incident.id },
    });
    expect(incidentMid.activeDedupeKey).toBe(`${session.id}:CAMERA_DISCONNECTED`);

    // 3. Match 2 (recoveryMatchCount is 2)
    mockClock.advanceSeconds(2);
    await verificationRecorder.record({
      sessionId: session.id,
      phase: 'CONTINUOUS',
      outcome: 'MATCH',
      errorCode: 'NONE',
      similarityPct: 91,
      processingMs: 22,
      now: mockClock.now(),
    });

    const incidentRecovered = await prisma.securityTrigger.findUniqueOrThrow({
      where: { id: incident.id },
    });
    expect(incidentRecovered.recoveredAt).not.toBeNull();
    expect(incidentRecovered.activeDedupeKey).toBeNull();
  });
});
