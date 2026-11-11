import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

describe('Authentication & RBAC Integration Tests', () => {
  const app = createApp();
  const runId = Math.random().toString(36).substring(2, 7);

  const studentPayload = {
    studentId: `STU-AUTH-${runId}`,
    fullName: `Test Student ${runId}`,
    email: `student_${runId}@examguard.test`,
    password: 'ValidPassword123!',
  };

  const adminPayload = {
    email: `admin_${runId}@examguard.test`,
    password: 'ValidAdminPass123!',
  };

  let csrfToken: string;
  let csrfCookie: string;
  let studentCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    // Obtain pre-session CSRF token and cookie
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    expect(csrfRes.status).toBe(200);
    csrfToken = csrfRes.body.data.csrfToken;
    csrfCookie = csrfRes.headers['set-cookie'][0];

    // Seed test admin directly
    await prisma.user.create({
      data: {
        email: adminPayload.email,
        fullName: 'Test Admin',
        passwordHash: await (await import('../../lib/password.js')).hashPassword(adminPayload.password),
        role: 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({
      where: { actorUserId: { in: (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id) } },
    });
    await prisma.authSession.deleteMany({});
    await prisma.studentProfile.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { in: [studentPayload.email, adminPayload.email] } },
    });
  });

  it('GET /api/v1/auth/csrf returns token and sets cookie', async () => {
    const res = await request(app).get('/api/v1/auth/csrf');
    expect(res.status).toBe(200);
    expect(res.body.data.csrfToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('POST /api/v1/auth/register registers student and rejects duplicates', async () => {
    // 1. Success
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send(studentPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(studentPayload.email);
    expect(res.body.data.user.role).toBe('STUDENT');

    // 2. Duplicate email
    const dupEmailRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ ...studentPayload, studentId: `STU-DIFF-${runId}` });

    expect(dupEmailRes.status).toBe(409);
    expect(dupEmailRes.body.error.code).toBe('EMAIL_TAKEN');

    // 3. Duplicate student ID
    const dupStudentIdRes = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ ...studentPayload, email: `diff_${runId}@examguard.test` });

    expect(dupStudentIdRes.status).toBe(409);
    expect(dupStudentIdRes.body.error.code).toBe('STUDENT_ID_TAKEN');
  });

  it('POST /api/v1/auth/login authenticates student and sets eg_session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: studentPayload.email,
        password: studentPayload.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(studentPayload.email);
    expect(res.headers['set-cookie']).toBeDefined();

    const cookies = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie'] as string];
    studentCookie = cookies.find((c: string) => c.startsWith('eg_session='));
    expect(studentCookie).toBeDefined();
    expect(studentCookie).toContain('HttpOnly');
  });

  it('POST /api/v1/auth/login rejects invalid password and student on admin endpoint', async () => {
    // 1. Wrong password
    const wrongPassRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: studentPayload.email,
        password: 'WrongPassword123!',
      });

    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.error.code).toBe('INVALID_CREDENTIALS');

    // 2. Student credentials on Admin login endpoint must fail with generic INVALID_CREDENTIALS
    const studentOnAdminRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: studentPayload.email,
        password: studentPayload.password,
      });

    expect(studentOnAdminRes.status).toBe(401);
    expect(studentOnAdminRes.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/admin/login authenticates admin and sets session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: adminPayload.email,
        password: adminPayload.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');

    const adminCookies = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie'] as string];
    adminCookie = adminCookies.find((c: string) => c.startsWith('eg_session='));
    expect(adminCookie).toBeDefined();
  });

  it('GET /api/v1/auth/me returns identity when authenticated', async () => {
    // Unauthenticated
    const unauthRes = await request(app).get('/api/v1/auth/me');
    expect(unauthRes.status).toBe(401);

    // Authenticated student
    const studentRes = await request(app).get('/api/v1/auth/me').set('Cookie', studentCookie);
    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data.role).toBe('STUDENT');
    expect(studentRes.body.data.email).toBe(studentPayload.email);

    // Authenticated admin
    const adminRes = await request(app).get('/api/v1/auth/me').set('Cookie', adminCookie);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.role).toBe('ADMIN');
  });

  it('enforces RBAC over /student and /admin routes', async () => {
    // 1. Unauthenticated -> 401
    const p1 = await request(app).get('/api/v1/student/ping');
    expect(p1.status).toBe(401);

    const p2 = await request(app).get('/api/v1/admin/ping');
    expect(p2.status).toBe(401);

    // 2. Student accessing /student/ping -> 200, accessing /admin/ping -> 403
    const s1 = await request(app).get('/api/v1/student/ping').set('Cookie', studentCookie);
    expect(s1.status).toBe(200);

    const s2 = await request(app).get('/api/v1/admin/ping').set('Cookie', studentCookie);
    expect(s2.status).toBe(403);
    expect(s2.body.error.code).toBe('FORBIDDEN');

    // 3. Admin accessing /admin/ping -> 200, accessing /student/ping -> 403
    const a1 = await request(app).get('/api/v1/admin/ping').set('Cookie', adminCookie);
    expect(a1.status).toBe(200);

    const a2 = await request(app).get('/api/v1/student/ping').set('Cookie', adminCookie);
    expect(a2.status).toBe(403);
    expect(a2.body.error.code).toBe('FORBIDDEN');
  });

  it('enforces CSRF protection on state-changing requests', async () => {
    // Missing X-CSRF-Token
    const noTokenRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', studentCookie);

    expect(noTokenRes.status).toBe(403);
    expect(noTokenRes.body.error.code).toBe('CSRF_INVALID');

    // Invalid Origin
    const badOriginRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://evil-attacker.local')
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(badOriginRes.status).toBe(403);
    expect(badOriginRes.body.error.code).toBe('CSRF_INVALID');
  });

  it('records audit logs without password data', async () => {
    const logs = await prisma.adminAuditLog.findMany({
      where: { action: { in: ['AUTH_LOGIN', 'AUTH_REGISTER', 'AUTH_LOGIN_FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      const logStr = JSON.stringify(log, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      expect(logStr).not.toContain(studentPayload.password);
      expect(logStr).not.toContain(adminPayload.password);
    }
  });

  it('POST /api/v1/auth/logout revokes session', async () => {
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', studentCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(logoutRes.status).toBe(200);

    // Old cookie should now be invalid
    const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', studentCookie);
    expect(meRes.status).toBe(401);
  });
});
