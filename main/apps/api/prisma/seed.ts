import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword, validatePasswordPolicy } from '../src/lib/password.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const prisma = new PrismaClient();

export async function seed() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@examguard.local').toLowerCase().trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || '';
  const studentEmail = (process.env.SEED_STUDENT_EMAIL || 'student@examguard.local').toLowerCase().trim();
  const studentPassword = process.env.SEED_STUDENT_PASSWORD || '';

  // 1. Refusal check on weak or placeholder passwords
  if (!adminPassword || adminPassword === 'REPLACE_ME') {
    throw new Error('Seed aborted: SEED_ADMIN_PASSWORD is missing or set to placeholder REPLACE_ME.');
  }
  if (!studentPassword || studentPassword === 'REPLACE_ME') {
    throw new Error('Seed aborted: SEED_STUDENT_PASSWORD is missing or set to placeholder REPLACE_ME.');
  }

  const adminPolicy = validatePasswordPolicy(adminPassword);
  if (!adminPolicy.valid) {
    throw new Error(`Seed aborted: Admin password invalid: ${adminPolicy.error}`);
  }

  const studentPolicy = validatePasswordPolicy(studentPassword);
  if (!studentPolicy.valid) {
    throw new Error(`Seed aborted: Student password invalid: ${studentPolicy.error}`);
  }

  console.log('Seeding initial data...');

  // 2. Seed Admin User
  const adminPasswordHash = await hashPassword(adminPassword);
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: 'System Administrator',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
    create: {
      email: adminEmail,
      fullName: 'System Administrator',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  });

  // 3. Seed Student User and StudentProfile
  const studentPasswordHash = await hashPassword(studentPassword);
  const studentUser = await prisma.user.upsert({
    where: { email: studentEmail },
    update: {
      fullName: 'Demo Student',
      passwordHash: studentPasswordHash,
      role: UserRole.STUDENT,
    },
    create: {
      email: studentEmail,
      fullName: 'Demo Student',
      passwordHash: studentPasswordHash,
      role: UserRole.STUDENT,
    },
  });

  await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: { studentId: 'DEMO-0001' },
    create: {
      userId: studentUser.id,
      studentId: 'DEMO-0001',
    },
  });

  // 4. Seed VerificationSettings version 1
  await prisma.verificationSetting.upsert({
    where: { version: 1 },
    update: {
      isActive: true,
      name: 'Default Institution Verification Policy',
      thresholdPct: 75.0,
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
      minFaceQuality: {
        blurThreshold: 100,
        minBrightness: 40,
        maxBrightness: 220,
        minFaceSizeRatio: 0.15,
        minDetScore: 0.6,
      },
      severityRules: {
        IDENTITY_MISMATCH: 'CRITICAL',
        MULTIPLE_FACES: 'HIGH',
        REPEATED_VERIFICATION_FAILURE: 'HIGH',
        NO_FACE: 'MEDIUM',
        CAMERA_DISCONNECTED: 'MEDIUM',
        VERIFICATION_SERVICE_FAILURE: 'LOW',
      },
      changeNote: 'Provisional default configuration — calibrate in Prompt 09 on owner dataset',
      createdBy: adminUser.id,
    },
    create: {
      version: 1,
      isActive: true,
      name: 'Default Institution Verification Policy',
      thresholdPct: 75.0,
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
      minFaceQuality: {
        blurThreshold: 100,
        minBrightness: 40,
        maxBrightness: 220,
        minFaceSizeRatio: 0.15,
        minDetScore: 0.6,
      },
      severityRules: {
        IDENTITY_MISMATCH: 'CRITICAL',
        MULTIPLE_FACES: 'HIGH',
        REPEATED_VERIFICATION_FAILURE: 'HIGH',
        NO_FACE: 'MEDIUM',
        CAMERA_DISCONNECTED: 'MEDIUM',
        VERIFICATION_SERVICE_FAILURE: 'LOW',
      },
      changeNote: 'Provisional default configuration — calibrate in Prompt 09 on owner dataset',
      createdBy: adminUser.id,
    },
  });

  // 5. Seed SystemSettings (key-value)
  const systemSettingsToSeed = [
    { key: 'require_enrollment_approval', value: true },
    { key: 'retention.enrollment_images_days', value: 90 },
    { key: 'retention.evidence_days', value: 180 },
    { key: 'retention.verification_logs_days', value: 365 },
    { key: 'retention.audit_logs_days', value: 730 },
    { key: 'biometric_consent_policy_version', value: '1.0' },
  ];

  for (const item of systemSettingsToSeed) {
    await prisma.systemSetting.upsert({
      where: { key: item.key },
      update: { value: item.value, updatedBy: adminUser.id },
      create: { key: item.key, value: item.value, updatedBy: adminUser.id },
    });
  }

  // 6. Seed Demo Exam with 8 MCQ Questions and Options
  const demoExam = await prisma.exam.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {
      title: 'Demo Examination: Computer Science Fundamentals',
      description: 'Standard multiple-choice benchmark exam for identity verification validation.',
      durationMinutes: 45,
      status: 'ACTIVE',
      shuffleQuestions: false,
      showScoreAfterSubmit: true,
      createdBy: adminUser.id,
    },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Demo Examination: Computer Science Fundamentals',
      description: 'Standard multiple-choice benchmark exam for identity verification validation.',
      durationMinutes: 45,
      status: 'ACTIVE',
      shuffleQuestions: false,
      showScoreAfterSubmit: true,
      createdBy: adminUser.id,
    },
  });

  const demoQuestions = [
    {
      position: 1,
      prompt: 'Which data structure follows the First-In, First-Out (FIFO) principle?',
      options: [
        { position: 1, label: 'Stack', isCorrect: false },
        { position: 2, label: 'Queue', isCorrect: true },
        { position: 3, label: 'Binary Tree', isCorrect: false },
        { position: 4, label: 'Hash Table', isCorrect: false },
      ],
    },
    {
      position: 2,
      prompt: 'What is the average time complexity of searching an element in a balanced Binary Search Tree?',
      options: [
        { position: 1, label: 'O(1)', isCorrect: false },
        { position: 2, label: 'O(n)', isCorrect: false },
        { position: 3, label: 'O(log n)', isCorrect: true },
        { position: 4, label: 'O(n log n)', isCorrect: false },
      ],
    },
    {
      position: 3,
      prompt: 'Which layer of the OSI model is responsible for end-to-end communication and error recovery?',
      options: [
        { position: 1, label: 'Transport Layer', isCorrect: true },
        { position: 2, label: 'Data Link Layer', isCorrect: false },
        { position: 3, label: 'Network Layer', isCorrect: false },
        { position: 4, label: 'Session Layer', isCorrect: false },
      ],
    },
    {
      position: 4,
      prompt: 'In relational database design, what does the ACID acronym stand for?',
      options: [
        { position: 1, label: 'Atomicity, Consistency, Isolation, Durability', isCorrect: true },
        { position: 2, label: 'Accuracy, Concurrency, Integrity, Durability', isCorrect: false },
        { position: 3, label: 'Atomicity, Compatibility, Isolation, Distribution', isCorrect: false },
        { position: 4, label: 'Association, Consistency, Indexing, Durability', isCorrect: false },
      ],
    },
    {
      position: 5,
      prompt: 'Which symmetric encryption standard uses a 128, 192, or 256-bit key size?',
      options: [
        { position: 1, label: 'RSA', isCorrect: false },
        { position: 2, label: 'DES', isCorrect: false },
        { position: 3, label: 'AES', isCorrect: true },
        { position: 4, label: 'ECC', isCorrect: false },
      ],
    },
    {
      position: 6,
      prompt: 'What is the primary function of an operating system virtual memory paging system?',
      options: [
        { position: 1, label: 'Increase network transmission rates', isCorrect: false },
        { position: 2, label: 'Allow memory addressing beyond physical RAM capacity', isCorrect: true },
        { position: 3, label: 'Encrypt disk sector data', isCorrect: false },
        { position: 4, label: 'Cache CPU register states', isCorrect: false },
      ],
    },
    {
      position: 7,
      prompt: 'Which HTTP status code indicates that the server cannot process the request due to client validation error?',
      options: [
        { position: 1, label: '200 OK', isCorrect: false },
        { position: 2, label: '400 Bad Request', isCorrect: true },
        { position: 3, label: '500 Internal Server Error', isCorrect: false },
        { position: 4, label: '503 Service Unavailable', isCorrect: false },
      ],
    },
    {
      position: 8,
      prompt: 'In facial recognition systems, what does cosine similarity measure between two unit embedding vectors?',
      options: [
        { position: 1, label: 'The Euclidean pixel difference', isCorrect: false },
        { position: 2, label: 'The cosine of the angle between high-dimensional feature vectors', isCorrect: true },
        { position: 3, label: 'The physical distance between pupils in pixels', isCorrect: false },
        { position: 4, label: 'The file compression ratio of the face image', isCorrect: false },
      ],
    },
  ];

  for (const q of demoQuestions) {
    const existingQ = await prisma.examQuestion.findFirst({
      where: { examId: demoExam.id, position: q.position },
    });

    const question = existingQ
      ? await prisma.examQuestion.update({
          where: { id: existingQ.id },
          data: { prompt: q.prompt, points: 1 },
        })
      : await prisma.examQuestion.create({
          data: {
            examId: demoExam.id,
            position: q.position,
            prompt: q.prompt,
            points: 1,
          },
        });

    for (const opt of q.options) {
      await prisma.examQuestionOption.upsert({
        where: {
          questionId_position: {
            questionId: question.id,
            position: opt.position,
          },
        },
        update: { label: opt.label, isCorrect: opt.isCorrect },
        create: {
          questionId: question.id,
          position: opt.position,
          label: opt.label,
          isCorrect: opt.isCorrect,
        },
      });
    }
  }

  console.log('Seed completed successfully.');
}

if (process.argv[1]?.includes('seed')) {
  seed()
    .catch((err) => {
      console.error('Seed execution error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

