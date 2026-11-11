import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { defaultVisionClient, VisionFaceDetection, VisionQualityMetrics } from '../../lib/vision-client.js';
import { referenceService } from '../../lib/reference.service.js';
import { clientEventsService } from './clientEvents.service.js';

// Dummy 100x100 JPEG buffer with valid FF D8 magic bytes
const VALID_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(200, 0xaa),
]);

const mockFace: VisionFaceDetection = {
  box: [10, 10, 100, 100],
  detScore: 0.95,
  yaw: 0,
  pitch: 0,
  roll: 0,
  poseSource: 'opencv',
};

const mockQuality: VisionQualityMetrics = {
  blur: 60,
  brightness: 120,
  faceSizeRatio: 0.2,
  faceInFrame: true,
  poseOk: true,
  underExposureFraction: 0,
  overExposureFraction: 0,
};

describe('Continuous Verification Pipeline Integration Suite', () => {
  let studentCookie: string;
  let studentId: string;
  let csrfToken: string;
  let examId: string;
  let activeSessionId: string;
  let profileId: string;

  beforeEach(async () => {
    clientEventsService.clearThrottle();

    // 1. Create student user
    const email = `cont_student_${Date.now()}@examguard.test`;
    const passwordHash = await hashPassword('StudentPass1234!');
    const student = await prisma.user.create({
      data: {
        email,
        fullName: 'Continuous Student Tester',
        passwordHash,
        role: 'STUDENT',
      },
    });
    studentId = student.id;

    // Ensure active verification settings exists with 75.0% threshold
    const v1 = await prisma.verificationSetting.findFirst({ where: { version: 1 } });
    if (v1) {
      await prisma.verificationSetting.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await prisma.verificationSetting.update({
        where: { id: v1.id },
        data: { isActive: true, thresholdPct: 75.0 },
      });
    } else {
      await prisma.verificationSetting.create({
        data: {
          version: 1,
          isActive: true,
          thresholdPct: 75.0,
          intervalMs: 1500,
          consecutiveMismatchLimit: 3,
          missingFaceLimit: 3,
          multipleFacesPolicy: 'ALERT_IMMEDIATELY',
          multipleFacesConsecutiveLimit: 2,
          cameraFailurePolicy: 'ALERT_IMMEDIATELY',
          cameraGraceSeconds: 10,
          serviceFailureLimit: 3,
          repeatedFailureLimit: 5,
          recoveryMatchCount: 3,
          startupGraceSeconds: 15,
          preExamRequiredMatches: 2,
          minFaceQuality: {},
          severityRules: {},
          createdBy: studentId,
        },
      });
    }

    // 2. Get CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body.data.csrfToken;
    const cookies = csrfRes.headers['set-cookie'] || [];
    const csrfCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.startsWith('eg_csrf=')
    );

    // 3. Create approved student profile and reference embedding
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

    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        studentId: `STU-${Date.now()}`,
        enrollmentStatusCache: 'APPROVED',
      },
    });

    // Dummy 512 float32 embedding
    const dummyVector = new Float32Array(512);
    for (let i = 0; i < 512; i++) dummyVector[i] = 1.0 / Math.sqrt(512);
    const vectorBuffer = Buffer.from(dummyVector.buffer);

    // Store ciphertext & tag
    await prisma.faceEmbedding.create({
      data: {
        faceProfileId: profile.id,
        kind: 'CENTROID',
        ciphertext: vectorBuffer,
        encIv: Buffer.alloc(12, 1),
        encTag: Buffer.alloc(16, 2),
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        dim: 512,
        encKeyVersion: 1,
      },
    });

    // Mock ReferenceService.load to return a valid base64 centroid without encryption roundtrip in test
    vi.spyOn(referenceService, 'load').mockResolvedValue({
      centroidBase64: Buffer.from(dummyVector.buffer).toString('base64'),
      modelName: 'buffalo_l',
      modelVersion: '1.0',
    });

    // 4. Create active exam with questions
    const exam = await prisma.exam.create({
      data: {
        title: 'Continuous Verification Test Exam',
        durationMinutes: 60,
        status: 'ACTIVE',
        createdBy: studentId,
        questions: {
          create: {
            position: 1,
            prompt: 'Test Question 1',
            points: 1,
            options: {
              create: [
                { position: 1, label: 'Option A', isCorrect: true },
                { position: 2, label: 'Option B', isCorrect: false },
              ],
            },
          },
        },
      },
    });
    examId = exam.id;

    // 5. Login student
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie || '')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: 'StudentPass1234!' });

    const loginCookies = loginRes.headers['set-cookie'] || [];
    studentCookie = (Array.isArray(loginCookies) ? loginCookies : [loginCookies]).find((c) =>
      c.startsWith('eg_session=')
    )!;

    // 6. Create session and start it
    const sessionRes = await request(app)
      .post(`/api/v1/student/exams/${examId}/sessions`)
      .set('Cookie', studentCookie);
    activeSessionId = sessionRes.body.data.id;

    // Mock pre-verification consecutive matches so we can start session
    await prisma.examSession.update({
      where: { id: activeSessionId },
      data: { preExamConsecutiveMatches: 10 },
    });

    const startRes = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/start`)
      .set('Cookie', studentCookie);
    expect(startRes.status).toBe(200);
  });

  it('runs continuous verification cycle with MATCH and returns concealed student response', async () => {
    // Mock vision verify returning 85% match
    vi.spyOn(defaultVisionClient, 'verify').mockResolvedValue({
      faceCount: 1,
      faces: [mockFace],
      quality: mockQuality,
      similarityRaw: 0.58,
      similarityPct: 85.0,
      calibrationStatus: 'PROVISIONAL',
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      ms: 25.0,
    });

    const storageFilesBefore = fs.existsSync('./storage') ? fs.readdirSync('./storage').length : 0;

    const res = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Truthful student responses without sensitive score or thresholds
    expect(data.outcome).toBe('MATCH');
    expect(data.studentMessage).toBe('Identity verified');
    expect(data.statusCode).toBe('IDENTITY_VERIFIED');
    expect(data.activeWarning).toBe(false);
    expect(data.nextIntervalMs).toBeGreaterThanOrEqual(500);
    expect(data.serverNow).toBeDefined();

    // Sensitive numbers MUST be omitted
    expect(data.similarityPct).toBeUndefined();
    expect(data.similarityRaw).toBeUndefined();
    expect(data.thresholdPct).toBeUndefined();
    expect(data.limits).toBeUndefined();

    // Verify exactly 1 verification log row was written
    const logs = await prisma.verificationLog.findMany({
      where: { sessionId: activeSessionId },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].phase).toBe('CONTINUOUS');
    expect(logs[0].outcome).toBe('MATCH');
    expect(logs[0].similarityPct).toBe(85.0);

    // Verify session counters
    const session = await prisma.examSession.findUniqueOrThrow({
      where: { id: activeSessionId },
    });
    expect(session.totalAttempts).toBe(1);
    expect(session.matchCount).toBe(1);
    expect(session.lastOutcome).toBe('MATCH');

    // Verify NO files were written to storage
    const storageFilesAfter = fs.existsSync('./storage') ? fs.readdirSync('./storage').length : 0;
    expect(storageFilesAfter).toBe(storageFilesBefore);
  });

  it('runs continuous verification cycle with MISMATCH and returns friendly UI warning', async () => {
    vi.spyOn(defaultVisionClient, 'verify').mockResolvedValue({
      faceCount: 1,
      faces: [mockFace],
      quality: mockQuality,
      similarityRaw: 0.25,
      similarityPct: 40.0,
      calibrationStatus: 'PROVISIONAL',
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      ms: 22.0,
    });

    const res = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('MISMATCH');
    expect(res.body.data.statusCode).toBe('IDENTITY_NOT_CONFIRMED');
    expect(res.body.data.studentMessage).toBe('Identity could not be confirmed');
    expect(res.body.data.activeWarning).toBe(true);

    const session = await prisma.examSession.findUniqueOrThrow({
      where: { id: activeSessionId },
    });
    expect(session.mismatchCount).toBe(1);
    expect(session.lastOutcome).toBe('MISMATCH');
  });

  it('handles NO_FACE and MULTIPLE_FACES correctly', async () => {
    // 1. NO_FACE
    vi.spyOn(defaultVisionClient, 'verify').mockResolvedValue({
      faceCount: 0,
      faces: [],
      quality: {
        blur: 0,
        brightness: 0,
        faceSizeRatio: 0,
        faceInFrame: false,
        poseOk: false,
        underExposureFraction: 0,
        overExposureFraction: 0,
      },
      calibrationStatus: 'PROVISIONAL',
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      ms: 15.0,
    });

    const resNoFace = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(resNoFace.status).toBe(200);
    expect(resNoFace.body.data.outcome).toBe('NO_FACE');
    expect(resNoFace.body.data.statusCode).toBe('FACE_NOT_DETECTED');

    // 2. MULTIPLE_FACES
    vi.spyOn(defaultVisionClient, 'verify').mockResolvedValue({
      faceCount: 2,
      faces: [
        mockFace,
        {
          box: [150, 10, 240, 100],
          detScore: 0.88,
          yaw: 0,
          pitch: 0,
          roll: 0,
          poseSource: 'opencv',
        },
      ],
      quality: mockQuality,
      calibrationStatus: 'PROVISIONAL',
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      ms: 28.0,
    });

    const resMultiFace = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(resMultiFace.status).toBe(200);
    expect(resMultiFace.body.data.outcome).toBe('MULTIPLE_FACES');
    expect(resMultiFace.body.data.statusCode).toBe('MULTIPLE_FACES');

    const session = await prisma.examSession.findUniqueOrThrow({
      where: { id: activeSessionId },
    });
    expect(session.noFaceCount).toBe(1);
    expect(session.multiFaceCount).toBe(1);
    expect(session.totalAttempts).toBe(2);
  });

  it('rejects concurrent verification requests with 409 VERIFICATION_IN_PROGRESS', async () => {
    let unblockVision: (() => void) | null = null;
    const visionPromise = new Promise<any>((resolve) => {
      unblockVision = () =>
        resolve({
          faceCount: 1,
          faces: [mockFace],
          quality: mockQuality,
          similarityPct: 80.0,
          calibrationStatus: 'PROVISIONAL',
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          ms: 20.0,
        });
    });

    vi.spyOn(defaultVisionClient, 'verify').mockImplementation(() => visionPromise as any);

    // Launch first request (initiate promise without awaiting it yet)
    const req1Promise = request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg')
      .then((res) => res);

    // Give req1 a moment to acquire the in-process session lock
    await new Promise((r) => setTimeout(r, 100));

    // Launch second request while first is in flight
    const req2 = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(req2.status).toBe(409);
    expect(req2.body.error?.code).toBe('VERIFICATION_IN_PROGRESS');

    // Unblock first request
    unblockVision!();
    const res1 = await req1Promise;
    expect(res1.status).toBe(200);

    // Exactly 1 log row was created; the 409 was rejected before recording
    const logs = await prisma.verificationLog.findMany({
      where: { sessionId: activeSessionId },
    });
    expect(logs).toHaveLength(1);
  });

  it('processes CAMERA_ERROR client event and throttles rapid duplicates', async () => {
    // 1. First camera event accepted
    const res1 = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/client-events`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        type: 'CAMERA_ERROR',
        errorCode: 'CAMERA_PERMISSION_DENIED',
        detail: 'User revoked webcam permission during exam',
      });

    expect(res1.status).toBe(200);
    expect(res1.body.data.logged).toBe(true);

    // 2. Duplicate within 1 second is throttled
    const res2 = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/client-events`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        type: 'CAMERA_ERROR',
        errorCode: 'CAMERA_PERMISSION_DENIED',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.data.logged).toBe(false);

    // Exactly 1 CAMERA_ERROR log row was created
    const logs = await prisma.verificationLog.findMany({
      where: { sessionId: activeSessionId, outcome: 'CAMERA_ERROR' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].errorCode).toBe('CAMERA_PERMISSION_DENIED');

    const session = await prisma.examSession.findUniqueOrThrow({
      where: { id: activeSessionId },
    });
    expect(session.cameraErrorCount).toBe(1);
  });

  it('proves snapshot immunity: later global settings changes do NOT alter active session threshold', async () => {
    // Session was created with default snapshot threshold 75.0%
    // Verify 78.0% similarity yields MATCH under original snapshot
    vi.spyOn(defaultVisionClient, 'verify').mockResolvedValue({
      faceCount: 1,
      faces: [mockFace],
      quality: mockQuality,
      similarityPct: 78.0,
      calibrationStatus: 'PROVISIONAL',
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      ms: 20.0,
    });

    const resBefore = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(resBefore.status).toBe(200);
    expect(resBefore.body.data.outcome).toBe('MATCH');

    // Create a new global verification settings version with threshold = 85.0%
    await prisma.verificationSetting.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    const maxVer = await prisma.verificationSetting.findFirst({
      orderBy: { version: 'desc' },
    });
    const nextVer = (maxVer?.version ?? 5000) + 1;
    await prisma.verificationSetting.create({
      data: {
        version: nextVer,
        isActive: true,
        thresholdPct: 85.0,
        intervalMs: 1500,
        consecutiveMismatchLimit: 3,
        missingFaceLimit: 4,
        multipleFacesPolicy: 'ALERT_IMMEDIATELY',
        multipleFacesConsecutiveLimit: 2,
        cameraFailurePolicy: 'ALERT_AFTER_GRACE',
        cameraGraceSeconds: 6,
        serviceFailureLimit: 3,
        repeatedFailureLimit: 6,
        recoveryMatchCount: 3,
        startupGraceSeconds: 10,
        preExamRequiredMatches: 2,
        minFaceQuality: {},
        severityRules: {},
        createdBy: studentId,
        changeNote: 'Tightened global threshold to 85%',
      },
    });

    // Run verification again with 78.0% similarity -> still MATCH because snapshot threshold is 75%
    const resAfter = await request(app)
      .post(`/api/v1/student/sessions/${activeSessionId}/verifications`)
      .set('Cookie', studentCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .attach('frame', VALID_JPEG, 'frame.jpg');

    expect(resAfter.status).toBe(200);
    expect(resAfter.body.data.outcome).toBe('MATCH');
  });
});
