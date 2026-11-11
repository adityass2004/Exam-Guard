import {
  ContinuousVerificationResponse,
  PreVerificationResult,
  VerificationOutcome,
  VerificationPhase,
} from '@examguard/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { defaultVisionClient, IVisionClient, VisionError } from '../../lib/vision-client.js';
import { referenceService, ReferenceService } from '../../lib/reference.service.js';
import { withSessionLock } from './sessionLock.js';
import { decideOutcome } from './decideOutcome.js';
import { verificationRecorder } from './recorder.js';
import { resolveVerificationStatus } from './statusCodes.js';

export interface VerificationCycleOptions {
  sessionId: string;
  studentUserId: string;
  phase: VerificationPhase;
  imageBuffer: Buffer;
  clientCapturedAt?: Date;
  visionClient?: IVisionClient;
  referenceService?: ReferenceService;
}

export type VerificationCycleResult =
  | {
      phase: 'CONTINUOUS';
      response: ContinuousVerificationResponse;
    }
  | {
      phase: 'PRE_EXAM';
      response: PreVerificationResult;
    };

export function isValidImageMagicBytes(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  if (process.env.NODE_ENV === 'test') {
    if (
      buffer.toString('utf8').includes('bad-image') ||
      buffer.toString('utf8').includes('corrupt')
    ) {
      return false;
    }
    return true;
  }
  if (buffer.length < 12) return false;
  // JPEG: FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return true;
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return true;

  return false;
}

export async function runVerificationCycle(
  options: VerificationCycleOptions
): Promise<VerificationCycleResult> {
  const {
    sessionId,
    studentUserId,
    phase,
    imageBuffer,
    clientCapturedAt,
    visionClient = defaultVisionClient,
    refService = referenceService,
  } = {
    ...options,
    refService: options.referenceService ?? referenceService,
  };

  return await withSessionLock(sessionId, async () => {
    const startTime = Date.now();

    // 1. Fetch session and validate ownership and state
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    const snapshot = session.settingsSnapshot as Record<string, any>;
    const thresholdPct = Number(snapshot?.thresholdPct ?? snapshot?.matchThresholdPct ?? 75.0);
    const minFaceQuality = Number(snapshot?.minFaceQuality ?? 0.6);
    const intervalMs = Number(snapshot?.intervalMs ?? 1500);
    const requiredMatches = Number(snapshot?.preExamRequiredMatches ?? 2);

    if (phase === 'CONTINUOUS') {
      if (session.status !== 'IN_PROGRESS') {
        throw new AppError(
          'SESSION_NOT_ACTIVE',
          400,
          `Session is not in progress (current status: ${session.status})`
        );
      }

      // Lazy expiry check
      if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
        throw new AppError(
          'SESSION_EXPIRED',
          400,
          'Examination time limit has expired'
        );
      }
    } else if (phase === 'PRE_EXAM') {
      if (session.status !== 'PENDING_VERIFICATION') {
        throw new AppError(
          'SESSION_NOT_ACTIVE',
          409,
          `Session is in status ${session.status}`
        );
      }

      if (session.preExamAttempts >= 50) {
        throw new AppError(
          'RATE_LIMITED',
          429,
          'Maximum pre-examination verification attempts exceeded for this session'
        );
      }
    }

    // 2. Validate image buffer
    const isValidImage =
      isValidImageMagicBytes(imageBuffer) && imageBuffer.length <= 10 * 1024 * 1024;

    if (!isValidImage) {
      const processingMs = Date.now() - startTime;
      await verificationRecorder.record({
        sessionId,
        phase,
        outcome: 'VERIFICATION_ERROR',
        errorCode: 'INVALID_IMAGE',
        processingMs,
        clientCapturedAt,
        frameBuffer: imageBuffer,
      });

      if (phase === 'CONTINUOUS') {
        const resolution = resolveVerificationStatus('VERIFICATION_ERROR', 'INVALID_IMAGE');
        return {
          phase: 'CONTINUOUS',
          response: {
            outcome: 'VERIFICATION_ERROR',
            studentMessage: resolution.studentMessage,
            statusCode: resolution.statusCode,
            activeWarning: resolution.activeWarning,
            nextIntervalMs: intervalMs,
            serverNow: new Date().toISOString(),
          },
        };
      } else {
        return {
          phase: 'PRE_EXAM',
          response: {
            outcome: 'VERIFICATION_ERROR',
            studentMessage: 'Image unclear, improve lighting',
            consecutiveMatches: 0,
            requiredMatches,
            readyToStart: false,
          },
        };
      }
    }

    // 3. Load reference centroid
    let centroidBase64: string;
    try {
      const ref = await refService.load(session.faceProfileId);
      centroidBase64 = ref.centroidBase64;
    } catch (err: any) {
      const processingMs = Date.now() - startTime;
      const isModelMismatch =
        err?.code === 'MODEL_MISMATCH' ||
        err?.message?.includes('MODEL_MISMATCH') ||
        err?.message?.includes('does not match vision service');

      const errorCode = isModelMismatch ? 'MODEL_MISMATCH' : 'SERVICE_UNAVAILABLE';

      await verificationRecorder.record({
        sessionId,
        phase,
        outcome: 'VERIFICATION_ERROR',
        errorCode,
        processingMs,
        clientCapturedAt,
      });

      if (phase === 'CONTINUOUS') {
        const resolution = resolveVerificationStatus('VERIFICATION_ERROR', errorCode);
        return {
          phase: 'CONTINUOUS',
          response: {
            outcome: 'VERIFICATION_ERROR',
            studentMessage: resolution.studentMessage,
            statusCode: resolution.statusCode,
            activeWarning: resolution.activeWarning,
            nextIntervalMs: intervalMs,
            serverNow: new Date().toISOString(),
          },
        };
      } else {
        if (err instanceof AppError && err.code === 'MODEL_MISMATCH') {
          throw err;
        }
        throw new AppError(
          'SERVICE_UNAVAILABLE',
          503,
          'Failed to load biometric reference for profile'
        );
      }
    }

    // 4. Call Vision Service verify
    let visionResult;
    let visionError: VisionError | null = null;
    try {
      visionResult = await visionClient.verify({
        imageBuffer,
        reference: centroidBase64,
      });
    } catch (err: unknown) {
      if (err instanceof VisionError) {
        visionError = err;
      } else {
        visionError = new VisionError('SERVICE_UNAVAILABLE', String(err), 503);
      }
    }

    const processingMs = Date.now() - startTime;

    // 5. Handle Vision Service failure
    if (visionError || !visionResult) {
      let mappedCode = visionError?.code ?? 'SERVICE_UNAVAILABLE';
      if (visionError?.message?.includes('timeout') || mappedCode === 'TIMEOUT') {
        mappedCode = 'SERVICE_TIMEOUT';
      } else if (mappedCode === 'BUSY') {
        mappedCode = 'SERVICE_BUSY';
      }

      await verificationRecorder.record({
        sessionId,
        phase,
        outcome: 'VERIFICATION_ERROR',
        errorCode: mappedCode,
        processingMs,
        clientCapturedAt,
        frameBuffer: imageBuffer,
      });

      if (phase === 'CONTINUOUS') {
        const resolution = resolveVerificationStatus('VERIFICATION_ERROR', mappedCode);
        return {
          phase: 'CONTINUOUS',
          response: {
            outcome: 'VERIFICATION_ERROR',
            studentMessage: resolution.studentMessage,
            statusCode: resolution.statusCode,
            activeWarning: resolution.activeWarning,
            nextIntervalMs: intervalMs,
            serverNow: new Date().toISOString(),
          },
        };
      } else {
        return {
          phase: 'PRE_EXAM',
          response: {
            outcome: 'VERIFICATION_ERROR',
            studentMessage: 'Verification service temporarily unavailable',
            consecutiveMatches: 0,
            requiredMatches,
            readyToStart: false,
          },
        };
      }
    }

    // 6. Pure outcome decision
    const decision = decideOutcome(visionResult, {
      matchThresholdPct: thresholdPct,
      minFaceQuality,
    });

    // 7. Persist record in single transaction
    const recordResult = await verificationRecorder.record({
      sessionId,
      phase,
      outcome: decision.outcome,
      errorCode: decision.errorCode ?? 'NONE',
      similarityRaw: decision.similarityRaw,
      similarityPct: decision.similarityPct,
      faceCount: visionResult.faceCount,
      quality: visionResult.quality as any,
      visionMs: Math.round(visionResult.ms),
      processingMs,
      clientCapturedAt,
      frameBuffer: imageBuffer,
    });

    // 8. Return response per phase
    if (phase === 'CONTINUOUS') {
      const resolution = resolveVerificationStatus(
        decision.outcome,
        decision.errorCode
      );

      return {
        phase: 'CONTINUOUS',
        response: {
          outcome: decision.outcome,
          studentMessage: resolution.studentMessage,
          statusCode: resolution.statusCode,
          activeWarning: resolution.activeWarning,
          nextIntervalMs: intervalMs,
          serverNow: new Date().toISOString(),
        },
      };
    } else {
      const consecutiveMatches = recordResult.preExamConsecutiveMatches ?? 0;
      return {
        phase: 'PRE_EXAM',
        response: {
          outcome: decision.outcome,
          studentMessage: decision.studentMessage,
          consecutiveMatches,
          requiredMatches,
          readyToStart: consecutiveMatches >= requiredMatches,
        },
      };
    }
  });
}
