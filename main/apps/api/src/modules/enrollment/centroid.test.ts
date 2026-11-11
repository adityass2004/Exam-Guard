import { describe, expect, it } from 'vitest';
import {
  bufferToFloat32Array,
  computeCentroid,
  dotProduct,
  float32ArrayToBuffer,
} from './centroid.js';

describe('Biometric Centroid Math & Consistency', () => {
  it('correctly converts between Float32Array and Buffer without loss', () => {
    const original = new Float32Array([0.123, -0.456, 0.789, 1.0]);
    const buffer = float32ArrayToBuffer(original);
    const restored = bufferToFloat32Array(buffer);

    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(restored[i] - original[i])).toBeLessThan(1e-6);
    }
  });

  it('computes unit-norm centroid from identical vectors', () => {
    // 3 identical normalized 3D vectors: [1, 0, 0]
    const v1 = new Float32Array([1, 0, 0]);
    const v2 = new Float32Array([1, 0, 0]);
    const v3 = new Float32Array([1, 0, 0]);

    const result = computeCentroid([v1, v2, v3]);
    expect(result.centroid.length).toBe(3);
    expect(result.centroid[0]).toBeCloseTo(1.0, 5);
    expect(result.centroid[1]).toBeCloseTo(0.0, 5);
    expect(result.centroid[2]).toBeCloseTo(0.0, 5);

    expect(result.minObservedSimilarity).toBeCloseTo(1.0, 5);
    expect(result.similarities).toEqual([1, 1, 1]);
  });

  it('computes unit-norm centroid from orthogonal vectors and measures cosine similarity', () => {
    // v1 = [1, 0], v2 = [0, 1]
    const v1 = new Float32Array([1, 0]);
    const v2 = new Float32Array([0, 1]);

    const result = computeCentroid([v1, v2]);
    // sum = [1, 1], norm = sqrt(2), centroid = [1/sqrt(2), 1/sqrt(2)] ~ [0.7071, 0.7071]
    const expected = 1 / Math.SQRT2;
    expect(result.centroid[0]).toBeCloseTo(expected, 4);
    expect(result.centroid[1]).toBeCloseTo(expected, 4);

    // Each vector's similarity to centroid is cos(45 deg) = 1/sqrt(2) ~ 0.7071
    expect(result.minObservedSimilarity).toBeCloseTo(expected, 4);
    expect(result.similarities[0]).toBeCloseTo(expected, 4);
    expect(result.similarities[1]).toBeCloseTo(expected, 4);

    // Centroid itself has unit length
    const centroidNorm = Math.sqrt(dotProduct(result.centroid, result.centroid));
    expect(centroidNorm).toBeCloseTo(1.0, 5);
  });
});
