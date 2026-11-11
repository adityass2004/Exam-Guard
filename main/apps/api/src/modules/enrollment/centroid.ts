import { AppError } from '../../lib/errors.js';

export interface CentroidComputationResult {
  centroid: Float32Array;
  similarities: number[];
  minObservedSimilarity: number;
}

export function float32ArrayToBuffer(array: Float32Array): Buffer {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

export function bufferToFloat32Array(buffer: Buffer): Float32Array {
  // Ensure word alignment by copying into a clean ArrayBuffer if byteOffset is unaligned
  const copy = new Uint8Array(buffer.length);
  copy.set(buffer);
  return new Float32Array(copy.buffer, 0, buffer.length / 4);
}

export function base64ToFloat32Array(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return bufferToFloat32Array(buf);
}

export function float32ArrayToBase64(array: Float32Array): string {
  return float32ArrayToBuffer(array).toString('base64');
}

export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimension mismatch for dot product');
  }
  let sum = 0.0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function computeCentroid(samples: Float32Array[]): CentroidComputationResult {
  if (!samples || samples.length === 0) {
    throw new AppError('VALIDATION_ERROR', 400, 'Cannot compute centroid from empty sample list');
  }

  const dim = samples[0].length;
  for (const s of samples) {
    if (s.length !== dim) {
      throw new AppError('VALIDATION_ERROR', 400, `Inconsistent embedding dimension: expected ${dim}, got ${s.length}`);
    }
  }

  // 1. Accumulate sum of vectors
  const sumVec = new Float32Array(dim);
  for (const sample of samples) {
    for (let i = 0; i < dim; i++) {
      sumVec[i] += sample[i];
    }
  }

  // 2. Compute L2 norm
  let normSq = 0.0;
  for (let i = 0; i < dim; i++) {
    normSq += sumVec[i] * sumVec[i];
  }
  const norm = Math.sqrt(normSq);

  if (norm < 1e-6) {
    throw new AppError('VALIDATION_ERROR', 400, 'Degenerate sample embeddings sum to zero norm');
  }

  // 3. Normalize centroid to unit length
  const centroid = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    centroid[i] = sumVec[i] / norm;
  }

  // 4. Compute cosine similarity of each sample against the centroid
  const similarities: number[] = [];
  let minObserved = 1.0;

  for (const sample of samples) {
    // Assuming each sample is already L2-normalized from model, dot product is cosine similarity
    let sampleNormSq = 0.0;
    for (let i = 0; i < dim; i++) {
      sampleNormSq += sample[i] * sample[i];
    }
    const sampleNorm = Math.sqrt(sampleNormSq);
    const sim = sampleNorm > 1e-6 ? dotProduct(sample, centroid) / sampleNorm : 0.0;

    similarities.push(sim);
    if (sim < minObserved) {
      minObserved = sim;
    }
  }

  return {
    centroid,
    similarities,
    minObservedSimilarity: minObserved,
  };
}
