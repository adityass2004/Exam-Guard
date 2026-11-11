import crypto from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'mysql://examguard:examguard_dev_password@localhost:3306/examguard_test',
    },
  },
});

describe('Database Integrity and Constraint Tests', () => {
  const runId = Math.random().toString(36).substring(2, 7);
  let adminId: string;
  let studentId: string;
  let examId: string;
  let settingsId: string;
  let profileId: string;

  beforeAll(async () => {
    // Clean up test database
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    await prisma.triggerEvidence.deleteMany({});
    await prisma.adminInvestigationLog.deleteMany({});
    await prisma.securityTrigger.deleteMany({});
    await prisma.verificationLog.deleteMany({});
    await prisma.examAnswer.deleteMany({});
    await prisma.examSession.deleteMany({});
    await prisma.examQuestionOption.deleteMany({});
    await prisma.examQuestion.deleteMany({});
    await prisma.exam.deleteMany({});
    await prisma.verificationSetting.deleteMany({});
    await prisma.faceEmbedding.deleteMany({});
    await prisma.faceEnrollmentImage.deleteMany({});
    await prisma.faceProfile.deleteMany({});
    await prisma.studentProfile.deleteMany({});
    await prisma.authSession.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

    // Create base admin
    const admin = await prisma.user.create({
      data: {
        email: `admin_${runId}@test.local`,
        passwordHash: 'dummy_hash',
        fullName: 'Admin Test',
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;

    // Create base student
    const student = await prisma.user.create({
      data: {
        email: `student_${runId}@test.local`,
        passwordHash: 'dummy_hash',
        fullName: 'Student Test',
        role: UserRole.STUDENT,
      },
    });
    studentId = student.id;

    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        studentId: `STU-${runId}`,
      },
    });

    // Create base settings
    const setting = await prisma.verificationSetting.create({
      data: {
        version: 1,
        isActive: true,
        thresholdPct: 75,
        intervalMs: 1500,
        consecutiveMismatchLimit: 3,
        missingFaceLimit: 4,
        multipleFacesPolicy: 'ALERT_AFTER_CONSECUTIVE',
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
        createdBy: adminId,
      },
    });
    settingsId = setting.id;

    // Create base exam
    const exam = await prisma.exam.create({
      data: {
        title: 'Constraint Test Exam',
        durationMinutes: 60,
        createdBy: adminId,
      },
    });
    examId = exam.id;

    // Create base face profile
    const profile = await prisma.faceProfile.create({
      data: {
        studentUserId: studentId,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces UNIQUE email constraint on users', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: `student_${runId}@test.local`, // duplicate
          passwordHash: 'hash',
          fullName: 'Duplicate Email',
          role: UserRole.STUDENT,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces UNIQUE studentId constraint on student_profiles', async () => {
    const student2 = await prisma.user.create({
      data: {
        email: `student2_${runId}@test.local`,
        passwordHash: 'hash',
        fullName: 'Student 2',
        role: UserRole.STUDENT,
      },
    });

    await expect(
      prisma.studentProfile.create({
        data: {
          userId: student2.id,
          studentId: `STU-${runId}`, // duplicate studentId
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces UNIQUE(faceProfileId, angle) on face_enrollment_images', async () => {
    const dummyIv = Buffer.alloc(12, 1);
    const dummyTag = Buffer.alloc(16, 2);

    await prisma.faceEnrollmentImage.create({
      data: {
        faceProfileId: profileId,
        angle: 'FRONT',
        storagePath: 'storage/enrollment/front.enc',
        sha256: crypto.randomBytes(32).toString('hex'),
        mime: 'image/jpeg',
        byteSize: 1024,
        width: 640,
        height: 480,
        encIv: dummyIv,
        encTag: dummyTag,
        encKeyVersion: 1,
        quality: {},
        capturedAt: new Date(),
      },
    });

    // Inserting FRONT angle a second time for same profile must reject
    await expect(
      prisma.faceEnrollmentImage.create({
        data: {
          faceProfileId: profileId,
          angle: 'FRONT',
          storagePath: 'storage/enrollment/front2.enc',
          sha256: crypto.randomBytes(32).toString('hex'),
          mime: 'image/jpeg',
          byteSize: 1024,
          width: 640,
          height: 480,
          encIv: dummyIv,
          encTag: dummyTag,
          encKeyVersion: 1,
          quality: {},
          capturedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces UNIQUE activeStudentKey on exam_sessions (one live session per student)', async () => {
    const session1 = await prisma.examSession.create({
      data: {
        examId,
        studentUserId: studentId,
        faceProfileId: profileId,
        settingsVersionId: settingsId,
        settingsSnapshot: {},
        activeStudentKey: studentId, // Live session key
        status: 'IN_PROGRESS',
      },
    });
    expect(session1.id).toBeDefined();

    // Second live session for same student must reject
    await expect(
      prisma.examSession.create({
        data: {
          examId,
          studentUserId: studentId,
          faceProfileId: profileId,
          settingsVersionId: settingsId,
          settingsSnapshot: {},
          activeStudentKey: studentId, // Duplicate live student key
          status: 'PENDING_VERIFICATION',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces UNIQUE(sessionId, sequenceNo) on verification_logs', async () => {
    const session = await prisma.examSession.findFirstOrThrow();

    await prisma.verificationLog.create({
      data: {
        sessionId: session.id,
        studentUserId: studentId,
        examId,
        sequenceNo: 1,
        phase: 'CONTINUOUS',
        outcome: 'MATCH',
        thresholdPct: 75,
        processingMs: 50,
        settingsVersionId: settingsId,
      },
    });

    // Duplicate sequenceNo for same session must reject
    await expect(
      prisma.verificationLog.create({
        data: {
          sessionId: session.id,
          studentUserId: studentId,
          examId,
          sequenceNo: 1,
          phase: 'CONTINUOUS',
          outcome: 'MISMATCH',
          thresholdPct: 75,
          processingMs: 50,
          settingsVersionId: settingsId,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces UNIQUE activeDedupeKey on security_triggers while permitting multiple NULLs', async () => {
    const session = await prisma.examSession.findFirstOrThrow();
    const log = await prisma.verificationLog.findFirstOrThrow();

    const incidentCode1 = `INC-${Date.now()}-A`;
    const incidentCode2 = `INC-${Date.now()}-B`;
    const incidentCode3 = `INC-${Date.now()}-C`;
    const incidentCode4 = `INC-${Date.now()}-D`;

    const dedupeKey = `${session.id}:IDENTITY_MISMATCH`;

    // 1. Create first active incident with activeDedupeKey
    const incident1 = await prisma.securityTrigger.create({
      data: {
        incidentCode: incidentCode1,
        sessionId: session.id,
        studentUserId: studentId,
        examId,
        triggerType: 'IDENTITY_MISMATCH',
        severity: 'CRITICAL',
        activeDedupeKey: dedupeKey,
        firstDetectedAt: new Date(),
        lastDetectedAt: new Date(),
        firstVerificationLogId: log.id,
        lastVerificationLogId: log.id,
        evidenceStatus: 'CAPTURED',
      },
    });
    expect(incident1.id).toBeDefined();

    // 2. Inserting second incident with same activeDedupeKey must fail (deduplication guarantee)
    await expect(
      prisma.securityTrigger.create({
        data: {
          incidentCode: incidentCode2,
          sessionId: session.id,
          studentUserId: studentId,
          examId,
          triggerType: 'IDENTITY_MISMATCH',
          severity: 'CRITICAL',
          activeDedupeKey: dedupeKey, // duplicate active key
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
          firstVerificationLogId: log.id,
          lastVerificationLogId: log.id,
          evidenceStatus: 'CAPTURED',
        },
      }),
    ).rejects.toThrow();

    // 3. Recovered incidents have activeDedupeKey = null. Multiple NULLs must succeed
    const recovered1 = await prisma.securityTrigger.create({
      data: {
        incidentCode: incidentCode3,
        sessionId: session.id,
        studentUserId: studentId,
        examId,
        triggerType: 'IDENTITY_MISMATCH',
        severity: 'CRITICAL',
        activeDedupeKey: null,
        firstDetectedAt: new Date(),
        lastDetectedAt: new Date(),
        recoveredAt: new Date(),
        firstVerificationLogId: log.id,
        lastVerificationLogId: log.id,
        evidenceStatus: 'CAPTURED',
      },
    });

    const recovered2 = await prisma.securityTrigger.create({
      data: {
        incidentCode: incidentCode4,
        sessionId: session.id,
        studentUserId: studentId,
        examId,
        triggerType: 'IDENTITY_MISMATCH',
        severity: 'CRITICAL',
        activeDedupeKey: null, // Second NULL key
        firstDetectedAt: new Date(),
        lastDetectedAt: new Date(),
        recoveredAt: new Date(),
        firstVerificationLogId: log.id,
        lastVerificationLogId: log.id,
        evidenceStatus: 'CAPTURED',
      },
    });

    expect(recovered1.id).toBeDefined();
    expect(recovered2.id).toBeDefined();
  });

  it('enforces UNIQUE triggerId on trigger_evidence (at most one evidence image per incident)', async () => {
    const trigger = await prisma.securityTrigger.findFirstOrThrow();
    const log = await prisma.verificationLog.findFirstOrThrow();

    const dummyIv = Buffer.alloc(12, 1);
    const dummyTag = Buffer.alloc(16, 2);

    await prisma.triggerEvidence.create({
      data: {
        triggerId: trigger.id,
        verificationLogId: log.id,
        storagePath: 'storage/evidence/ev1.enc',
        sha256: crypto.randomBytes(32).toString('hex'),
        mime: 'image/jpeg',
        byteSize: 2048,
        width: 640,
        height: 480,
        encIv: dummyIv,
        encTag: dummyTag,
        encKeyVersion: 1,
        capturedAt: new Date(),
      },
    });

    // Second evidence for same incident must reject
    await expect(
      prisma.triggerEvidence.create({
        data: {
          triggerId: trigger.id, // duplicate triggerId
          verificationLogId: log.id,
          storagePath: 'storage/evidence/ev2.enc',
          sha256: crypto.randomBytes(32).toString('hex'),
          mime: 'image/jpeg',
          byteSize: 2048,
          width: 640,
          height: 480,
          encIv: dummyIv,
          encTag: dummyTag,
          encKeyVersion: 1,
          capturedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces Foreign Key Restrict on User with active references', async () => {
    // Attempting to delete studentUser when face_profile/exam_sessions reference it must fail
    await expect(
      prisma.user.delete({
        where: { id: studentId },
      }),
    ).rejects.toThrow();
  });
});

