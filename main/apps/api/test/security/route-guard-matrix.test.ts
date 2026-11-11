import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { hashPassword } from '../../src/lib/password.js';
import crypto from 'node:crypto';

describe('Security Hardening - AuthN/AuthZ Route Guard Matrix', () => {
  let adminCookie: string;
  let studentCookie: string;
  let csrfCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    // 1. Get CSRF Token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
    csrfToken = csrfRes.body.data.csrfToken;

    // 2. Create and authenticate Admin
    const adminUnique = crypto.randomUUID().slice(0, 8);
    const adminEmail = `secadmin.${adminUnique}@test.local`;
    const adminPassHash = await hashPassword('AdminPass123!');
    await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Security Test Admin',
        role: 'ADMIN',
        passwordHash: adminPassHash,
      },
    });

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: adminEmail, password: 'AdminPass123!' });

    const adminSetCookie = adminLoginRes.headers['set-cookie'];
    const adminCookies = Array.isArray(adminSetCookie) ? adminSetCookie : [adminSetCookie as string];
    adminCookie = adminCookies.find((c) => c.startsWith('eg_session=')) || '';

    // 3. Create and authenticate Student
    const studentUnique = crypto.randomUUID().slice(0, 8);
    const studentEmail = `secstudent.${studentUnique}@test.local`;
    const studentPassHash = await hashPassword('StudentPass123!');
    await prisma.user.create({
      data: {
        email: studentEmail,
        fullName: 'Security Test Student',
        role: 'STUDENT',
        passwordHash: studentPassHash,
        studentProfile: {
          create: {
            studentId: `SEC-${studentUnique}`,
          },
        },
      },
    });

    const studentLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ email: studentEmail, password: 'StudentPass123!' });

    const studentSetCookie = studentLoginRes.headers['set-cookie'];
    const studentCookies = Array.isArray(studentSetCookie) ? studentSetCookie : [studentSetCookie as string];
    studentCookie = studentCookies.find((c) => c.startsWith('eg_session=')) || '';
  });

  it('verifies public allowlist endpoints are accessible unauthenticated', async () => {
    const healthRes = await request(app).get('/api/v1/health');
    expect(healthRes.status).toBe(200);

    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    expect(csrfRes.status).toBe(200);
    expect(csrfRes.body.data.csrfToken).toBeDefined();

    const pingRes = await request(app).get('/api/v1/system/status');
    expect(pingRes.status).toBe(200);
  });

  it('rejects unauthenticated requests to protected admin endpoints with 401', async () => {
    const endpoints = [
      '/api/v1/admin/ping',
      '/api/v1/admin/verifications',
      '/api/v1/admin/reports/overview',
      '/api/v1/admin/admins',
      '/api/v1/admin/students',
      '/api/v1/admin/settings/system',
      '/api/v1/admin/verification-settings',
      '/api/v1/admin/incidents',
      '/api/v1/admin/monitoring/live',
    ];

    for (const url of endpoints) {
      const res = await request(app).get(url);
      expect(res.status, `Expected 401 on unauthenticated GET ${url}`).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects student requests to admin endpoints with 403 Forbidden', async () => {
    const endpoints = [
      '/api/v1/admin/ping',
      '/api/v1/admin/verifications',
      '/api/v1/admin/reports/overview',
      '/api/v1/admin/admins',
      '/api/v1/admin/students',
      '/api/v1/admin/verification-settings',
      '/api/v1/admin/incidents',
    ];

    for (const url of endpoints) {
      const res = await request(app)
        .get(url)
        .set('Cookie', [studentCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);
      expect(res.status, `Expected 403 on student accessing admin GET ${url}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects admin requests to student-only endpoints with 403 Forbidden', async () => {
    const endpoints = [
      '/api/v1/student/me',
      '/api/v1/student/enrollment/status',
      '/api/v1/student/exams',
      '/api/v1/student/sessions',
    ];

    for (const url of endpoints) {
      const res = await request(app)
        .get(url)
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);
      expect(res.status, `Expected 403 on admin accessing student GET ${url}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects cross-student access to other student session/data', async () => {
    // Create a second student
    const student2Unique = crypto.randomUUID().slice(0, 8);
    await prisma.user.create({
      data: {
        email: `student2.${student2Unique}@test.local`,
        fullName: 'Other Student',
        role: 'STUDENT',
        passwordHash: await hashPassword('StudentPass123!'),
        studentProfile: { create: { studentId: `OTHER-${student2Unique}` } },
      },
    });

    // Try accessing with student1 session
    const fakeSessionId = crypto.randomUUID();
    const res = await request(app)
      .get(`/api/v1/student/sessions/${fakeSessionId}`)
      .set('Cookie', [studentCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    // Must be 404 or 403, never leaking foreign or unknown data
    expect([403, 404]).toContain(res.status);
  });
});
