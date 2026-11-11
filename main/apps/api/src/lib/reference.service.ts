import { prisma } from './prisma.js';
import { decryptAesGcm } from './crypto.js';
import { AppError } from './errors.js';
import { defaultVisionClient, IVisionClient } from './vision-client.js';

interface CachedReference {
  centroidBase64: string;
  modelName: string;
  modelVersion: string;
  expiresAt: number;
}

export class ReferenceService {
  private cache = new Map<string, CachedReference>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private visionClient: IVisionClient;
  private visionModelCache: { modelName: string; modelVersion: string; expiresAt: number } | null = null;

  constructor(options?: {
    ttlMs?: number;
    maxEntries?: number;
    visionClient?: IVisionClient;
  }) {
    this.ttlMs = options?.ttlMs ?? 60_000; // 60 seconds TTL
    this.maxEntries = options?.maxEntries ?? 100; // Hard size cap
    this.visionClient = options?.visionClient ?? defaultVisionClient;
  }

  private async getVisionModelInfo(): Promise<{ modelName: string; modelVersion: string }> {
    const now = Date.now();
    if (this.visionModelCache && this.visionModelCache.expiresAt > now) {
      return {
        modelName: this.visionModelCache.modelName,
        modelVersion: this.visionModelCache.modelVersion,
      };
    }

    try {
      const diag = await this.visionClient.diagnostics();
      if (!diag.modelName || !diag.modelVersion) {
        throw new AppError('MODEL_UNAVAILABLE', 503, 'Vision model is not loaded');
      }
      this.visionModelCache = {
        modelName: diag.modelName,
        modelVersion: diag.modelVersion,
        expiresAt: now + 30_000, // cache diagnostics for 30s
      };
      return {
        modelName: diag.modelName,
        modelVersion: diag.modelVersion,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError('SERVICE_UNAVAILABLE', 503, 'Cannot reach vision service to verify model identity');
    }
  }

  async load(faceProfileId: string): Promise<{ centroidBase64: string; modelName: string; modelVersion: string }> {
    const now = Date.now();
    const cached = this.cache.get(faceProfileId);
    if (cached && cached.expiresAt > now) {
      return {
        centroidBase64: cached.centroidBase64,
        modelName: cached.modelName,
        modelVersion: cached.modelVersion,
      };
    }

    // Load from DB
    const embedding = await prisma.faceEmbedding.findFirst({
      where: {
        faceProfileId,
        kind: 'CENTROID',
      },
    });

    if (!embedding) {
      throw new AppError('NOT_FOUND', 404, 'Centroid reference embedding not found for profile');
    }

    // Verify model compatibility with vision service
    const visionModel = await this.getVisionModelInfo();
    if (
      embedding.modelName !== visionModel.modelName ||
      embedding.modelVersion !== visionModel.modelVersion
    ) {
      throw new AppError(
        'MODEL_MISMATCH',
        400,
        `Reference model (${embedding.modelName} v${embedding.modelVersion}) does not match vision service (${visionModel.modelName} v${visionModel.modelVersion})`
      );
    }

    // In-memory AES-GCM decryption
    const decryptedBytes = decryptAesGcm(
      Buffer.from(embedding.ciphertext),
      Buffer.from(embedding.encIv),
      Buffer.from(embedding.encTag),
      'EMBEDDING'
    );

    const centroidBase64 = decryptedBytes.toString('base64');

    // LRU eviction if at max capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(faceProfileId, {
      centroidBase64,
      modelName: embedding.modelName,
      modelVersion: embedding.modelVersion,
      expiresAt: now + this.ttlMs,
    });

    return {
      centroidBase64,
      modelName: embedding.modelName,
      modelVersion: embedding.modelVersion,
    };
  }

  invalidate(faceProfileId: string): void {
    this.cache.delete(faceProfileId);
  }

  clear(): void {
    this.cache.clear();
    this.visionModelCache = null;
  }

  size(): number {
    return this.cache.size;
  }
}

export const referenceService = new ReferenceService();
