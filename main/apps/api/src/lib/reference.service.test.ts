import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceService } from './reference.service.js';
import { IVisionClient } from './vision-client.js';
import { encryptAesGcm } from './crypto.js';
import { prisma } from './prisma.js';

describe('ReferenceService in-memory decryption & cache', () => {
  const mockVisionClient: IVisionClient = {
    async health() {
      return { status: 'OK', modelLoaded: true };
    },
    async diagnostics() {
      return {
        versions: {},
        executionProviders: [],
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        modelState: 'READY',
        modelPathPresent: true,
        calibrationStatus: 'PROVISIONAL',
        concurrency: { inFlight: 0, limit: 2 },
        lastError: null,
      };
    },
    async quality() {
      throw new Error('Not implemented in mock');
    },
    async embed() {
      throw new Error('Not implemented in mock');
    },
    async verify() {
      throw new Error('Not implemented in mock');
    },
  };

  let service: ReferenceService;

  beforeEach(() => {
    service = new ReferenceService({
      ttlMs: 500,
      maxEntries: 2,
      visionClient: mockVisionClient,
    });
  });

  it('rejects with MODEL_MISMATCH if vision model differs from embedding', async () => {
    const mismatchClient: IVisionClient = {
      ...mockVisionClient,
      async diagnostics() {
        return {
          ...(await mockVisionClient.diagnostics()),
          modelName: 'different_model',
        };
      },
    };
    const mismatchService = new ReferenceService({
      visionClient: mismatchClient,
    });

    // Create student and test profile in DB
    const student = await prisma.user.create({
      data: {
        email: `ref_test_${Date.now()}@test.local`,
        fullName: 'Test Student Reference',
        passwordHash: 'hash',
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentId: `REF${Date.now()}`,
          },
        },
      },
    });

    const profile = await prisma.faceProfile.create({
      data: {
        studentUserId: student.id,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });

    const rawFloats = new Float32Array(512).fill(0.1);
    const enc = encryptAesGcm(Buffer.from(rawFloats.buffer), 'EMBEDDING');

    await prisma.faceEmbedding.create({
      data: {
        faceProfileId: profile.id,
        kind: 'CENTROID',
        ciphertext: Buffer.from(enc.ciphertext),
        encIv: Buffer.from(enc.iv),
        encTag: Buffer.from(enc.tag),
        encKeyVersion: 1,
        dim: 512,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
      },
    });

    await expect(mismatchService.load(profile.id)).rejects.toThrow(/does not match vision service/);
  });

  it('loads, decrypts, caches and invalidates reference embedding', async () => {
    const student = await prisma.user.create({
      data: {
        email: `ref_test_cache_${Date.now()}@test.local`,
        fullName: 'Test Cache Student',
        passwordHash: 'hash',
        role: 'STUDENT',
        studentProfile: {
          create: {
            studentId: `CACHE${Date.now()}`,
          },
        },
      },
    });

    const profile = await prisma.faceProfile.create({
      data: {
        studentUserId: student.id,
        version: 1,
        status: 'APPROVED',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });

    const rawFloats = new Float32Array(512).fill(0.2);
    const enc = encryptAesGcm(Buffer.from(rawFloats.buffer), 'EMBEDDING');

    await prisma.faceEmbedding.create({
      data: {
        faceProfileId: profile.id,
        kind: 'CENTROID',
        ciphertext: Buffer.from(enc.ciphertext),
        encIv: Buffer.from(enc.iv),
        encTag: Buffer.from(enc.tag),
        encKeyVersion: 1,
        dim: 512,
        modelName: 'buffalo_l',
        modelVersion: '1.0',
      },
    });

    const loaded1 = await service.load(profile.id);
    expect(loaded1.centroidBase64).toBeDefined();
    expect(service.size()).toBe(1);

    // Second call served from cache
    const loaded2 = await service.load(profile.id);
    expect(loaded2.centroidBase64).toBe(loaded1.centroidBase64);

    // Invalidate
    service.invalidate(profile.id);
    expect(service.size()).toBe(0);
  });
});
