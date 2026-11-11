import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import * as prismaModule from '../../lib/prisma.js';
import type { IVisionClient } from '../../lib/vision-client.js';
import { HealthService } from './health.service.js';

describe('Health and System Endpoints', () => {
  const app = createApp();

  it('GET /api/v1/health returns liveness with status ok and 200', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptimeSec).toBe('number');
    expect(res.body.data.version).toBe('0.1.0');
  });

  it('sets X-Request-Id header on response', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('returns standard error envelope on 404 unknown route', async () => {
    const res = await request(app).get('/api/v1/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('returns standard error envelope on invalid JSON body', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad-json: true');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('JSON');
  });
});

describe('HealthService Readiness scenarios', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 when DB is UP and Vision is UP', async () => {
    vi.spyOn(prismaModule, 'checkDatabaseConnection').mockResolvedValue({ ok: true });

    const mockVision: IVisionClient = {
      health: vi.fn().mockResolvedValue({ status: 'OK', modelLoaded: true }),
      diagnostics: vi.fn().mockResolvedValue({
        versions: {},
        executionProviders: ['CPUExecutionProvider'],
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        modelState: 'READY',
        modelPathPresent: true,
        calibrationStatus: 'PROVISIONAL',
        concurrency: { inFlight: 0, limit: 2 },
        lastError: null,
      }),
      quality: vi.fn(),
      embed: vi.fn(),
      verify: vi.fn(),
    };

    const service = new HealthService(mockVision);
    const result = await service.getReadiness();

    expect(result.httpStatus).toBe(200);
    expect(result.data.database).toBe('UP');
    expect(result.data.vision).toBe('UP');
  });

  it('returns 200 with DEGRADED vision when model is not loaded', async () => {
    vi.spyOn(prismaModule, 'checkDatabaseConnection').mockResolvedValue({ ok: true });

    const mockVision: IVisionClient = {
      health: vi.fn().mockResolvedValue({ status: 'DEGRADED', modelLoaded: false }),
      diagnostics: vi.fn(),
      quality: vi.fn(),
      embed: vi.fn(),
      verify: vi.fn(),
    };

    const service = new HealthService(mockVision);
    const result = await service.getReadiness();

    expect(result.httpStatus).toBe(200);
    expect(result.data.database).toBe('UP');
    expect(result.data.vision).toBe('DEGRADED');
  });

  it('returns 200 with DOWN vision when vision service is unreachable', async () => {
    vi.spyOn(prismaModule, 'checkDatabaseConnection').mockResolvedValue({ ok: true });

    const mockVision: IVisionClient = {
      health: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      diagnostics: vi.fn(),
      quality: vi.fn(),
      embed: vi.fn(),
      verify: vi.fn(),
    };

    const service = new HealthService(mockVision);
    const result = await service.getReadiness();

    expect(result.httpStatus).toBe(200);
    expect(result.data.database).toBe('UP');
    expect(result.data.vision).toBe('DOWN');
    expect(result.data.details.visionError).toContain('ECONNREFUSED');
  });

  it('returns 503 when Database is DOWN (even if Vision is UP)', async () => {
    vi.spyOn(prismaModule, 'checkDatabaseConnection').mockResolvedValue({
      ok: false,
      error: 'Can not connect to MySQL server at localhost:3306',
    });

    const mockVision: IVisionClient = {
      health: vi.fn().mockResolvedValue({ status: 'OK', modelLoaded: true }),
      diagnostics: vi.fn(),
      quality: vi.fn(),
      embed: vi.fn(),
      verify: vi.fn(),
    };

    const service = new HealthService(mockVision);
    const result = await service.getReadiness();

    expect(result.httpStatus).toBe(503);
    expect(result.data.database).toBe('DOWN');
    expect(result.data.vision).toBe('UP');
    expect(result.data.details.databaseError).toContain('MySQL');
  });
});

