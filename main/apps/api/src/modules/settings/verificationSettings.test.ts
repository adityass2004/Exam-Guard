import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';

describe('Admin Verification Settings Suite', () => {
  let adminCookie: string;
  let adminId: string;
  let csrfToken: string;

  beforeEach(async () => {
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    csrfToken = csrfRes.body.data.csrfToken;
    const cookies = csrfRes.headers['set-cookie'] || [];
    const csrfCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c) =>
      c.startsWith('eg_csrf=')
    );

    const email = `admin_settings_${Date.now()}@test.local`;
    const passwordHash = await hashPassword('AdminPass1234!');
    const admin = await prisma.user.create({
      data: {
        email,
        fullName: 'Settings Admin Tester',
        passwordHash,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie || '')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: 'AdminPass1234!' });

    const loginCookies = loginRes.headers['set-cookie'] || [];
    adminCookie = (Array.isArray(loginCookies) ? loginCookies : [loginCookies]).find((c) =>
      c.startsWith('eg_session=')
    )!;
  });

  it('retrieves active settings and version history', async () => {
    const res = await request(app)
      .get('/api/v1/admin/verification-settings')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.active).toBeDefined();
    expect(Array.isArray(res.body.data.history)).toBe(true);
    expect(res.body.data.active.thresholdPct).toBeGreaterThanOrEqual(30);
  });

  it('validates settings payload bounds and cross-field constraints', async () => {
    // Missing changeNote
    const res1 = await request(app)
      .post('/api/v1/admin/verification-settings')
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        thresholdPct: 80,
      });
    expect(res1.status).toBe(400);

    // Out of bound threshold
    const res2 = await request(app)
      .post('/api/v1/admin/verification-settings')
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        thresholdPct: 110,
        changeNote: 'Invalid threshold test',
      });
    expect(res2.status).toBe(400);

    // Out of bound interval
    const res3 = await request(app)
      .post('/api/v1/admin/verification-settings')
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        intervalMs: 15000,
        changeNote: 'Interval too high',
      });
    expect(res3.status).toBe(400);
  });

  it('creates new version, deactivates previous, and records audit log', async () => {
    const prevRes = await request(app)
      .get('/api/v1/admin/verification-settings')
      .set('Cookie', adminCookie);
    const prevVersion = prevRes.body.data.active.version;
    const highestVersion = Math.max(
      ...prevRes.body.data.history.map((h: any) => h.version),
      prevVersion
    );

    const createRes = await request(app)
      .post('/api/v1/admin/verification-settings')
      .set('Cookie', adminCookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'High Security Cohort Profile',
        thresholdPct: 82.5,
        intervalMs: 2000,
        consecutiveMismatchLimit: 2,
        missingFaceLimit: 3,
        multipleFacesPolicy: 'ALERT_IMMEDIATELY',
        multipleFacesConsecutiveLimit: 1,
        cameraFailurePolicy: 'ALERT_AFTER_GRACE',
        cameraGraceSeconds: 5,
        serviceFailureLimit: 3,
        repeatedFailureLimit: 5,
        recoveryMatchCount: 4,
        startupGraceSeconds: 15,
        preExamRequiredMatches: 3,
        changeNote: 'Tightened security thresholds for final exam period',
      });

    expect(createRes.status).toBe(201);
    const newSetting = createRes.body.data;
    expect(newSetting.version).toBe(highestVersion + 1);
    expect(newSetting.isActive).toBe(true);
    expect(newSetting.thresholdPct).toBe(82.5);

    // Verify previous version is deactivated
    const prevSettingInDb = await prisma.verificationSetting.findFirst({
      where: { version: prevVersion },
    });
    expect(prevSettingInDb?.isActive).toBe(false);

    // Verify audit log
    const auditLog = await prisma.adminAuditLog.findFirst({
      where: {
        action: 'SETTINGS_CHANGED',
        entityId: newSetting.id,
      },
    });
    expect(auditLog).toBeDefined();
    expect((auditLog?.after as any)?.version).toBe(newSetting.version);
  });

  afterAll(async () => {
    await prisma.verificationSetting.updateMany({
      where: { version: { gt: 1 } },
      data: { isActive: false },
    });
    await prisma.verificationSetting.updateMany({
      where: { version: 1 },
      data: { isActive: true },
    });
  });
});
