import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { SandboxService } from '../src/modules/sandbox/sandbox.service.js';
import { IVisionClient } from '../src/lib/vision-client.js';

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

  it('POST /api/v1/sandbox/scrfd-detect rejects requests missing frame buffer with 400', async () => {
    const res = await request(app)
      .post('/api/v1/sandbox/scrfd-detect')
      .field('frameId', 'test_frame_1');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /api/v1/sandbox/reset resets SQLite sandbox database successfully without auth', async () => {
    const res = await request(app).post('/api/v1/sandbox/reset');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  describe('SCRFD Face Detection Contract & State Mapping', () => {
    it('accurately parses SINGLE_FACE with 5 real keypoints and latency', async () => {
      const mockVisionClient: IVisionClient = {
        health: async () => ({ status: 'OK', modelLoaded: true }),
        diagnostics: async () => ({} as any),
        quality: async () => ({
          faceCount: 1,
          faces: [
            {
              box: [120, 60, 340, 360],
              detScore: 0.982,
              yaw: 1.2,
              pitch: -0.5,
              roll: 0.1,
              poseSource: 'insightface',
              kps: [
                [175, 160], // Left Eye
                [270, 160], // Right Eye
                [222, 215], // Nose Tip
                [185, 275], // Left Mouth
                [260, 275], // Right Mouth
              ],
            },
          ],
          quality: {
            blur: 95,
            brightness: 120,
            faceSizeRatio: 0.25,
            faceInFrame: true,
            poseOk: true,
            underExposureFraction: 0,
            overExposureFraction: 0,
          },
          reasons: [],
          ms: 24.5,
          frameWidth: 640,
          frameHeight: 480,
        }),
        embed: async () => ({} as any),
        verify: async () => ({} as any),
      };

      const service = new SandboxService(mockVisionClient);
      const res = await service.detectScrfd(Buffer.from('sample-frame'), 'frame_001');

      expect(res.success).toBe(true);
      expect(res.frame_id).toBe('frame_001');
      expect(res.frame_width).toBe(640);
      expect(res.frame_height).toBe(480);
      expect(res.face_count).toBe(1);
      expect(res.status).toBe('SINGLE_FACE');
      expect(res.message).toBe('Face detection successful. Ready for verification.');
      expect(res.inference_time_ms).toBe(24.5);
      expect(res.faces.length).toBe(1);

      const f = res.faces[0];
      expect(f.bbox).toEqual([120, 60, 340, 360]);
      expect(f.confidence).toBe(0.982);
      expect(f.keypoints.length).toBe(5);
      expect(f.keypoints[0]).toEqual([175, 160]); // Left eye
      expect(f.keypoints[1]).toEqual([270, 160]); // Right eye
      expect(f.keypoints[2]).toEqual([222, 215]); // Nose tip
      expect(f.keypoints[3]).toEqual([185, 275]); // Left mouth
      expect(f.keypoints[4]).toEqual([260, 275]); // Right mouth
    });

    it('returns NO_FACE state when faceCount is 0', async () => {
      const mockVisionClient: IVisionClient = {
        health: async () => ({ status: 'OK', modelLoaded: true }),
        diagnostics: async () => ({} as any),
        quality: async () => ({
          faceCount: 0,
          faces: [],
          quality: {
            blur: 0,
            brightness: 0,
            faceSizeRatio: 0,
            faceInFrame: false,
            poseOk: false,
            underExposureFraction: 0,
            overExposureFraction: 0,
          },
          reasons: ['NO_FACE'],
          ms: 18.2,
          frameWidth: 640,
          frameHeight: 480,
        }),
        embed: async () => ({} as any),
        verify: async () => ({} as any),
      };

      const service = new SandboxService(mockVisionClient);
      const res = await service.detectScrfd(Buffer.from('empty-frame'));

      expect(res.face_count).toBe(0);
      expect(res.status).toBe('NO_FACE');
      expect(res.message).toBe('No face detected. Please position your face in front of the camera.');
      expect(res.faces.length).toBe(0);
    });

    it('returns MULTIPLE_FACES state when faceCount is greater than 1', async () => {
      const mockVisionClient: IVisionClient = {
        health: async () => ({ status: 'OK', modelLoaded: true }),
        diagnostics: async () => ({} as any),
        quality: async () => ({
          faceCount: 2,
          faces: [
            {
              box: [50, 50, 200, 200],
              detScore: 0.95,
              yaw: 0,
              pitch: 0,
              roll: 0,
              poseSource: 'insightface',
              kps: [[80, 80], [120, 80], [100, 110], [90, 140], [110, 140]],
            },
            {
              box: [300, 50, 450, 200],
              detScore: 0.91,
              yaw: 0,
              pitch: 0,
              roll: 0,
              poseSource: 'insightface',
              kps: [[330, 80], [370, 80], [350, 110], [340, 140], [360, 140]],
            },
          ],
          quality: {
            blur: 90,
            brightness: 110,
            faceSizeRatio: 0.15,
            faceInFrame: true,
            poseOk: true,
            underExposureFraction: 0,
            overExposureFraction: 0,
          },
          reasons: ['MULTIPLE_FACES'],
          ms: 32.1,
          frameWidth: 640,
          frameHeight: 480,
        }),
        embed: async () => ({} as any),
        verify: async () => ({} as any),
      };

      const service = new SandboxService(mockVisionClient);
      const res = await service.detectScrfd(Buffer.from('two-faces-frame'));

      expect(res.face_count).toBe(2);
      expect(res.status).toBe('MULTIPLE_FACES');
      expect(res.message).toContain('Multiple faces detected (2)');
      expect(res.faces.length).toBe(2);
      expect(res.faces[0].keypoints.length).toBe(5);
      expect(res.faces[1].keypoints.length).toBe(5);
    });
  });
});

