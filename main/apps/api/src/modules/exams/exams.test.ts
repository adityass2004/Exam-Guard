import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';

describe('Admin Exams & Questions Integration Suite', () => {
  let adminCookie: string;
  let adminId: string;
  let csrfToken: string;

  beforeEach(async () => {
    // 1. Get CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body.data.csrfToken;
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    const csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';

    // 2. Create Admin user
    const email = `admin_exam_${Date.now()}@examguard.test`;
    const passwordHash = await hashPassword('AdminPass1234!');
    const admin = await prisma.user.create({
      data: {
        email,
        fullName: 'Admin Exams Tester',
        passwordHash,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    // 3. Login
    const loginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: 'AdminPass1234!' });

    const loginCookies = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie']
      : [loginRes.headers['set-cookie'] as string];
    adminCookie = loginCookies.find((c: string) => c.startsWith('eg_session='))!;
  });

  it('performs full exam lifecycle: create, validate, questions CRUD, activate, and deactivate', async () => {
    // 1. Create exam
    const createRes = await request(app)
      .post('/api/v1/admin/exams')
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        title: 'Midterm Computer Networks',
        description: 'Comprehensive networking exam covering OSI and TCP/IP',
        durationMinutes: 60,
        shuffleQuestions: true,
        showScoreAfterSubmit: true,
      });

    expect(createRes.status).toBe(201);
    const examId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('DRAFT');

    // 2. Attempt activation with 0 questions -> fails EXAM_NOT_READY
    const actFailRes = await request(app)
      .post(`/api/v1/admin/exams/${examId}/activate`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(actFailRes.status).toBe(400);
    expect(actFailRes.body.error.code).toBe('EXAM_NOT_READY');

    // 3. Add Question 1 (Invalid: 2 correct options) -> rejected at schema validation
    const badQRes = await request(app)
      .post(`/api/v1/admin/exams/${examId}/questions`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        text: 'Which protocols belong to transport layer?',
        points: 2,
        options: [
          { text: 'TCP', isCorrect: true },
          { text: 'UDP', isCorrect: true },
        ],
      });
    expect(badQRes.status).toBe(400);

    // 4. Add Question 1 (Valid: exactly 1 correct option)
    const q1Res = await request(app)
      .post(`/api/v1/admin/exams/${examId}/questions`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        text: 'Which protocol is connection-oriented?',
        points: 2,
        options: [
          { text: 'TCP', isCorrect: true },
          { text: 'UDP', isCorrect: false },
          { text: 'IP', isCorrect: false },
          { text: 'ICMP', isCorrect: false },
        ],
      });
    expect(q1Res.status).toBe(201);
    const q1Id = q1Res.body.data.id;
    expect(q1Res.body.data.position).toBe(1);

    // 5. Add Question 2
    const q2Res = await request(app)
      .post(`/api/v1/admin/exams/${examId}/questions`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        text: 'What is the default port for HTTPS?',
        points: 1,
        options: [
          { text: '80', isCorrect: false },
          { text: '443', isCorrect: true },
        ],
      });
    expect(q2Res.status).toBe(201);
    const q2Id = q2Res.body.data.id;
    expect(q2Res.body.data.position).toBe(2);

    // 6. Reorder questions (swap Q1 and Q2)
    const reorderRes = await request(app)
      .put(`/api/v1/admin/exams/${examId}/questions/order`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ questionIds: [q2Id, q1Id] });
    expect(reorderRes.status).toBe(200);

    const examDetailsRes = await request(app)
      .get(`/api/v1/admin/exams/${examId}`)
      .set('Cookie', adminCookie);
    expect(examDetailsRes.status).toBe(200);
    expect(examDetailsRes.body.data.questions[0].id).toBe(q2Id);
    expect(examDetailsRes.body.data.questions[0].position).toBe(1);
    expect(examDetailsRes.body.data.questions[1].id).toBe(q1Id);
    expect(examDetailsRes.body.data.questions[1].position).toBe(2);

    // 7. Activate exam
    const actRes = await request(app)
      .post(`/api/v1/admin/exams/${examId}/activate`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(actRes.status).toBe(200);
    expect(actRes.body.data.status).toBe('ACTIVE');

    // 8. Deactivate exam
    const deactRes = await request(app)
      .post(`/api/v1/admin/exams/${examId}/deactivate`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(deactRes.status).toBe(200);
    expect(deactRes.body.data.status).toBe('INACTIVE');
  });

  it('blocks question modification and soft-delete when an exam has sessions (EXAM_HAS_SESSIONS)', async () => {
    // 1. Create and populate exam
    const exam = await prisma.exam.create({
      data: {
        title: 'Operating Systems Quiz',
        durationMinutes: 30,
        status: 'ACTIVE',
        createdBy: adminId,
        questions: {
          create: {
            prompt: 'What is a race condition?',
            points: 1,
            position: 1,
            options: {
              create: [
                { label: 'Flaw in concurrent execution', isCorrect: true, position: 1 },
                { label: 'CPU overclocking speed', isCorrect: false, position: 2 },
              ],
            },
          },
        },
      },
      include: { questions: true },
    });

    const questionId = exam.questions[0].id;

    // 2. Create student & approved face profile
    const student = await prisma.user.create({
      data: {
        email: `student_lock_${Date.now()}@examguard.test`,
        fullName: 'Lockout Student',
        passwordHash: 'hash',
        role: 'STUDENT',
        studentProfile: {
          create: { studentId: `STU${Date.now()}` },
        },
      },
    });

    const profile = await prisma.faceProfile.create({
      data: {
        studentUserId: student.id,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });

    const setting = await prisma.verificationSetting.findFirst({
      where: { isActive: true },
    });

    // 3. Create a session on this exam
    await prisma.examSession.create({
      data: {
        examId: exam.id,
        studentUserId: student.id,
        faceProfileId: profile.id,
        settingsVersionId: setting!.id,
        settingsSnapshot: { thresholdPct: 75.0, preExamRequiredMatches: 2 },
        status: 'PENDING_VERIFICATION',
      },
    });

    // 4. Attempt to add a question -> blocked with 409 EXAM_HAS_SESSIONS
    const addQRes = await request(app)
      .post(`/api/v1/admin/exams/${exam.id}/questions`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        text: 'New question?',
        points: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      });
    expect(addQRes.status).toBe(409);
    expect(addQRes.body.error.code).toBe('EXAM_HAS_SESSIONS');

    // 5. Attempt to edit existing question -> blocked with 409 EXAM_HAS_SESSIONS
    const editQRes = await request(app)
      .patch(`/api/v1/admin/exams/${exam.id}/questions/${questionId}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ text: 'Updated prompt text?' });
    expect(editQRes.status).toBe(409);
    expect(editQRes.body.error.code).toBe('EXAM_HAS_SESSIONS');

    // 6. Attempt to delete existing question -> blocked with 409 EXAM_HAS_SESSIONS
    const delQRes = await request(app)
      .delete(`/api/v1/admin/exams/${exam.id}/questions/${questionId}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(delQRes.status).toBe(409);
    expect(delQRes.body.error.code).toBe('EXAM_HAS_SESSIONS');

    // 7. Attempt to delete exam -> blocked with 409 EXAM_HAS_SESSIONS
    const delExamRes = await request(app)
      .delete(`/api/v1/admin/exams/${exam.id}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken);
    expect(delExamRes.status).toBe(409);
    expect(delExamRes.body.error.code).toBe('EXAM_HAS_SESSIONS');
  });
});
