import crypto from 'node:crypto';
import { defaultVisionClient, IVisionClient } from '../../lib/vision-client.js';
import { AppError } from '../../lib/errors.js';
import {
  computeCentroid,
  base64ToFloat32Array,
  float32ArrayToBase64,
} from '../enrollment/centroid.js';
import { sandboxDb, SandboxFace, SandboxVerificationLog } from './sandbox.db.js';

export interface ScrfdDetectionFace {
  bbox: [number, number, number, number];
  confidence: number;
  keypoints: [number, number][];
  yaw?: number | null;
  pitch?: number | null;
  roll?: number | null;
}

export interface ScrfdDetectionResponse {
  success: boolean;
  frame_id: string;
  frame_width: number;
  frame_height: number;
  face_count: number;
  inference_time_ms: number;
  status: 'NO_FACE' | 'SINGLE_FACE' | 'MULTIPLE_FACES';
  message: string;
  faces: ScrfdDetectionFace[];
}

export class SandboxService {
  private visionClient: IVisionClient;

  constructor(visionClient?: IVisionClient) {
    this.visionClient = visionClient ?? defaultVisionClient;
  }

  async enrollFace(imageBuffer: Buffer, label?: string): Promise<SandboxFace> {
    const embedRes = await this.visionClient.embed(imageBuffer);

    if (embedRes.faceCount === 0) {
      throw new AppError(
        'NO_FACE',
        400,
        'No face detected in camera view. Please position your face clearly in good lighting.'
      );
    }

    if (embedRes.faceCount > 1) {
      throw new AppError(
        'MULTIPLE_FACES',
        400,
        `Detected ${embedRes.faceCount} faces. Please ensure only one person is in the frame.`
      );
    }

    if (!embedRes.embedding) {
      throw new AppError(
        'EMBEDDING_FAILED',
        400,
        'Could not extract facial embedding vector. Please adjust lighting and try again.'
      );
    }

    const faceId = crypto.randomUUID();
    const faceName = (label && label.trim().length > 0)
      ? label.trim()
      : `Reference Subject ${sandboxDb.getFaces().length + 1}`;

    const thumbnail = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    const quality = JSON.stringify(embedRes.quality ?? {});

    const face: SandboxFace = {
      id: faceId,
      label: faceName,
      embedding: embedRes.embedding,
      thumbnail,
      quality,
      createdAt: new Date().toISOString(),
    };

    sandboxDb.saveFace(face);
    return face;
  }

  async enrollMultiFaces(imageBuffers: Buffer[], label?: string): Promise<SandboxFace> {
    if (!imageBuffers || imageBuffers.length === 0) {
      throw new AppError('BAD_REQUEST', 400, 'At least one image frame is required for face enrollment');
    }

    if (imageBuffers.length === 1) {
      return this.enrollFace(imageBuffers[0], label);
    }

    const sampleVectors: Float32Array[] = [];
    const thumbnails: string[] = [];
    const qualities: any[] = [];

    for (let i = 0; i < imageBuffers.length; i++) {
      const buf = imageBuffers[i];
      const embedRes = await this.visionClient.embed(buf);

      if (embedRes.faceCount === 0) {
        throw new AppError(
          'NO_FACE',
          400,
          `Image #${i + 1}: No face detected in frame. Please ensure your face is clearly visible in the camera.`
        );
      }

      if (embedRes.faceCount > 1) {
        throw new AppError(
          'MULTIPLE_FACES',
          400,
          `Image #${i + 1}: Detected ${embedRes.faceCount} faces. Please ensure only one person is in view.`
        );
      }

      if (!embedRes.embedding) {
        throw new AppError(
          'EMBEDDING_FAILED',
          400,
          `Image #${i + 1}: Could not extract facial embedding vector.`
        );
      }

      sampleVectors.push(base64ToFloat32Array(embedRes.embedding));
      thumbnails.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
      qualities.push(embedRes.quality ?? {});
    }

    const centroidResult = computeCentroid(sampleVectors);
    const centroidBase64 = float32ArrayToBase64(centroidResult.centroid);

    const faceId = crypto.randomUUID();
    const faceName = (label && label.trim().length > 0)
      ? label.trim()
      : `Reference Subject ${sandboxDb.getFaces().length + 1} (${imageBuffers.length}-Shot Centroid)`;

    const qualityData = {
      sampleCount: imageBuffers.length,
      minObservedSimilarity: centroidResult.minObservedSimilarity,
      similarities: centroidResult.similarities,
      thumbnails,
      qualities,
    };

    const face: SandboxFace = {
      id: faceId,
      label: faceName,
      embedding: centroidBase64,
      thumbnail: thumbnails[0],
      quality: JSON.stringify(qualityData),
      createdAt: new Date().toISOString(),
    };

    sandboxDb.saveFace(face);
    return face;
  }

  async detectAndVerify(
    imageBuffer: Buffer,
    faceId?: string,
    thresholdPct = 75
  ) {
    let targetFace: SandboxFace | null = null;
    if (faceId) {
      targetFace = sandboxDb.getFaceById(faceId);
    } else {
      const allFaces = sandboxDb.getFaces();
      if (allFaces.length > 0) {
        targetFace = allFaces[0];
      }
    }

    // If reference face exists, run verification against it
    if (targetFace) {
      const verifyRes = await this.visionClient.verify({
        imageBuffer,
        reference: targetFace.embedding,
      });

      let outcome: 'MATCH' | 'MISMATCH' | 'NO_FACE' | 'MULTIPLE_FACES' | 'IMAGE_UNCLEAR';
      let message: string;

      if (verifyRes.faceCount === 0) {
        outcome = 'NO_FACE';
        message = 'No face detected in camera frame';
      } else if (verifyRes.faceCount > 1) {
        outcome = 'MULTIPLE_FACES';
        message = `Alert: ${verifyRes.faceCount} faces detected in frame`;
      } else if (
        verifyRes.quality?.blur != null &&
        verifyRes.quality.blur > 0 &&
        verifyRes.quality.blur < 70
      ) {
        outcome = 'IMAGE_UNCLEAR';
        message = 'Camera image is blurry; hold still';
      } else if (
        verifyRes.similarityPct != null &&
        verifyRes.similarityPct >= thresholdPct
      ) {
        outcome = 'MATCH';
        message = `Identity Verified (${verifyRes.similarityPct.toFixed(1)}% match)`;
      } else {
        const pct = verifyRes.similarityPct != null ? verifyRes.similarityPct.toFixed(1) : '0.0';
        outcome = 'MISMATCH';
        message = `Identity Mismatch (${pct}% similarity, threshold ${thresholdPct}%)`;
      }

      // Record to sandbox SQLite DB
      const log: SandboxVerificationLog = {
        id: crypto.randomUUID(),
        faceId: targetFace.id,
        outcome,
        similarityPct: verifyRes.similarityPct ?? null,
        similarityRaw: verifyRes.similarityRaw ?? null,
        thresholdPct,
        faceCount: verifyRes.faceCount,
        latencyMs: verifyRes.ms,
        qualityJson: JSON.stringify(verifyRes.quality ?? {}),
        createdAt: new Date().toISOString(),
      };
      sandboxDb.saveLog(log);

      return {
        hasReference: true,
        referenceFaceId: targetFace.id,
        referenceLabel: targetFace.label,
        outcome,
        message,
        similarityPct: verifyRes.similarityPct ?? null,
        similarityRaw: verifyRes.similarityRaw ?? null,
        thresholdPct,
        faceCount: verifyRes.faceCount,
        faces: verifyRes.faces,
        quality: verifyRes.quality,
        latencyMs: verifyRes.ms,
        timestamp: new Date().toISOString(),
      };
    }

    // No reference face recorded yet: run quality check only
    const qualityRes = await this.visionClient.quality(imageBuffer);

    let outcome: 'NO_FACE' | 'MULTIPLE_FACES' | 'READY_TO_ENROLL';
    let message: string;

    if (qualityRes.faceCount === 0) {
      outcome = 'NO_FACE';
      message = 'No face detected in camera frame';
    } else if (qualityRes.faceCount > 1) {
      outcome = 'MULTIPLE_FACES';
      message = `Alert: ${qualityRes.faceCount} faces detected in frame`;
    } else {
      outcome = 'READY_TO_ENROLL';
      message = 'Single face detected cleanly. Ready to record reference face!';
    }

    return {
      hasReference: false,
      outcome,
      message,
      faceCount: qualityRes.faceCount,
      faces: qualityRes.faces,
      quality: qualityRes.quality,
      latencyMs: qualityRes.ms,
      timestamp: new Date().toISOString(),
    };
  }

  async checkQuality(imageBuffer: Buffer, angle?: string) {
    const qualityRes = await this.visionClient.quality(imageBuffer, angle);

    let outcome: 'READY' | 'NO_FACE' | 'MULTIPLE_FACES' | 'IMAGE_UNCLEAR';
    let message: string;
    const hints: string[] = [];

    if (qualityRes.faceCount === 0) {
      outcome = 'NO_FACE';
      message = 'No face detected in camera view';
      hints.push('Position your face inside the guide frame in good lighting.');
    } else if (qualityRes.faceCount > 1) {
      outcome = 'MULTIPLE_FACES';
      message = `Multiple faces detected (${qualityRes.faceCount})`;
      hints.push('Ensure only one person is in the camera view.');
    } else if (
      qualityRes.quality?.blur != null &&
      qualityRes.quality.blur > 0 &&
      qualityRes.quality.blur < 70
    ) {
      outcome = 'IMAGE_UNCLEAR';
      message = 'Image is blurry — hold still';
      hints.push('Hold still to allow your camera to focus.');
    } else if (qualityRes.quality?.brightness != null && qualityRes.quality.brightness < 40) {
      outcome = 'IMAGE_UNCLEAR';
      message = 'Lighting is too dark';
      hints.push('Increase room lighting or face a light source.');
    } else {
      outcome = 'READY';
      message = 'Face detected & aligned! Ready to capture.';
    }

    return {
      acceptable: outcome === 'READY',
      outcome,
      message,
      hints,
      faceCount: qualityRes.faceCount,
      faces: qualityRes.faces,
      quality: qualityRes.quality,
      latencyMs: qualityRes.ms,
      timestamp: new Date().toISOString(),
    };
  }

  async detectScrfd(imageBuffer: Buffer, frameId?: string): Promise<ScrfdDetectionResponse> {
    const qualityRes = await this.visionClient.quality(imageBuffer);

    let status: 'NO_FACE' | 'SINGLE_FACE' | 'MULTIPLE_FACES';
    let message: string;

    if (qualityRes.faceCount === 0) {
      status = 'NO_FACE';
      message = 'No face detected. Please position your face in front of the camera.';
    } else if (qualityRes.faceCount === 1) {
      status = 'SINGLE_FACE';
      message = 'Face detection successful. Ready for verification.';
    } else {
      status = 'MULTIPLE_FACES';
      message = `Multiple faces detected (${qualityRes.faceCount}). Only one candidate is permitted.`;
    }

    const faces: ScrfdDetectionFace[] = qualityRes.faces.map((f) => ({
      bbox: f.box,
      confidence: f.detScore,
      keypoints: f.kps || [],
      yaw: f.yaw,
      pitch: f.pitch,
      roll: f.roll,
    }));

    return {
      success: true,
      frame_id: frameId || `frame_${Date.now()}`,
      frame_width: qualityRes.frameWidth ?? 640,
      frame_height: qualityRes.frameHeight ?? 480,
      face_count: qualityRes.faceCount,
      inference_time_ms: qualityRes.ms,
      status,
      message,
      faces,
    };
  }

  getFaces(): SandboxFace[] {
    return sandboxDb.getFaces();
  }

  deleteFace(id: string): void {
    sandboxDb.deleteFace(id);
  }

  getRecentLogs(limit = 15): SandboxVerificationLog[] {
    return sandboxDb.getRecentLogs(limit);
  }

  resetAll(): void {
    sandboxDb.clearAll();
  }
}

export const sandboxService = new SandboxService();

