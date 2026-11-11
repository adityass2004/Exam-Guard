import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Sandbox Biometric Playground (Unauthenticated & Standalone DB)', () => {
  it('GET /api/v1/sandbox/faces is accessible without authentication', async () => {
    const res = await request(app).get('/api/v1/sandbox/faces');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/v1/sandbox/enroll rejects requests missing frame buffer with 400', async () => {
    const res = await request(app)
      .post('/api/v1/sandbox/enroll')
      .field('label', 'Subject Test');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /api/v1/sandbox/detect rejects requests missing frame buffer with 400', async () => {
    const res = await request(app)
      .post('/api/v1/sandbox/detect')
      .field('thresholdPct', '80');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /api/v1/sandbox/reset resets SQLite sandbox database successfully without auth', async () => {
    const res = await request(app).post('/api/v1/sandbox/reset');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });
});

