import http from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { createWebSocketServer } from './server.js';
import { SessionEventCoalescer } from './coalesce.js';
import { createWsEnvelope } from './protocol.js';
import { verificationEventBus } from '../modules/verification/eventBus.js';
import { WsEnvelope } from '@examguard/shared';

// Recursive validator to ensure zero biometric data (embeddings or raw images) in payloads
export function assertZeroBiometricLeakage(obj: unknown, path = 'root'): void {
  if (obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    // Check if it's an embedding vector (128 to 512 numbers)
    if (obj.length >= 128 && obj.every((item) => typeof item === 'number')) {
      throw new Error(`Biometric embedding vector leaked at ${path} (length: ${obj.length})`);
    }
    obj.forEach((item, index) => assertZeroBiometricLeakage(item, `${path}[${index}]`));
    return;
  }

  if (typeof obj === 'string') {
    // Check for base64 encoded image or data URI
    if (obj.startsWith('data:image/')) {
      throw new Error(`Data URI image leaked at ${path}`);
    }
    if (obj.length > 500 && /^[A-Za-z0-9+/=]+$/.test(obj)) {
      throw new Error(`Potential raw base64 image data leaked at ${path} (length: ${obj.length})`);
    }
    return;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      assertZeroBiometricLeakage(val, `${path}.${key}`);
    }
  }
}

describe('Live Monitoring WebSocket Infrastructure Suite (Prompt 08)', () => {
  let server: http.Server;
  let wsPort: number;
  let adminCookie: string;
  let studentCookie: string;
  let adminUserId: string;
  let studentUserId: string;

  beforeAll(async () => {
    // 1. Setup Admin User
    const adminEmail = `ws_admin_${Date.now()}@test.local`;
    const adminPassword = 'AdminPassword1234!';
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'WS Admin Tester',
        passwordHash: await hashPassword(adminPassword),
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;

    // 2. Setup Student User
    const studentEmail = `ws_student_${Date.now()}@test.local`;
    const studentPassword = 'StudentPassword1234!';
    const student = await prisma.user.create({
      data: {
        email: studentEmail,
        fullName: 'WS Student Tester',
        passwordHash: await hashPassword(studentPassword),
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    });
    studentUserId = student.id;

    // 3. Obtain CSRF Token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const setCookie = csrfRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    const csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
    const csrfToken = csrfRes.body.data.csrfToken;

    // 4. Login Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: adminEmail, password: adminPassword });

    expect(adminLoginRes.status).toBe(200);
    const adminSetCookies = adminLoginRes.headers['set-cookie'];
    const adminCookieList = Array.isArray(adminSetCookies) ? adminSetCookies : [adminSetCookies as string];
    adminCookie = adminCookieList.find((c) => c.startsWith('eg_session=')) || '';
    expect(adminCookie).toBeTruthy();

    // 5. Login Student
    const studentLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: studentEmail, password: studentPassword });

    expect(studentLoginRes.status).toBe(200);
    const studentSetCookies = studentLoginRes.headers['set-cookie'];
    const studentCookieList = Array.isArray(studentSetCookies) ? studentSetCookies : [studentSetCookies as string];
    studentCookie = studentCookieList.find((c) => c.startsWith('eg_session=')) || '';
    expect(studentCookie).toBeTruthy();

    // 6. Create HTTP Server + WebSocket Server on random port
    server = http.createServer(app);
    createWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        wsPort = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Unit: Coalescing Queue and Zero Biometric Leakage', () => {
    it('coalesces rapid session updates into at most one delivery per period', async () => {
      const messages: any[] = [];
      const fakeWs = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          messages.push(JSON.parse(data));
        },
      } as unknown as WebSocket;

      const coalescer = new SessionEventCoalescer(fakeWs, 50); // 50ms window for fast test

      // Enqueue 5 rapid updates for same session
      for (let i = 1; i <= 5; i++) {
        coalescer.enqueueSessionUpdated({
          sessionId: 'sess-123',
          studentUserId: 'stu-1',
          examId: 'exam-1',
          totalAttempts: i,
          matchCount: i,
          mismatchCount: 0,
          lastOutcome: 'MATCH',
          lastSimilarityPct: 90 + i,
          lastSeenAt: new Date().toISOString(),
        });
      }

      // First update delivered immediately (leading edge)
      expect(messages.length).toBe(1);
      expect(messages[0].payload.totalAttempts).toBe(1);

      // Wait 80ms for trailing flush
      await new Promise((resolve) => setTimeout(resolve, 80));

      // Exactly 2 messages total: first update (immediate) + coalesced latest update (totalAttempts: 5)
      expect(messages.length).toBe(2);
      expect(messages[1].type).toBe('session.updated');
      expect(messages[1].payload.totalAttempts).toBe(5);
      expect(messages[1].payload.lastSimilarityPct).toBe(95);

      coalescer.destroy();
    });

    it('assertZeroBiometricLeakage rejects 512-dimension vector or base64 image strings', () => {
      // 512-d float array
      const embedding = new Array(512).fill(0.123);
      expect(() =>
        assertZeroBiometricLeakage({ session: 's1', embedding })
      ).toThrow(/Biometric embedding vector leaked/);

      // Data URI
      expect(() =>
        assertZeroBiometricLeakage({ avatar: 'data:image/jpeg;base64,/9j/4AAQ...' })
      ).toThrow(/Data URI image leaked/);

      // Clean payload passes
      expect(() =>
        assertZeroBiometricLeakage({
          type: 'session.updated',
          payload: { sessionId: 's1', outcome: 'MATCH', lastSimilarityPct: 88.5 },
        })
      ).not.toThrow();
    });
  });

  describe('Integration: WebSocket Upgrade Authentication & RBAC', () => {
    it('rejects handshake with 401 when session cookie is missing', async () => {
      await new Promise<void>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
          headers: {
            Origin: 'http://localhost:3000',
          },
        });

        client.on('open', () => {
          client.close();
          reject(new Error('Expected handshake rejection without cookie'));
        });

        client.on('error', (err: any) => {
          expect(err.message).toMatch(/401|Unexpected server response: 401/);
          resolve();
        });
      });
    });

    it('rejects handshake with 403 when session cookie belongs to a STUDENT', async () => {
      await new Promise<void>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
          headers: {
            Cookie: studentCookie,
            Origin: 'http://localhost:3000',
          },
        });

        client.on('open', () => {
          client.close();
          reject(new Error('Expected student upgrade rejection with 403'));
        });

        client.on('error', (err: any) => {
          expect(err.message).toMatch(/403|Unexpected server response: 403/);
          resolve();
        });
      });
    });

    it('rejects handshake with 403 when Origin header does not match env.WEB_ORIGIN', async () => {
      await new Promise<void>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
          headers: {
            Cookie: adminCookie,
            Origin: 'http://malicious-attacker.com',
          },
        });

        client.on('open', () => {
          client.close();
          reject(new Error('Expected origin mismatch rejection with 403'));
        });

        client.on('error', (err: any) => {
          expect(err.message).toMatch(/403|Unexpected server response: 403/);
          resolve();
        });
      });
    });

    it('accepts handshake for authenticated ADMIN with valid Origin', async () => {
      await new Promise<void>((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
          headers: {
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
          },
        });

        client.on('open', () => {
          client.close();
          resolve();
        });

        client.on('error', (err) => {
          reject(err);
        });
      });
    });
  });

  describe('Integration: Protocol Ping/Pong & Incident Broadcasts', () => {
    it('replies to ping message with pong envelope', async () => {
      const client = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
      });

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => resolve());
        client.on('error', reject);
      });

      const messagePromise = new Promise<WsEnvelope>((resolve) => {
        client.on('message', (raw) => {
          const envelope = JSON.parse(raw.toString('utf-8'));
          if (envelope.type === 'pong') {
            resolve(envelope);
          }
        });
      });

      client.send(JSON.stringify({ action: 'ping' }));
      const pong = await messagePromise;

      expect(pong.type).toBe('pong');
      expect(pong.eventId).toBeGreaterThan(0);
      expect(pong.emittedAt).toBeTruthy();
      expect(pong.payload).toHaveProperty('timestamp');

      client.close();
    });

    it('broadcasts incident.opened to subscribed admin socket without biometric leakage', async () => {
      const client = new WebSocket(`ws://127.0.0.1:${wsPort}/ws`, {
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
      });

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => resolve());
        client.on('error', reject);
      });

      // Subscribe to monitoring channel
      client.send(JSON.stringify({ action: 'subscribe', channel: 'monitoring' }));

      // Wait a moment for subscription registration
      await new Promise((r) => setTimeout(r, 50));

      const receivedPromise = new Promise<WsEnvelope>((resolve) => {
        client.on('message', (raw) => {
          const envelope = JSON.parse(raw.toString('utf-8'));
          if (envelope.type === 'incident.opened') {
            resolve(envelope);
          }
        });
      });

      // Emit incident.opened event via verificationEventBus
      const testIncidentId = 'inc-test-' + Date.now();
      const testIncidentCode = 'INC-20261111-TEST01';
      verificationEventBus.emitIncidentOpened({
        incidentId: testIncidentId,
        incidentCode: testIncidentCode,
        sessionId: 'session-ws-1',
        studentUserId: studentUserId,
        examId: 'exam-ws-1',
        triggerType: 'IDENTITY_MISMATCH',
        severity: 'CRITICAL',
        firstSimilarityPct: 24.5,
        timestamp: new Date(),
      });

      const received = await receivedPromise;
      expect(received.type).toBe('incident.opened');
      expect(received.payload.incidentCode).toBe(testIncidentCode);
      expect(received.payload.severity).toBe('CRITICAL');
      expect(received.payload.firstSimilarityPct).toBe(24.5);

      // Verify ZERO biometric leakage
      assertZeroBiometricLeakage(received);

      client.close();
    });
  });
});
