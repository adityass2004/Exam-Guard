import crypto from 'node:crypto';
import fs from 'node:fs';
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resolveSafeStoragePath, storeEncryptedImage } from '../../lib/storage.js';
import { hashPassword } from '../../lib/password.js';
import {
  EnrollmentStatus,
  FaceAngle,
  UserRole,
  UserStatus,
  VerificationOutcome,
  VerificationPhase,
} from '@prisma/client';

describe('Admin Portal & Face Gallery Integration Test Suite (Prompt 04)', () => {
  let adminCookie: string;
  let studentCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let adminUserId: string;
  let studentUserId: string;
  let studentEmail: string;
  let studentProfileId: string;
  let enrollmentImageId: string;
  let imageStoragePath: string;
  let sampleJpeg: Buffer;

  beforeAll(async () => {
    // Generate clean synthetic non-face JPEG for testing
    sampleJpeg = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 120, g: 180, b: 240 },
      },
    })
      .jpeg()
      .toBuffer();

    // 1. Get CSRF Token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
    csrfToken = csrfRes.body.data.csrfToken;

    // 2. Create Admin Account
    const unique = crypto.randomUUID().slice(0, 8);
    const adminEmail = `admin.${unique}@test.local`;
    const adminPassword = 'AdminSecret1234!';
    const adminPassHash = await hashPassword(adminPassword);

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Test Administrator',
        passwordHash: adminPassHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    adminUserId = adminUser.id;

    // Login as Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: adminEmail, password: adminPassword });

    expect(adminLoginRes.status).toBe(200);
    const adminSetCookie = adminLoginRes.headers['set-cookie'];
    const adminCookies = Array.isArray(adminSetCookie) ? adminSetCookie : [adminSetCookie as string];
    adminCookie = adminCookies.find((c) => c.startsWith('eg_session=')) || '';

    // 3. Register Student Account
    studentEmail = `student.gallery.${unique}@test.local`;
    const studentPassword = 'StudentSecret1234!';
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        studentId: `STU-${unique}`,
        fullName: 'Gallery Candidate',
        email: studentEmail,
        password: studentPassword,
      });

    expect(regRes.status).toBe(201);
    studentUserId = regRes.body.data.user.id;

    // Login as Student
    const studentLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: studentEmail, password: studentPassword });

    expect(studentLoginRes.status).toBe(200);
    const studentSetCookies = Array.isArray(studentLoginRes.headers['set-cookie'])
      ? studentLoginRes.headers['set-cookie']
      : [studentLoginRes.headers['set-cookie'] as string];
    studentCookie = studentSetCookies.find((c) => c.startsWith('eg_session=')) || '';

    // 4. Create an Enrollment Profile fixture with 5 encrypted images in storage
    const stored = await storeEncryptedImage({ kind: 'enrollment', bytes: sampleJpeg });
    imageStoragePath = stored.relativePath;

    const profile = await prisma.faceProfile.create({
      data: {
        studentUserId,
        version: 1,
        status: EnrollmentStatus.PENDING_APPROVAL,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
        consistencyMinObserved: 0.88,
        submittedAt: new Date(),
        qualitySummary: { blur: 150, luminance: 120 },
      },
    });
    studentProfileId = profile.id;

    const img = await prisma.faceEnrollmentImage.create({
      data: {
        faceProfileId: profile.id,
        angle: FaceAngle.FRONT,
        storagePath: stored.relativePath,
        sha256: stored.sha256,
        mime: stored.mime,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        encIv: new Uint8Array(stored.iv),
        encTag: new Uint8Array(stored.tag),
        encKeyVersion: stored.keyVersion,
        quality: { blurScore: 160, luminance: 125, reasons: [] },
        capturedAt: new Date(),
      },
    });
    enrollmentImageId = img.id;

    // Add remaining 4 angles
    for (const ang of [FaceAngle.LEFT, FaceAngle.RIGHT, FaceAngle.UP, FaceAngle.DOWN]) {
      const s = await storeEncryptedImage({ kind: 'enrollment', bytes: sampleJpeg });
      await prisma.faceEnrollmentImage.create({
        data: {
          faceProfileId: profile.id,
          angle: ang,
          storagePath: s.relativePath,
          sha256: s.sha256,
          mime: s.mime,
          byteSize: s.byteSize,
          width: s.width,
          height: s.height,
          encIv: new Uint8Array(s.iv),
          encTag: new Uint8Array(s.tag),
          encKeyVersion: s.keyVersion,
          quality: { blurScore: 140, luminance: 120, reasons: [] },
          capturedAt: new Date(),
        },
      });
    }

    // Add dummy embedding
    await prisma.faceEmbedding.create({
      data: {
        faceProfileId: profile.id,
        kind: 'CENTROID',
        dim: 512,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        ciphertext: new Uint8Array(Buffer.alloc(200)),
        encIv: new Uint8Array(Buffer.alloc(12)),
        encTag: new Uint8Array(Buffer.alloc(16)),
        encKeyVersion: 1,
      },
    });

    // Update studentProfile cache to PENDING_APPROVAL
    await prisma.studentProfile.update({
      where: { userId: studentUserId },
      data: { enrollmentStatusCache: EnrollmentStatus.PENDING_APPROVAL },
    });
  });

  describe('1. Admin Dashboard Aggregates & Metrics', () => {
    it('returns honest calculated aggregate counts and definitions', async () => {
      // Create verification log fixtures to test standard outcome definitions
      let activeSetting = await prisma.verificationSetting.findFirst({
        where: { isActive: true },
      });
      if (!activeSetting) {
        const v1 = await prisma.verificationSetting.findFirst({ where: { version: 1 } });
        if (v1) {
          activeSetting = await prisma.verificationSetting.update({
            where: { id: v1.id },
            data: { isActive: true },
          });
        } else {
          activeSetting = await prisma.verificationSetting.create({
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
              createdBy: adminUserId,
            },
          });
        }
      }
      const settingId = activeSetting.id;

      const dummyExam = await prisma.exam.create({
        data: {
          title: 'Dashboard Test Exam',
          durationMinutes: 60,
          status: 'ACTIVE',
          createdBy: adminUserId,
          verificationSettingsId: settingId,
        },
      });

      const dummySession = await prisma.examSession.create({
        data: {
          examId: dummyExam.id,
          studentUserId,
          faceProfileId: studentProfileId,
          settingsVersionId: settingId,
          settingsSnapshot: {},
          status: 'IN_PROGRESS',
        },
      });

      // 1 MATCH, 1 MISMATCH, 1 CAMERA_ERROR (unverified)
      await prisma.verificationLog.createMany({
        data: [
          {
            sessionId: dummySession.id,
            studentUserId,
            examId: dummyExam.id,
            sequenceNo: 1,
            phase: VerificationPhase.CONTINUOUS,
            outcome: VerificationOutcome.MATCH,
            thresholdPct: 75.0,
            processingMs: 40,
            settingsVersionId: settingId,
          },
          {
            sessionId: dummySession.id,
            studentUserId,
            examId: dummyExam.id,
            sequenceNo: 2,
            phase: VerificationPhase.CONTINUOUS,
            outcome: VerificationOutcome.MISMATCH,
            thresholdPct: 75.0,
            processingMs: 45,
            settingsVersionId: settingId,
          },
          {
            sessionId: dummySession.id,
            studentUserId,
            examId: dummyExam.id,
            sequenceNo: 3,
            phase: VerificationPhase.CONTINUOUS,
            outcome: VerificationOutcome.CAMERA_ERROR,
            thresholdPct: 75.0,
            processingMs: 10,
            settingsVersionId: settingId,
          },
        ],
      });

      // 1 OPEN security trigger (active incident)
      await prisma.securityTrigger.create({
        data: {
          incidentCode: `INC-${Date.now().toString(36).toUpperCase()}`,
          sessionId: dummySession.id,
          studentUserId,
          examId: dummyExam.id,
          triggerType: 'IDENTITY_MISMATCH',
          severity: 'HIGH',
          status: 'OPEN',
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
          occurrenceCount: 1,
          firstVerificationLogId: 2,
          lastVerificationLogId: 2,
          evidenceStatus: 'NOT_AVAILABLE',
        },
      });

      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const { metrics, pendingApprovals, recentActions } = res.body.data;

      expect(metrics.totalStudents).toBeGreaterThanOrEqual(1);
      expect(metrics.pendingEnrollmentApprovals).toBeGreaterThanOrEqual(1);
      expect(metrics.activeExams).toBeGreaterThanOrEqual(1);
      expect(metrics.activeSessions).toBeGreaterThanOrEqual(1);
      expect(metrics.totalVerificationAttempts).toBeGreaterThanOrEqual(3);
      expect(metrics.successfulVerifications).toBeGreaterThanOrEqual(1);
      expect(metrics.failedVerifications).toBeGreaterThanOrEqual(1);
      expect(metrics.unverifiedVerifications).toBeGreaterThanOrEqual(1);
      expect(metrics.activeSecurityIncidents).toBeGreaterThanOrEqual(1);

      expect(Array.isArray(pendingApprovals)).toBe(true);
      expect(Array.isArray(recentActions)).toBe(true);
    });
  });

  describe('2. Student Management & Security Actions', () => {
    it('lists students with search, filters, and pagination', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students?search=${encodeURIComponent('Gallery')}&enrollmentStatus=PENDING_APPROVAL`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].fullName).toBe('Gallery Candidate');
    });

    it('safely handles SQL injection strings without error or execution', async () => {
      const injectionPayload = "'; DROP TABLE users; -- ' OR 1=1 --";
      const res = await request(app)
        .get(`/api/v1/admin/students?search=${encodeURIComponent(injectionPayload)}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]); // Safe empty result, table remains intact
    });

    it('retrieves detailed student profile', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${studentUserId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(studentUserId);
      expect(res.body.data.enrollmentSummary.totalVersions).toBe(1);
      expect(res.body.data.sessions).toEqual([]);
    });

    it('suspends student account and immediately revokes all active sessions', async () => {
      // Suspend student
      const patchRes = await request(app)
        .patch(`/api/v1/admin/students/${studentUserId}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'SUSPENDED' });

      expect(patchRes.status).toBe(200);

      // Verify student session is now invalid (401)
      const testSessionRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', studentCookie);

      expect(testSessionRes.status).toBe(401);

      // Reactivate student
      const reactivateRes = await request(app)
        .patch(`/api/v1/admin/students/${studentUserId}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'ACTIVE' });

      expect(reactivateRes.status).toBe(200);
    });

    it('resets student password with strong temporary password, forces change, and verifies change-password flow', async () => {
      const resetRes = await request(app)
        .post(`/api/v1/admin/students/${studentUserId}/reset-password`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(resetRes.status).toBe(200);
      const { temporaryPassword } = resetRes.body.data;
      expect(temporaryPassword).toBeDefined();
      expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);

      // Student logs in with temporary password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: studentEmail, password: temporaryPassword });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.mustChangePassword).toBe(true);

      const newStudentCookies = loginRes.headers['set-cookie'];
      const newStudentCookie = Array.isArray(newStudentCookies)
        ? newStudentCookies.find((c) => c.startsWith('eg_session='))
        : (newStudentCookies as string);

      // Student changes password
      const changePassRes = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${newStudentCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'BrandNewPermanentPass123!',
        });

      expect(changePassRes.status).toBe(200);

      // Verify mustChangePassword is now false
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', newStudentCookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.mustChangePassword).toBe(false);
    });
  });

  describe('3. Candidate Face Gallery Payload & Re-enrollment History', () => {
    it('returns all 5 angles with authorized URLs and NO embeddings or ciphertext', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/students/${studentUserId}/face-gallery`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const { student, profiles } = res.body.data;

      expect(student.id).toBe(studentUserId);
      expect(profiles.length).toBe(1);

      const p1 = profiles[0];
      expect(p1.version).toBe(1);
      expect(p1.status).toBe('PENDING_APPROVAL');
      expect(p1.images.length).toBe(5);

      // Verify no biometric embeddings or ciphertexts exist in the response
      const jsonString = JSON.stringify(res.body);
      expect(jsonString).not.toContain('ciphertext');
      expect((p1 as any).embeddings).toBeUndefined();
      expect((p1 as any).embedding).toBeUndefined();

      // Verify authorized image URL format
      const frontImg = p1.images.find((i: any) => i.angle === 'FRONT');
      expect(frontImg).toBeDefined();
      expect(frontImg.authorizedImageUrl).toBe(`/api/v1/admin/images/enrollment/${frontImg.id}`);
    });
  });

  describe('4. Secure Image Access Service & Protections', () => {
    it('refuses image access without authentication (401)', async () => {
      const res = await request(app).get(`/api/v1/admin/images/enrollment/${enrollmentImageId}`);
      expect(res.status).toBe(401);
    });

    it('refuses image access with a student session (403)', async () => {
      // Re-login student to get active session
      const studentLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: studentEmail, password: 'BrandNewPermanentPass123!' });

      const studentCookies = studentLoginRes.headers['set-cookie'];
      const activeStudentCookie = Array.isArray(studentCookies)
        ? studentCookies.find((c) => c.startsWith('eg_session='))
        : (studentCookies as string);

      const res = await request(app)
        .get(`/api/v1/admin/images/enrollment/${enrollmentImageId}`)
        .set('Cookie', activeStudentCookie);

      expect(res.status).toBe(403);
    });

    it('streams decrypted image bytes with strict security headers and audits access', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/images/enrollment/${enrollmentImageId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('no-store, private');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(100);

      // Verify audit record exists
      const auditLog = await prisma.adminAuditLog.findFirst({
        where: {
          action: 'ENROLLMENT_IMAGE_ACCESSED',
          entityId: enrollmentImageId,
        },
        orderBy: { id: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.actorUserId).toBe(adminUserId);
    });

    it('fails safely with 409 and audit log when image file is tampered with', async () => {
      // Create a separate image fixture to tamper
      const stored = await storeEncryptedImage({ kind: 'enrollment', bytes: sampleJpeg });
      const tamperProfile = await prisma.faceProfile.create({
        data: {
          studentUserId,
          version: 10,
          status: 'DRAFT',
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          embeddingDim: 512,
        },
      });

      const img = await prisma.faceEnrollmentImage.create({
        data: {
          faceProfileId: tamperProfile.id,
          angle: FaceAngle.FRONT,
          storagePath: stored.relativePath,
          sha256: stored.sha256,
          mime: stored.mime,
          byteSize: stored.byteSize,
          width: stored.width,
          height: stored.height,
          encIv: new Uint8Array(stored.iv),
          encTag: new Uint8Array(stored.tag),
          encKeyVersion: stored.keyVersion,
          quality: {},
          capturedAt: new Date(),
        },
      });

      // Tamper with the encrypted file bytes on disk
      const fullPath = resolveSafeStoragePath(stored.relativePath);
      const originalBytes = await fs.promises.readFile(fullPath);
      originalBytes[10] ^= 0xff; // flip byte
      await fs.promises.writeFile(fullPath, originalBytes);

      const res = await request(app)
        .get(`/api/v1/admin/images/enrollment/${img.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IMAGE_INTEGRITY_FAILED');

      // Verify integrity failure was audited
      const failAudit = await prisma.adminAuditLog.findFirst({
        where: {
          action: 'ENROLLMENT_IMAGE_INTEGRITY_FAILURE',
          entityId: img.id,
        },
      });

      expect(failAudit).toBeDefined();

      // Clean up tampered image
      await prisma.faceEnrollmentImage.delete({ where: { id: img.id } });
      await prisma.faceProfile.delete({ where: { id: tamperProfile.id } });
      await fs.promises.unlink(fullPath).catch(() => {});
    });

    it('fails safely with 500 IMAGE_FILE_MISSING when file is missing from disk', async () => {
      const stored = await storeEncryptedImage({ kind: 'enrollment', bytes: sampleJpeg });
      const missingProfile = await prisma.faceProfile.create({
        data: {
          studentUserId,
          version: 11,
          status: 'DRAFT',
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          embeddingDim: 512,
        },
      });

      const img = await prisma.faceEnrollmentImage.create({
        data: {
          faceProfileId: missingProfile.id,
          angle: FaceAngle.FRONT,
          storagePath: stored.relativePath,
          sha256: stored.sha256,
          mime: stored.mime,
          byteSize: stored.byteSize,
          width: stored.width,
          height: stored.height,
          encIv: new Uint8Array(stored.iv),
          encTag: new Uint8Array(stored.tag),
          encKeyVersion: stored.keyVersion,
          quality: {},
          capturedAt: new Date(),
        },
      });

      // Delete the file on disk
      const fullPath = resolveSafeStoragePath(stored.relativePath);
      await fs.promises.unlink(fullPath);

      const res = await request(app)
        .get(`/api/v1/admin/images/enrollment/${img.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('IMAGE_FILE_MISSING');

      // Verify file missing was audited
      const missingAudit = await prisma.adminAuditLog.findFirst({
        where: {
          action: 'IMAGE_FILE_MISSING',
          entityId: img.id,
        },
      });

      expect(missingAudit).toBeDefined();

      // Clean up
      await prisma.faceEnrollmentImage.delete({ where: { id: img.id } });
      await prisma.faceProfile.delete({ where: { id: missingProfile.id } });
    });
  });

  describe('5. Enrollment Approval Workflow & Invariants', () => {
    it('approves PENDING_APPROVAL profile, sets cache to APPROVED, and audits', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/enrollments/${studentProfileId}/approve`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(200);

      const updated = await prisma.faceProfile.findUnique({
        where: { id: studentProfileId },
      });
      expect(updated?.status).toBe('APPROVED');
      expect(updated?.approvedBy).toBe(adminUserId);

      const studentP = await prisma.studentProfile.findUnique({
        where: { userId: studentUserId },
      });
      expect(studentP?.enrollmentStatusCache).toBe('APPROVED');
    });

    it('rejects invalid transition: approving an already APPROVED profile returns 409', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/enrollments/${studentProfileId}/approve`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('guarantees <= 1 approved profile per student and marks previous approved as SUPERSEDED', async () => {
      // Create version 2 in PENDING_APPROVAL
      const p2 = await prisma.faceProfile.create({
        data: {
          studentUserId,
          version: 2,
          status: 'PENDING_APPROVAL',
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          embeddingDim: 512,
        },
      });

      // Approve version 2
      const res = await request(app)
        .post(`/api/v1/admin/enrollments/${p2.id}/approve`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(200);

      // Verify version 1 is now SUPERSEDED
      const p1 = await prisma.faceProfile.findUnique({ where: { id: studentProfileId } });
      expect(p1?.status).toBe('SUPERSEDED');

      // Verify version 2 is APPROVED
      const p2Updated = await prisma.faceProfile.findUnique({ where: { id: p2.id } });
      expect(p2Updated?.status).toBe('APPROVED');

      // Count total approved profiles for this student -> must be exactly 1
      const approvedCount = await prisma.faceProfile.count({
        where: { studentUserId, status: 'APPROVED' },
      });
      expect(approvedCount).toBe(1);
    });

    it('revokes an APPROVED profile and updates enrollment cache', async () => {
      // Find the approved profile
      const approvedProfile = await prisma.faceProfile.findFirst({
        where: { studentUserId, status: 'APPROVED' },
      });
      expect(approvedProfile).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/admin/enrollments/${approvedProfile!.id}/revoke`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(200);

      const revoked = await prisma.faceProfile.findUnique({ where: { id: approvedProfile!.id } });
      expect(revoked?.status).toBe('REVOKED');

      const studentP = await prisma.studentProfile.findUnique({ where: { userId: studentUserId } });
      expect(studentP?.enrollmentStatusCache).toBe('REVOKED');
    });

    it('rejects an enrollment profile with mandatory reason', async () => {
      const p3 = await prisma.faceProfile.create({
        data: {
          studentUserId,
          version: 3,
          status: 'PENDING_APPROVAL',
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          embeddingDim: 512,
        },
      });

      const res = await request(app)
        .post(`/api/v1/admin/enrollments/${p3.id}/reject`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Lighting too dim in down-angle capture; please re-enroll with direct frontal light.' });

      expect(res.status).toBe(200);

      const rejected = await prisma.faceProfile.findUnique({ where: { id: p3.id } });
      expect(rejected?.status).toBe('REJECTED');
      expect(rejected?.rejectedReason).toContain('Lighting too dim');
    });
  });

  describe('6. Data Deletion Fulfillment & Privacy Hardening', () => {
    it('fulfills a data deletion request: permanently removes embeddings and image rows & files with count-only audit', async () => {
      // Create fresh image and embedding for deletion
      const s = await storeEncryptedImage({ kind: 'enrollment', bytes: sampleJpeg });
      const p = await prisma.faceProfile.create({
        data: {
          studentUserId,
          version: 4,
          status: 'APPROVED',
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          embeddingDim: 512,
        },
      });

      await prisma.faceEnrollmentImage.create({
        data: {
          faceProfileId: p.id,
          angle: FaceAngle.FRONT,
          storagePath: s.relativePath,
          sha256: s.sha256,
          mime: s.mime,
          byteSize: s.byteSize,
          width: s.width,
          height: s.height,
          encIv: new Uint8Array(s.iv),
          encTag: new Uint8Array(s.tag),
          encKeyVersion: s.keyVersion,
          quality: {},
          capturedAt: new Date(),
        },
      });

      await prisma.faceEmbedding.create({
        data: {
          faceProfileId: p.id,
          kind: 'SAMPLE',
          dim: 512,
          modelName: 'buffalo_l',
          modelVersion: '1.0',
          ciphertext: new Uint8Array(Buffer.alloc(100)),
          encIv: new Uint8Array(Buffer.alloc(12)),
          encTag: new Uint8Array(Buffer.alloc(16)),
          encKeyVersion: 1,
        },
      });

      // Create student data deletion request
      const delReq = await prisma.dataDeletionRequest.create({
        data: {
          studentUserId,
          reason: 'Privacy right request',
          status: 'PENDING',
        },
      });

      // Admin fulfills request
      const res = await request(app)
        .post(`/api/v1/admin/data-deletion-requests/${delReq.id}/fulfill`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.counts.deletedImagesCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.counts.deletedEmbeddingsCount).toBeGreaterThanOrEqual(1);

      // Verify DB rows for images and embeddings are zero
      const remainingImages = await prisma.faceEnrollmentImage.count({
        where: { faceProfile: { studentUserId } },
      });
      const remainingEmbeddings = await prisma.faceEmbedding.count({
        where: { faceProfile: { studentUserId } },
      });
      expect(remainingImages).toBe(0);
      expect(remainingEmbeddings).toBe(0);

      // Verify file on disk was unlinked
      const filePath = resolveSafeStoragePath(s.relativePath);
      expect(fs.existsSync(filePath)).toBe(false);

      // Verify audit record contains COUNTS ONLY (no biometric data)
      const audit = await prisma.adminAuditLog.findFirst({
        where: {
          action: 'BIOMETRIC_DATA_DELETED',
          entityId: delReq.id,
        },
      });

      expect(audit).toBeDefined();
      const after = audit?.after as any;
      expect(after.deletedImagesCount).toBeDefined();
      expect(after.deletedEmbeddingsCount).toBeDefined();
      expect(after.studentUserId).toBe(studentUserId);
      expect(JSON.stringify(after)).not.toContain('ciphertext');
      expect(JSON.stringify(after)).not.toContain('embedding');
    });
  });

  describe('7. System Settings & Audit Log Viewer', () => {
    it('manages require_enrollment_approval system setting', async () => {
      // Get current
      const getRes = await request(app)
        .get('/api/v1/admin/system-settings')
        .set('Cookie', adminCookie);

      expect(getRes.status).toBe(200);

      // Update setting
      const patchRes = await request(app)
        .patch('/api/v1/admin/system-settings')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ requireEnrollmentApproval: false });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.requireEnrollmentApproval).toBe(false);

      // Revert back to true
      await request(app)
        .patch('/api/v1/admin/system-settings')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ requireEnrollmentApproval: true });
    });

    it('queries audit logs and evidence access shortcut', async () => {
      const logsRes = await request(app)
        .get('/api/v1/admin/audit-logs?limit=10')
        .set('Cookie', adminCookie);

      expect(logsRes.status).toBe(200);
      expect(Array.isArray(logsRes.body.data)).toBe(true);

      const evidenceRes = await request(app)
        .get('/api/v1/admin/audit-logs/evidence-access?limit=10')
        .set('Cookie', adminCookie);

      expect(evidenceRes.status).toBe(200);
      expect(Array.isArray(evidenceRes.body.data)).toBe(true);
      if (evidenceRes.body.data.length > 0) {
        expect(evidenceRes.body.data[0].action).toMatch(/IMAGE_ACCESSED|IMAGE_INTEGRITY|IMAGE_FILE_MISSING/);
      }
    });
  });
});
