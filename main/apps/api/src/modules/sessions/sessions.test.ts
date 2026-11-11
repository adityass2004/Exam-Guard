import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { encryptAesGcm } from '../../lib/crypto.js';
import { SessionExpiryJob } from '../../jobs/expiry.js';
import { IVisionClient, VisionUnavailableError } from '../../lib/vision-client.js';
import { preverifyService } from './preverify.service.js';
import { referenceService } from '../../lib/reference.service.js';

describe('Student Sessions & Pre-Verification Integration Suite', () => {
  let studentCookie: string;
  let studentUser: any;
  let studentProfile: any;
  let approvedFaceProfile: any;
  let activeExam: any;
  let csrfToken: string;

  beforeEach(async () => {
    // 1. CSRF
    await prisma.verificationSetting.updateMany({
      where: { version: { gt: 1 } },
      data: { isActive: false },
    });
    await prisma.verificationSetting.updateMany({
      where: { version: 1 },
      data: { isActive: true },
    });
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body.data.csrfToken;
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    const csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';

    // 2. Student user
    const email = `student_exam_${Date.now()}@examguard.test`;
    const passwordHash = await hashPassword('StudentPass1234!');
    studentUser = await prisma.user.create({
      data: {
        email,
        fullName: 'Jane Doe Examinee',
        passwordHash,
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentId: `STU${Date.now()}`,
            enrollmentStatusCache: 'APPROVED',
          },
        },
      },
      include: { studentProfile: true },
    });

    // 3. Face profile & encrypted centroid
    approvedFaceProfile = await prisma.faceProfile.create({
      data: {
        studentUserId: studentUser.id,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });

    const dummyCentroid = new Float32Array(512).fill(0.04419);
    let norm = 0;
    for (let i = 0; i < 512; i++) norm += dummyCentroid[i] * dummyCentroid[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < 512; i++) dummyCentroid[i] /= norm;

    const enc = encryptAesGcm(Buffer.from(dummyCentroid.buffer), 'EMBEDDING');
    await prisma.faceEmbedding.create({
      data: {
        faceProfileId: approvedFaceProfile.id,
        kind: 'CENTROID',
        ciphertext: Buffer.from(enc.ciphertext),
        encIv: Buffer.from(enc.iv),
        encTag: Buffer.from(enc.tag),
        encKeyVersion: 1,
        dim: 512,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
      },
    });

    // 4. Create Active Exam with questions
    const admin = await prisma.user.create({
      data: {
        email: `admin_seed_${Date.now()}@test.local`,
        fullName: 'Admin Seeder',
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });

    activeExam = await prisma.exam.create({
      data: {
        title: 'Distributed Systems Final',
        durationMinutes: 60,
        status: 'ACTIVE',
        shuffleQuestions: true,
        showScoreAfterSubmit: true,
        createdBy: admin.id,
        questions: {
          create: [
            {
              prompt: 'What does the CAP theorem state?',
              points: 2,
              position: 1,
              options: {
                create: [
                  { label: 'Consistency, Availability, Partition tolerance', isCorrect: true, position: 1 },
                  { label: 'Concurrency, Atomicity, Performance', isCorrect: false, position: 2 },
                  { label: 'Cache, Arithmetic, Pipelining', isCorrect: false, position: 3 },
                ],
              },
            },
            {
              prompt: 'Which consensus algorithm uses leader leases?',
              points: 3,
              position: 2,
              options: {
                create: [
                  { label: 'Raft', isCorrect: true, position: 1 },
                  { label: 'Two-Phase Commit', isCorrect: false, position: 2 },
                ],
              },
            },
          ],
        },
      },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });

    // 5. Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: 'StudentPass1234!' });

    const loginCookies = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie']
      : [loginRes.headers['set-cookie'] as string];
    studentCookie = loginCookies.find((c: string) => c.startsWith('eg_session='))!;
  });

  it('evaluates student eligibility correctly across different candidate states', async () => {
    // 1. Eligible student with approved enrollment
    const res1 = await request(app).get('/api/v1/student/exams').set('Cookie', studentCookie);
    expect(res1.status).toBe(200);
    const examItem1 = res1.body.data.find((e: any) => e.id === activeExam.id);
    expect(examItem1.canStart).toBe(true);
    expect(examItem1.reason).toBeNull();

    // 2. Student without approved profile
    const unapproved = await prisma.user.create({
      data: {
        email: `unapproved_${Date.now()}@test.local`,
        fullName: 'Unapproved Student',
        passwordHash: await hashPassword('StudentPass1234!'),
        role: 'STUDENT',
      },
    });

    const unapprovedCsrf = await request(app).get('/api/v1/auth/csrf');
    const uCookies = unapprovedCsrf.headers['set-cookie'] || [];
    const uCsrfCookie = (Array.isArray(uCookies) ? uCookies : [uCookies]).find((c) => c.startsWith('eg_csrf=')) || '';

    const unapprovedLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', uCsrfCookie)
      .set('X-CSRF-Token', unapprovedCsrf.body.data.csrfToken)
      .send({ email: unapproved.email, password: 'StudentPass1234!' });
    const uLoginCookies = unapprovedLogin.headers['set-cookie'] || [];
    const unapprovedCookie = (Array.isArray(uLoginCookies) ? uLoginCookies : [uLoginCookies]).find((c) => c.startsWith('eg_session=')) || '';

    const res2 = await request(app).get('/api/v1/student/exams').set('Cookie', unapprovedCookie);
    const examItem2 = res2.body.data.find((e: any) => e.id === activeExam.id);
    expect(examItem2.canStart).toBe(false);
    expect(examItem2.reason).toBe('ENROLLMENT_NOT_APPROVED');

    // 3. Suspended student (auth middleware rejects session for suspended account)
    await prisma.user.update({
      where: { id: studentUser.id },
      data: { status: 'SUSPENDED' },
    });
    const res3 = await request(app).get('/api/v1/student/exams').set('Cookie', studentCookie);
    expect(res3.status).toBe(401);
  });

  it('creates session with immutable settings snapshot unaffected by later global settings updates', async () => {
    // 1. Create session
    const createRes = await request(app)
      .post(`/api/v1/student/exams/${activeExam.id}/sessions`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('PENDING_VERIFICATION');
    // Ensure threshold and score rules are concealed
    expect(createRes.body.data.settings.thresholdPct).toBeUndefined();
    expect(createRes.body.data.settings.intervalMs).toBeDefined();

    // Check DB snapshot
    const sessionInDb = await prisma.examSession.findUnique({ where: { id: sessionId } });
    const snapshotBefore = sessionInDb!.settingsSnapshot as any;
    const originalThreshold = snapshotBefore.thresholdPct;

    // 2. Admin creates a new VerificationSetting version with a different threshold
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const newSetting = await prisma.verificationSetting.create({
      data: {
        version: Math.floor(Math.random() * 80000) + 1000,
        isActive: false,
        thresholdPct: 95.0,
        intervalMs: 3000,
        consecutiveMismatchLimit: 5,
        missingFaceLimit: 5,
        multipleFacesPolicy: 'ALERT_IMMEDIATELY',
        multipleFacesConsecutiveLimit: 2,
        cameraFailurePolicy: 'ALERT_IMMEDIATELY',
        cameraGraceSeconds: 10,
        serviceFailureLimit: 3,
        repeatedFailureLimit: 3,
        recoveryMatchCount: 5,
        startupGraceSeconds: 30,
        preExamRequiredMatches: 4,
        minFaceQuality: { minDetScore: 0.8 },
        severityRules: {},
        createdBy: adminUser!.id,
      },
    });

    // 3. Verify session in DB retained its exact original snapshot
    const sessionAfter = await prisma.examSession.findUnique({ where: { id: sessionId } });
    const snapshotAfter = sessionAfter!.settingsSnapshot as any;
    expect(snapshotAfter.thresholdPct).toBe(originalThreshold);
    expect(snapshotAfter.thresholdPct).not.toBe(95.0);

    // Clean up
    await prisma.verificationSetting.delete({ where: { id: newSetting.id } });
  });

  it('runs pre-examination verification with vision test double, gating start until consecutive matches are reached', async () => {
    // 1. Create session
    const createRes = await request(app)
      .post(`/api/v1/student/exams/${activeExam.id}/sessions`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);
    const sessionId = createRes.body.data.id;

    // 2. Start is blocked before verification
    const startBlocked = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/start`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(startBlocked.status).toBe(403);
    expect(startBlocked.body.error.code).toBe('VERIFICATION_REQUIRED');

    // 3. Configure vision test double to simulate verification sequence
    const mockVision: IVisionClient = {
      health: vi.fn().mockResolvedValue({ status: 'OK', modelLoaded: true }),
      diagnostics: vi.fn().mockResolvedValue({
        versions: {},
        executionProviders: [],
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        modelState: 'READY',
        modelPathPresent: true,
        calibrationStatus: 'PROVISIONAL',
        concurrency: { inFlight: 0, limit: 2 },
        lastError: null,
      }),
      quality: vi.fn(),
      embed: vi.fn(),
      verify: vi.fn(),
    };

    // Replace vision client in preverifyService and referenceService for this test
    (preverifyService as any).visionClient = mockVision;
    (referenceService as any).visionClient = mockVision;
    referenceService.clear();

    const dummyFrame = Buffer.from('fake-jpeg-frame-data');

    // Attempt 1: MATCH
    (mockVision.verify as any).mockResolvedValueOnce({
      faceCount: 1,
      faces: [{ box: [10, 10, 100, 100], detScore: 0.95, yaw: 0, pitch: 0, roll: 0, poseSource: 'test' }],
      quality: { blur: 150, brightness: 120, faceSizeRatio: 0.3, faceInFrame: true, poseOk: true },
      similarityRaw: 0.60,
      similarityPct: 85.0,
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      calibrationStatus: 'PROVISIONAL',
      ms: 30,
    });

    const v1Res = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/pre-verification`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', dummyFrame, 'frame.jpg');

    expect(v1Res.status).toBe(200);
    expect(v1Res.body.data.outcome).toBe('MATCH');
    expect(v1Res.body.data.consecutiveMatches).toBe(1);
    expect(v1Res.body.data.readyToStart).toBe(false);

    // Attempt 2: MISMATCH (resets counter)
    (mockVision.verify as any).mockResolvedValueOnce({
      faceCount: 1,
      faces: [{ box: [10, 10, 100, 100], detScore: 0.95, yaw: 0, pitch: 0, roll: 0, poseSource: 'test' }],
      quality: { blur: 150, brightness: 120, faceSizeRatio: 0.3, faceInFrame: true, poseOk: true },
      similarityRaw: 0.25,
      similarityPct: 50.0,
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      calibrationStatus: 'PROVISIONAL',
      ms: 30,
    });

    const v2Res = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/pre-verification`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', dummyFrame, 'frame.jpg');

    expect(v2Res.status).toBe(200);
    expect(v2Res.body.data.outcome).toBe('MISMATCH');
    expect(v2Res.body.data.consecutiveMatches).toBe(0);
    expect(v2Res.body.data.readyToStart).toBe(false);

    // Attempt 3: Vision Service Failure -> Logs VERIFICATION_ERROR with friendly student message
    (mockVision.verify as any).mockRejectedValueOnce(new VisionUnavailableError());

    const v3Res = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/pre-verification`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', dummyFrame, 'frame.jpg');

    expect(v3Res.status).toBe(200);
    expect(v3Res.body.data.outcome).toBe('VERIFICATION_ERROR');
    expect(v3Res.body.data.studentMessage).toBe('Verification service temporarily unavailable');
    expect(v3Res.body.data.consecutiveMatches).toBe(0);

    // Attempt 4 & 5: Two consecutive MATCHes
    for (let i = 0; i < 2; i++) {
      (mockVision.verify as any).mockResolvedValueOnce({
        faceCount: 1,
        faces: [{ box: [10, 10, 100, 100], detScore: 0.95, yaw: 0, pitch: 0, roll: 0, poseSource: 'test' }],
        quality: { blur: 150, brightness: 120, faceSizeRatio: 0.3, faceInFrame: true, poseOk: true },
        similarityRaw: 0.65,
        similarityPct: 90.0,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        calibrationStatus: 'PROVISIONAL',
        ms: 30,
      });

      const res = await request(app)
        .post(`/api/v1/student/sessions/${sessionId}/pre-verification`)
        .set('Cookie', studentCookie)
        .set('X-CSRF-Token', csrfToken)
        .attach('frame', dummyFrame, 'frame.jpg');

      expect(res.status).toBe(200);
      if (i === 1) {
        expect(res.body.data.consecutiveMatches).toBe(2);
        expect(res.body.data.readyToStart).toBe(true);
      }
    }

    // Verify exactly 5 verification log rows were written, all phase PRE_EXAM
    const logs = await prisma.verificationLog.findMany({
      where: { sessionId },
      orderBy: { sequenceNo: 'asc' },
    });
    expect(logs.length).toBe(5);
    for (const log of logs) {
      expect(log.phase).toBe('PRE_EXAM');
    }

    // Verify NO security incident was opened for pre-exam failures
    const incidents = await prisma.securityTrigger.count({
      where: { sessionId },
    });
    expect(incidents).toBe(0);

    // 4. Now start exam succeeds!
    const startRes = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/start`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('IN_PROGRESS');
    expect(startRes.body.data.startedAt).toBeDefined();
    expect(startRes.body.data.expiresAt).toBeDefined();

    // 5. Fetch questions: verify isCorrect is strictly concealed
    const qRes = await request(app)
      .get(`/api/v1/student/sessions/${sessionId}/questions`)
      .set('Cookie', studentCookie);

    expect(qRes.status).toBe(200);
    expect(qRes.body.data.length).toBe(2);
    for (const q of qRes.body.data) {
      for (const opt of q.options) {
        expect(opt.isCorrect).toBeUndefined();
      }
    }

    // 6. Answer question
    const q1 = qRes.body.data[0];
    const chosenOpt = q1.options[0].id;
    const ansRes = await request(app)
      .put(`/api/v1/student/sessions/${sessionId}/answers/${q1.id}`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ optionId: chosenOpt });

    expect(ansRes.status).toBe(200);
    expect(ansRes.body.data.success).toBe(true);

    // 7. Submit session
    const subRes = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/submit`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(subRes.status).toBe(200);
    expect(subRes.body.data.status).toBe('SUBMITTED');

    // Active key must be cleared in DB
    const finalSession = await prisma.examSession.findUnique({ where: { id: sessionId } });
    expect(finalSession!.activeStudentKey).toBeNull();

    // 8. Summary page
    const sumRes = await request(app)
      .get(`/api/v1/student/sessions/${sessionId}/summary`)
      .set('Cookie', studentCookie);

    expect(sumRes.status).toBe(200);
    expect(sumRes.body.data.sessionId).toBe(sessionId);
    expect(sumRes.body.data.score).toBeDefined();
    expect(sumRes.body.data.securityTriggersCount).toBe(0);
  });

  it('enforces ownership isolation: student B cannot view or modify student A session', async () => {
    // 1. Create session for Student A
    const s1Res = await request(app)
      .post(`/api/v1/student/exams/${activeExam.id}/sessions`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);
    const sessionAId = s1Res.body.data.id;

    // 2. Create Student B
    const studentB = await prisma.user.create({
      data: {
        email: `student_b_${Date.now()}@test.local`,
        fullName: 'Student B Intruder',
        passwordHash: await hashPassword('StudentPass1234!'),
        role: 'STUDENT',
        studentProfile: { create: { studentId: `STUB${Date.now()}`, enrollmentStatusCache: 'APPROVED' } },
      },
    });

    const csrfB = await request(app).get('/api/v1/auth/csrf');
    const bCookies = csrfB.headers['set-cookie'] || [];
    const bCsrfCookie = (Array.isArray(bCookies) ? bCookies : [bCookies]).find((c) => c.startsWith('eg_csrf=')) || '';

    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', bCsrfCookie)
      .set('X-CSRF-Token', csrfB.body.data.csrfToken)
      .send({ email: studentB.email, password: 'StudentPass1234!' });
    const bLoginCookies = loginB.headers['set-cookie'] || [];
    const cookieB = (Array.isArray(bLoginCookies) ? bLoginCookies : [bLoginCookies]).find((c) => c.startsWith('eg_session=')) || '';

    // 3. Student B attempts to access Student A's session -> 403 FORBIDDEN
    const getRes = await request(app)
      .get(`/api/v1/student/sessions/${sessionAId}`)
      .set('Cookie', cookieB);
    expect(getRes.status).toBe(403);

    const questionsRes = await request(app)
      .get(`/api/v1/student/sessions/${sessionAId}/questions`)
      .set('Cookie', cookieB);
    expect(questionsRes.status).toBe(403);

    const submitRes = await request(app)
      .post(`/api/v1/student/sessions/${sessionAId}/submit`)
      .set('Cookie', cookieB)
      .set('X-CSRF-Token', csrfToken);
    expect(submitRes.status).toBe(403);
  });

  it('auto-expires overdue sessions via expiry background job with clock injection', async () => {
    // 1. Create session and start it
    const createRes = await request(app)
      .post(`/api/v1/student/exams/${activeExam.id}/sessions`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);
    const sessionId = createRes.body.data.id;

    // Bypass pre-exam verification for timer test by setting consecutive matches directly
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { preExamConsecutiveMatches: 2 },
    });

    const startRes = await request(app)
      .post(`/api/v1/student/sessions/${sessionId}/start`)
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(startRes.status).toBe(200);

    // 2. Advance time 2 hours into the future using a fake Clock
    const fakeNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const fakeClock = { now: () => fakeNow };

    const testExpiryJob = new SessionExpiryJob({
      intervalMs: 1000,
      clock: fakeClock,
    });

    const runResult = await testExpiryJob.runOnce();
    expect(runResult.expiredCount).toBeGreaterThanOrEqual(1);

    // 3. Verify session in DB is now EXPIRED with score computed and lock cleared
    const expiredSession = await prisma.examSession.findUnique({ where: { id: sessionId } });
    expect(expiredSession!.status).toBe('EXPIRED');
    expect(expiredSession!.activeStudentKey).toBeNull();
    expect(expiredSession!.score).toBe(0); // 0 answers submitted
  });
});
