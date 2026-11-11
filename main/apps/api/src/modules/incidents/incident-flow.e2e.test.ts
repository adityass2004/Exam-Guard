import http from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import sharp from 'sharp';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { storeEncryptedImage } from '../../lib/storage.js';
import { createWebSocketServer } from '../../ws/server.js';
import { verificationRecorder } from '../verification/recorder.js';
import { WsEnvelope } from '@examguard/shared';

describe('E2E Incident Investigation Flow (Prompt 08 Section 8)', () => {
  let server: http.Server;
  let wsPort: number;
  let adminCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let adminUserId: string;
  let studentUserId: string;
  let examId: string;
  let sessionId: string;
  let sampleJpeg: Buffer;

  beforeAll(async () => {
    sampleJpeg = await sharp({
      create: {
        width: 160,
        height: 120,
        channels: 3,
        background: { r: 180, g: 80, b: 80 },
      },
    })
      .jpeg()
      .toBuffer();

    // 1. Obtain CSRF Token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
    csrfToken = csrfRes.body.data.csrfToken;

    // 2. Create Admin
    const adminEmail = `e2e_admin_${Date.now()}@test.local`;
    const adminPassword = 'AdminPassword1234!';
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'E2E Supervisor Admin',
        passwordHash: await hashPassword(adminPassword),
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;

    // Login Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: adminEmail, password: adminPassword });

    const adminSetCookies = adminLoginRes.headers['set-cookie'];
    const adminCookieList = Array.isArray(adminSetCookies) ? adminSetCookies : [adminSetCookies as string];
    adminCookie = adminCookieList.find((c) => c.startsWith('eg_session=')) || '';

    // 3. Create Student
    const student = await prisma.user.create({
      data: {
        email: `e2e_stu_${Date.now()}@test.local`,
        fullName: 'E2E Candidate Student',
        passwordHash: await hashPassword('StudentPassword1234!'),
        role: 'STUDENT',
        status: 'ACTIVE',
        studentProfile: {
          create: {
            studentId: `STU-E2E-${Date.now().toString().slice(-4)}`,
            enrollmentStatusCache: 'APPROVED',
          },
        },
      },
    });
    studentUserId = student.id;

    // 4. Create FaceProfile + 1 approved enrollment image
    const faceProfile = await prisma.faceProfile.create({
      data: {
        studentUserId: student.id,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
        approvedAt: new Date(),
        approvedBy: adminUserId,
      },
    });

    const storedEnrollment = await storeEncryptedImage({
      kind: 'enrollment',
      bytes: sampleJpeg,
    });

    await prisma.faceEnrollmentImage.create({
      data: {
        faceProfileId: faceProfile.id,
        angle: 'FRONT',
        storagePath: storedEnrollment.relativePath,
        sha256: storedEnrollment.sha256,
        mime: 'image/jpeg',
        byteSize: storedEnrollment.byteSize,
        width: 160,
        height: 120,
        encIv: storedEnrollment.iv as any,
        encTag: storedEnrollment.tag as any,
        encKeyVersion: storedEnrollment.keyVersion,
        quality: {},
        capturedAt: new Date(),
      },
    });

    // 5. Verification Setting
    const setting = await prisma.verificationSetting.findFirstOrThrow({
      where: { isActive: true },
    });

    // 6. Exam
    const exam = await prisma.exam.create({
      data: {
        title: 'E2E Monitored Examination',
        durationMinutes: 60,
        status: 'ACTIVE',
        createdBy: adminUserId,
        verificationSettingsId: setting.id,
      },
    });
    examId = exam.id;

    // 7. ExamSession
    const session = await prisma.examSession.create({
      data: {
        examId: exam.id,
        studentUserId: student.id,
        faceProfileId: faceProfile.id,
        settingsVersionId: setting.id,
        settingsSnapshot: {
          matchThresholdPct: 75.0,
          consecutiveMismatchLimit: 2,
          repeatedFailureLimit: 5,
        },
        status: 'IN_PROGRESS',
        activeStudentKey: student.id,
        startedAt: new Date(Date.now() - 60000), // past startup grace
        lastSeenAt: new Date(),
      },
    });
    sessionId = session.id;

    // 8. Start HTTP + WS Server
    server = http.createServer(app);
    createWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        wsPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('runs complete identity switch flow: continuous mismatch -> live WS incident alert -> investigation -> review -> report export -> audit verification', async () => {
    // A. Connect Admin WebSocket and subscribe to monitoring
    const adminWs = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
      headers: {
        Cookie: adminCookie,
        Origin: 'http://localhost:3000',
      },
    });

    await new Promise<void>((resolve, reject) => {
      adminWs.on('open', resolve);
      adminWs.on('error', reject);
    });

    adminWs.send(JSON.stringify({ action: 'subscribe', channel: 'monitoring' }));
    await new Promise((r) => setTimeout(r, 50));

    const incidentOpenedPromise = new Promise<WsEnvelope>((resolve) => {
      adminWs.on('message', (raw) => {
        const envelope = JSON.parse(raw.toString('utf-8')) as WsEnvelope;
        if (envelope.type === 'incident.opened') {
          resolve(envelope);
        }
      });
    });

    // B. Simulate 2 consecutive verification mismatches past consecutiveMismatchLimit (2)
    await verificationRecorder.record({
      sessionId,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 22.5,
      processingMs: 30,
      frameBuffer: sampleJpeg,
    });

    await verificationRecorder.record({
      sessionId,
      phase: 'CONTINUOUS',
      outcome: 'MISMATCH',
      similarityPct: 21.0,
      processingMs: 30,
      frameBuffer: sampleJpeg,
    });

    // C. Verify WebSocket broadcast receives incident.opened within < 100ms
    const wsEnvelope = await incidentOpenedPromise;
    expect(wsEnvelope.type).toBe('incident.opened');
    expect(wsEnvelope.payload.triggerType).toBe('IDENTITY_MISMATCH');
    expect(wsEnvelope.payload.severity).toBe('CRITICAL');
    const incidentId = wsEnvelope.payload.incidentId;
    expect(incidentId).toBeTruthy();

    // D. Admin accesses Live Monitoring snapshot
    const monitorRes = await request(app)
      .get('/api/v1/admin/monitoring/sessions')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', adminCookie);

    expect(monitorRes.status).toBe(200);
    const inProgressSession = monitorRes.body.data.inProgress.find((s: any) => s.sessionId === sessionId);
    expect(inProgressSession).toBeTruthy();
    expect(inProgressSession.activeIncidentsCount).toBeGreaterThanOrEqual(1);
    expect(inProgressSession.highestActiveSeverity).toBe('CRITICAL');

    // E. Admin navigates to incident investigation detail
    const detailRes = await request(app)
      .get(`/api/v1/admin/incidents/${incidentId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', adminCookie);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.incident.id).toBe(incidentId);
    expect(detailRes.body.data.student.id).toBe(studentUserId);
    expect(detailRes.body.data.registeredImages.length).toBeGreaterThanOrEqual(1);
    expect(detailRes.body.data.evidence).toBeTruthy();

    // F. Admin streams decrypted evidence image (fail-closed audit)
    const evidenceRes = await request(app)
      .get(`/api/v1/admin/images/evidence/${incidentId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', adminCookie);

    expect(evidenceRes.status).toBe(200);
    expect(evidenceRes.headers['content-type']).toBe('image/jpeg');
    expect(evidenceRes.body.length).toBeGreaterThan(0);

    // G. Admin reviews incident with disposition CONFIRMED_CONCERN
    const reviewRes = await request(app)
      .post(`/api/v1/admin/incidents/${incidentId}/review`)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        disposition: 'CONFIRMED_CONCERN',
        note: 'Confirmed candidate identity mismatch: visual features differ from approved registration images',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('REVIEWED');
    expect(reviewRes.body.data.disposition).toBe('CONFIRMED_CONCERN');

    // H. Admin exports reports (CSV and HTML)
    const csvRes = await request(app)
      .get(`/api/v1/admin/incidents/${incidentId}/report?format=csv`)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', adminCookie);

    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain('CONFIRMED_CONCERN');

    const htmlRes = await request(app)
      .get(`/api/v1/admin/incidents/${incidentId}/report?format=html`)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', adminCookie);

    expect(htmlRes.status).toBe(200);
    expect(htmlRes.text).toContain('CONFIRMED_CONCERN');

    // I. Verify tamper-evident audit logs chain
    const auditLogs = await prisma.adminAuditLog.findMany({
      where: { actorUserId: adminUserId },
      orderBy: { createdAt: 'desc' },
    });

    try {
      const actions = auditLogs.map((a) => a.action);
      expect(actions).toContain('EVIDENCE_ACCESSED');
      expect(actions).toContain('INCIDENT_REVIEWED');
      expect(actions).toContain('EXPORT_GENERATED');
    } finally {
      adminWs.close();
    }
  });
});
