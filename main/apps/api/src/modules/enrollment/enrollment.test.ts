import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { enrollmentService } from './enrollment.service.js';
import type { IVisionClient, VisionEmbedResponse, VisionQualityResponse } from '../../lib/vision-client.js';
import { BIOMETRIC_CONSENT_POLICY_VERSION, type FaceAngle } from '@examguard/shared';

// Create a controlled Vision Test Double that returns valid face measurements and embeddings
class VisionTestDouble implements IVisionClient {
  public sampleVectors: Record<FaceAngle, Float32Array>;

  constructor() {
    // 5 similar 512-d unit vectors (cosine similarity ~ 0.95)
    this.sampleVectors = {
      FRONT: new Float32Array(512).fill(0.04419),
      LEFT: new Float32Array(512).fill(0.04419),
      RIGHT: new Float32Array(512).fill(0.04419),
      UP: new Float32Array(512).fill(0.04419),
      DOWN: new Float32Array(512).fill(0.04419),
    };
    // Normalize each to exact unit length
    for (const angle of Object.keys(this.sampleVectors) as FaceAngle[]) {
      const vec = this.sampleVectors[angle];
      let norm = 0;
      for (let i = 0; i < 512; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm);
      for (let i = 0; i < 512; i++) vec[i] /= norm;
    }
  }

  async health() {
    return { status: 'OK' as const, modelLoaded: true };
  }

  async diagnostics() {
    return {
      versions: {},
      executionProviders: ['CPUExecutionProvider'],
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      modelState: 'READY',
      modelPathPresent: true,
      calibrationStatus: 'PROVISIONAL' as const,
      concurrency: { inFlight: 0, limit: 2 },
      lastError: null,
    };
  }

  async quality(_buf: Buffer, angle?: string): Promise<VisionQualityResponse> {
    const target = (angle as FaceAngle) || 'FRONT';
    let yaw = 0;
    let pitch = 0;

    if (target === 'LEFT') yaw = 25;
    if (target === 'RIGHT') yaw = -25;
    if (target === 'UP') pitch = 20;
    if (target === 'DOWN') pitch = -20;

    return {
      faceCount: 1,
      faces: [
        {
          box: [100, 80, 300, 320],
          detScore: 0.98,
          yaw,
          pitch,
          roll: 1.0,
          poseSource: 'insightface_3d_68',
        },
      ],
      quality: {
        blur: 150.0,
        brightness: 125.0,
        faceSizeRatio: 0.25,
        faceInFrame: true,
        poseOk: true,
        underExposureFraction: 0.01,
        overExposureFraction: 0.01,
      },
      reasons: [],
      ms: 25.0,
    };
  }

  async embed(_buf: Buffer, angle?: string): Promise<VisionEmbedResponse> {
    const q = await this.quality(_buf, angle);
    const target = (angle as FaceAngle) || 'FRONT';
    const vec = this.sampleVectors[target];
    const b64 = Buffer.from(vec.buffer).toString('base64');

    return {
      ...q,
      embedding: b64,
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      dim: 512,
    };
  }

  async verify(params: {
    imageBuffer: Buffer;
    reference: string;
    samples?: string[];
  }) {
    const q = await this.quality(params.imageBuffer);
    return {
      ...q,
      similarityRaw: 0.85,
      similarityPct: 92.5,
      modelName: 'buffalo_l',
      modelVersion: '1.0',
      calibrationStatus: 'PROVISIONAL' as const,
    };
  }
}

describe('Student Enrollment Integration Test Suite', () => {
  const visionDouble = new VisionTestDouble();
  let studentCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let studentUserId: string;
  let sampleJpeg: Buffer;

  beforeAll(async () => {
    // Inject Vision Test Double into EnrollmentService
    (enrollmentService as any).visionClient = visionDouble;

    // Create a real JPEG buffer for uploads
    sampleJpeg = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    // 1. Get CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
    csrfToken = csrfRes.body.data.csrfToken;

    // 2. Register fresh student user
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `enrollment.student.${unique}@test.local`;
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email,
        password: 'Password123!@#$',
        fullName: 'Test Enrollment Candidate',
        studentId: `STU-ENR-${unique}`,
      });

    studentUserId = regRes.body.data.user.id;

    // 3. Login to get authenticated session cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email,
        password: 'Password123!@#$',
      });

    const loginCookies = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie']
      : [loginRes.headers['set-cookie'] as string];
    studentCookie = loginCookies.find((c) => c.startsWith('eg_session=')) || '';
  });

  it('POST /student/enrollment/start fails with 403 when consent has not been granted', async () => {
    const res = await request(app)
      .post('/api/v1/student/enrollment/start')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('POST /student/consent/biometric records consent in consent_records table', async () => {
    const res = await request(app)
      .post('/api/v1/student/consent/biometric')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        accepted: true,
        policyVersion: BIOMETRIC_CONSENT_POLICY_VERSION,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.granted).toBe(true);

    const record = await prisma.consentRecord.findFirst({
      where: { userId: studentUserId },
    });
    expect(record).toBeDefined();
    expect(record?.granted).toBe(true);
  });

  it('POST /student/enrollment/start creates a DRAFT face profile (idempotent)', async () => {
    const res = await request(app)
      .post('/api/v1/student/enrollment/start')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.data.hasConsent).toBe(true);
    expect(res.body.data.profile.status).toBe('DRAFT');
    expect(res.body.data.profile.progress).toBe(0);

    // Call start a second time: must be idempotent and return same draft
    const res2 = await request(app)
      .post('/api/v1/student/enrollment/start')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken);

    expect(res2.status).toBe(200);
    expect(res2.body.data.profile.id).toBe(res.body.data.profile.id);
  });

  it('POST /student/enrollment/preview-check returns live quality metrics without DB writes', async () => {
    const initialImagesCount = await prisma.faceEnrollmentImage.count();

    const res = await request(app)
      .post('/api/v1/student/enrollment/preview-check')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .field('angle', 'FRONT')
      .attach('frame', sampleJpeg, 'preview.jpg');

    expect(res.status).toBe(200);
    expect(res.body.data.acceptable).toBe(true);
    expect(res.body.data.quality.blur).toBeGreaterThan(0);

    // Assert zero DB writes occurred
    const postCount = await prisma.faceEnrollmentImage.count();
    expect(postCount).toBe(initialImagesCount);
  });

  it('captures all 5 angles, verifying encrypted storage and no raw images in MySQL', async () => {
    const angles: FaceAngle[] = ['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'];

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      const res = await request(app)
        .post('/api/v1/student/enrollment/captures')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${studentCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .field('angle', angle)
        .attach('frame', sampleJpeg, `${angle.toLowerCase()}.jpg`);

      expect(res.status).toBe(201);
      expect(res.body.data.angle).toBe(angle);
      expect(res.body.data.progress).toBe(i + 1);
    }

    // Verify 5 images stored in face_enrollment_images
    const storedRows = await prisma.faceEnrollmentImage.findMany({
      where: { faceProfile: { studentUserId } },
    });
    expect(storedRows.length).toBe(5);

    // Verify each stored row has relativePath, valid encryption IV and tag, and NO raw image bytes in DB
    for (const row of storedRows) {
      expect(row.storagePath).toMatch(/^enrollment\/[a-f0-9]{2}\/[a-f0-9-]+\.bin$/);
      expect(row.encIv.length).toBe(12);
      expect(row.encTag.length).toBe(16);
      expect((row as any).bytes).toBeUndefined();
    }

    // Verify 5 sample embeddings stored encrypted
    const embeddings = await prisma.faceEmbedding.findMany({
      where: { faceProfile: { studentUserId }, kind: 'SAMPLE' },
    });
    expect(embeddings.length).toBe(5);
    for (const emb of embeddings) {
      expect(emb.ciphertext.length).toBe(512 * 4); // 2048 bytes
      expect(emb.encIv.length).toBe(12);
      expect(emb.encTag.length).toBe(16);
    }
  });

  it('DELETE /student/enrollment/captures/:angle allows retaking an angle', async () => {
    // Delete UP capture
    const delRes = await request(app)
      .delete('/api/v1/student/enrollment/captures/UP')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken);

    expect(delRes.status).toBe(200);

    // Check status now shows 4/5
    const statusRes = await request(app)
      .get('/api/v1/student/enrollment')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`);

    expect(statusRes.body.data.profile.progress).toBe(4);
    expect(statusRes.body.data.profile.angles.UP.captured).toBe(false);

    // Re-capture UP
    const reCap = await request(app)
      .post('/api/v1/student/enrollment/captures')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .field('angle', 'UP')
      .attach('frame', sampleJpeg, 'up-retake.jpg');

    expect(reCap.status).toBe(201);
    expect(reCap.body.data.progress).toBe(5);
  });

  it('POST /student/enrollment/finalize rejects inconsistent samples', async () => {
    // Modify one sample vector in test double to be completely orthogonal
    const originalDown = visionDouble.sampleVectors.DOWN;
    const orthogonal = new Float32Array(512);
    orthogonal[0] = 1.0; // Point in a single dimension
    visionDouble.sampleVectors.DOWN = orthogonal;

    // Retake DOWN with the inconsistent vector
    await request(app)
      .post('/api/v1/student/enrollment/captures')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .field('angle', 'DOWN')
      .attach('frame', sampleJpeg, 'down.jpg');

    // Finalize should reject with ENROLLMENT_INCONSISTENT
    const res = await request(app)
      .post('/api/v1/student/enrollment/finalize')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ENROLLMENT_INCONSISTENT');
    expect(res.body.error.details.inconsistentAngles).toContain('DOWN');

    // Restore consistent vector and retake DOWN
    visionDouble.sampleVectors.DOWN = originalDown;
    await request(app)
      .post('/api/v1/student/enrollment/captures')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .field('angle', 'DOWN')
      .attach('frame', sampleJpeg, 'down-clean.jpg');
  });

  it('POST /student/enrollment/finalize computes unit-norm centroid and transitions to PENDING_APPROVAL', async () => {
    const res = await request(app)
      .post('/api/v1/student/enrollment/finalize')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');

    // Verify exactly 1 CENTROID in database for this profile
    const centroids = await prisma.faceEmbedding.findMany({
      where: {
        faceProfileId: res.body.data.profileId,
        kind: 'CENTROID',
      },
    });
    expect(centroids.length).toBe(1);
    expect(centroids[0].angle).toBeNull();
    expect(centroids[0].ciphertext.length).toBe(512 * 4);

    // Verify student profile status cache updated
    const stuProfile = await prisma.studentProfile.findUnique({
      where: { userId: studentUserId },
    });
    expect(stuProfile?.enrollmentStatusCache).toBe('PENDING_APPROVAL');
  });

  it('GET /student/dashboard returns real populated student dashboard data', async () => {
    const res = await request(app)
      .get('/api/v1/student/dashboard')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.profile.fullName).toBe('Test Enrollment Candidate');
    expect(data.enrollment.status).toBe('PENDING_APPROVAL');
    expect(data.enrollment.hasConsent).toBe(true);
    expect(data.availableExams.length).toBeGreaterThan(0); // seeded demo exam
    expect(data.availableExams[0].canStart).toBe(false); // pending approval
    expect(data.availableExams[0].eligibilityReason).toBe('Enrollment must be approved first');
    expect(data.verificationSummary.totalAttempts).toBe(0);
  });

  it('POST /student/biometric-deletion-requests creates pending deletion request', async () => {
    const res = await request(app)
      .post('/api/v1/student/biometric-deletion-requests')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${studentCookie}; ${csrfCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ reason: 'Graduated candidate' });

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('PENDING');

    const reqRow = await prisma.dataDeletionRequest.findUnique({
      where: { id: res.body.data.id },
    });
    expect(reqRow).toBeDefined();
    expect(reqRow?.studentUserId).toBe(studentUserId);
  });
});
