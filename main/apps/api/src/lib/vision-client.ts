import { env } from '../config/env.js';
import { logger } from './logger.js';

export class VisionError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;

  constructor(code: string, message: string, statusCode?: number) {
    super(message);
    this.name = 'VisionError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VisionUnavailableError extends VisionError {
  constructor(message = 'Vision service is unavailable (connection refused or offline)') {
    super('SERVICE_UNAVAILABLE', message, 503);
  }
}

export class VisionTimeoutError extends VisionError {
  constructor(message = 'Vision service request timed out') {
    super('SERVICE_TIMEOUT', message, 504);
  }
}

export class VisionBusyError extends VisionError {
  public readonly retryAfterSec?: number;

  constructor(message = 'Vision service is currently busy', retryAfterSec?: number) {
    super('SERVICE_BUSY', message, 503);
    this.retryAfterSec = retryAfterSec;
  }
}

export class ModelUnavailableError extends VisionError {
  constructor(message = 'Vision model is not loaded or unavailable') {
    super('MODEL_UNAVAILABLE', message, 503);
  }
}

export interface VisionHealthResponse {
  status: 'OK' | 'DEGRADED';
  modelLoaded: boolean;
}

export interface VisionDiagnosticsResponse {
  versions: Record<string, string | null>;
  executionProviders: string[];
  modelName: string | null;
  modelVersion: string | null;
  modelState: string;
  modelPathPresent: boolean;
  calibrationStatus: 'PROVISIONAL' | 'CALIBRATED';
  concurrency: {
    inFlight: number;
    limit: number;
  };
  lastError: string | null;
  poseSource?: string | null;
  mediapipeAvailable?: boolean;
}

export interface VisionFaceDetection {
  box: [number, number, number, number];
  detScore: number;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
  poseSource: string | null;
}

export interface VisionQualityMetrics {
  blur: number;
  brightness: number;
  faceSizeRatio: number;
  faceInFrame: boolean;
  poseOk: boolean;
  underExposureFraction: number;
  overExposureFraction: number;
}

export interface VisionQualityResponse {
  faceCount: number;
  faces: VisionFaceDetection[];
  quality: VisionQualityMetrics;
  reasons: string[];
  ms: number;
}

export interface VisionEmbedResponse extends VisionQualityResponse {
  embedding: string | null;
  modelName: string | null;
  modelVersion: string | null;
  dim: number | null;
}

export interface VisionVerifyResponse {
  faceCount: number;
  faces: VisionFaceDetection[];
  quality: VisionQualityMetrics;
  similarityRaw?: number | null;
  similarityPct?: number | null;
  perSample?: number[] | null;
  modelName: string | null;
  modelVersion: string | null;
  calibrationStatus: 'PROVISIONAL' | 'CALIBRATED';
  ms: number;
}

export interface IVisionClient {
  health(): Promise<VisionHealthResponse>;
  diagnostics(): Promise<VisionDiagnosticsResponse>;
  quality(imageBuffer: Buffer, angle?: string): Promise<VisionQualityResponse>;
  embed(imageBuffer: Buffer, angle?: string): Promise<VisionEmbedResponse>;
  verify(params: {
    imageBuffer: Buffer;
    reference: string;
    samples?: string[];
  }): Promise<VisionVerifyResponse>;
}

export class VisionClient implements IVisionClient {
  private baseUrl: string;
  private internalKey: string;
  private timeoutMs: number;

  constructor(options?: { baseUrl?: string; internalKey?: string; timeoutMs?: number }) {
    this.baseUrl = options?.baseUrl ?? env.VISION_URL;
    this.internalKey = options?.internalKey ?? env.VISION_INTERNAL_KEY;
    this.timeoutMs = options?.timeoutMs ?? env.VISION_TIMEOUT_MS;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.baseUrl).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(options.headers);
      if (this.internalKey) {
        headers.set('X-Internal-Key', this.internalKey);
      }

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (res.status === 503) {
        const bodyText = await res.text();
        if (bodyText.includes('BUSY')) {
          const retryAfter = Number(res.headers.get('Retry-After')) || 1;
          throw new VisionBusyError('Vision service busy', retryAfter);
        }
        if (bodyText.includes('MODEL_UNAVAILABLE')) {
          throw new ModelUnavailableError('Vision model unavailable');
        }
        throw new VisionUnavailableError(`Vision service reported 503: ${bodyText}`);
      }

      if (!res.ok) {
        let errCode = 'INTERNAL_ERROR';
        let errMsg = `Vision error ${res.status}`;
        try {
          const json = await res.json();
          if (json?.error?.code) errCode = json.error.code;
          if (json?.error?.message) errMsg = json.error.message;
        } catch {
          // ignore json parse error
        }
        throw new VisionError(errCode, errMsg, res.status);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof VisionError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new VisionTimeoutError(`Vision service timed out after ${this.timeoutMs}ms`);
      }

      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ error: message, url }, 'Vision request failed');
      throw new VisionUnavailableError(`Could not reach vision service: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<VisionHealthResponse> {
    const url = new URL('/v1/health', this.baseUrl).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new VisionUnavailableError(`Health check returned status ${res.status}`);
      }
      return (await res.json()) as VisionHealthResponse;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new VisionTimeoutError(`Vision health check timed out after ${this.timeoutMs}ms`);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new VisionUnavailableError(`Vision service unreachable: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async diagnostics(): Promise<VisionDiagnosticsResponse> {
    return this.request<VisionDiagnosticsResponse>('/v1/diagnostics');
  }

  async quality(imageBuffer: Buffer, angle?: string): Promise<VisionQualityResponse> {
    const formData = new FormData();
    formData.append('image', new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' }), 'frame.jpg');
    if (angle) {
      formData.append('angle', angle);
    }

    return this.request<VisionQualityResponse>('/v1/quality', {
      method: 'POST',
      body: formData,
    });
  }

  async embed(imageBuffer: Buffer, angle?: string): Promise<VisionEmbedResponse> {
    const formData = new FormData();
    formData.append('image', new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' }), 'frame.jpg');
    if (angle) {
      formData.append('angle', angle);
    }

    return this.request<VisionEmbedResponse>('/v1/embed', {
      method: 'POST',
      body: formData,
    });
  }

  async verify(params: {
    imageBuffer: Buffer;
    reference: string;
    samples?: string[];
  }): Promise<VisionVerifyResponse> {
    const formData = new FormData();
    formData.append('image', new Blob([new Uint8Array(params.imageBuffer)], { type: 'image/jpeg' }), 'frame.jpg');
    formData.append('reference', params.reference);
    if (params.samples && params.samples.length > 0) {
      for (const sample of params.samples) {
        formData.append('samples', sample);
      }
    }

    return this.request<VisionVerifyResponse>('/v1/verify', {
      method: 'POST',
      body: formData,
    });
  }
}

export const defaultVisionClient = new VisionClient();
