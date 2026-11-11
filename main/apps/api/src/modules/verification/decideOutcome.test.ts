import { describe, it, expect } from 'vitest';
import { decideOutcome } from './decideOutcome.js';
import { VisionVerifyResponse } from '../../lib/vision-client.js';

describe('decideOutcome pure logic', () => {
  const defaultSettings = {
    matchThresholdPct: 75.0,
    minFaceQuality: 0.60,
  };

  const baseResponse: VisionVerifyResponse = {
    faceCount: 1,
    faces: [
      {
        box: [10, 10, 100, 100],
        detScore: 0.95,
        yaw: 0,
        pitch: 0,
        roll: 0,
        poseSource: 'test',
      },
    ],
    quality: {
      blur: 150,
      brightness: 120,
      faceSizeRatio: 0.3,
      faceInFrame: true,
      poseOk: true,
      underExposureFraction: 0,
      overExposureFraction: 0,
    },
    similarityRaw: 0.50,
    similarityPct: 80.0,
    modelName: 'buffalo_l',
    modelVersion: '1.0',
    calibrationStatus: 'PROVISIONAL',
    ms: 45.2,
  };

  it('returns NO_FACE when faceCount is 0', () => {
    const res = decideOutcome(
      { ...baseResponse, faceCount: 0, faces: [], similarityPct: null, similarityRaw: null },
      defaultSettings
    );
    expect(res.outcome).toBe('NO_FACE');
    expect(res.errorCode).toBeNull();
    expect(res.studentMessage).toBe('Face not detected');
  });

  it('returns MULTIPLE_FACES when faceCount > 1', () => {
    const res = decideOutcome(
      {
        ...baseResponse,
        faceCount: 2,
        faces: [baseResponse.faces[0], baseResponse.faces[0]],
        similarityPct: null,
        similarityRaw: null,
      },
      defaultSettings
    );
    expect(res.outcome).toBe('MULTIPLE_FACES');
    expect(res.errorCode).toBeNull();
    expect(res.studentMessage).toBe('Multiple faces detected');
  });

  it('returns LOW_QUALITY_FRAME when detScore is below minFaceQuality', () => {
    const res = decideOutcome(
      {
        ...baseResponse,
        faces: [{ ...baseResponse.faces[0], detScore: 0.45 }],
      },
      defaultSettings
    );
    expect(res.outcome).toBe('VERIFICATION_ERROR');
    expect(res.errorCode).toBe('LOW_QUALITY_FRAME');
    expect(res.studentMessage).toBe('Image unclear, improve lighting');
  });

  it('returns LOW_QUALITY_FRAME when similarityPct is null for single face', () => {
    const res = decideOutcome(
      {
        ...baseResponse,
        similarityPct: null,
      },
      defaultSettings
    );
    expect(res.outcome).toBe('VERIFICATION_ERROR');
    expect(res.errorCode).toBe('LOW_QUALITY_FRAME');
  });

  it('returns MATCH when similarityPct is strictly greater than threshold', () => {
    const res = decideOutcome(
      {
        ...baseResponse,
        similarityPct: 82.5,
      },
      defaultSettings
    );
    expect(res.outcome).toBe('MATCH');
    expect(res.errorCode).toBeNull();
    expect(res.similarityPct).toBe(82.5);
    expect(res.studentMessage).toBe('Identity verified');
  });

  it('returns MATCH at exact boundary equality (pct == threshold)', () => {
    const res = decideOutcome(
      {
        ...baseResponse,
        similarityPct: 75.0,
      },
      defaultSettings
    );
    expect(res.outcome).toBe('MATCH');
    expect(res.similarityPct).toBe(75.0);
    expect(res.studentMessage).toBe('Identity verified');
  });

  it('returns MISMATCH when similarityPct is below threshold', () => {
    const res = decideOutcome(
      {
        ...baseResponse,
        similarityPct: 74.9,
      },
      defaultSettings
    );
    expect(res.outcome).toBe('MISMATCH');
    expect(res.errorCode).toBeNull();
    expect(res.similarityPct).toBe(74.9);
    expect(res.studentMessage).toBe('Identity could not be confirmed');
  });
});

