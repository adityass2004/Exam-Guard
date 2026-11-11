import { VerificationOutcome } from '@examguard/shared';
import { VisionVerifyResponse } from '../../lib/vision-client.js';
import { getStudentMessage } from './verification.messages.js';

export interface DecisionSettingsSnapshot {
  matchThresholdPct: number;
  minFaceQuality: number;
}

export interface DecisionResult {
  outcome: VerificationOutcome;
  errorCode: string | null;
  similarityPct: number | null;
  similarityRaw: number | null;
  studentMessage: string;
}

export function decideOutcome(
  visionResult: VisionVerifyResponse,
  settings: DecisionSettingsSnapshot
): DecisionResult {
  // 1. Zero faces detected
  if (visionResult.faceCount === 0) {
    return {
      outcome: 'NO_FACE',
      errorCode: null,
      similarityPct: null,
      similarityRaw: null,
      studentMessage: getStudentMessage('NO_FACE'),
    };
  }

  // 2. Multiple faces detected
  if (visionResult.faceCount > 1) {
    return {
      outcome: 'MULTIPLE_FACES',
      errorCode: null,
      similarityPct: null,
      similarityRaw: null,
      studentMessage: getStudentMessage('MULTIPLE_FACES'),
    };
  }

  // 3. Exactly one face detected: check quality threshold
  const face = visionResult.faces[0];
  if (face && face.detScore < settings.minFaceQuality) {
    return {
      outcome: 'VERIFICATION_ERROR',
      errorCode: 'LOW_QUALITY_FRAME',
      similarityPct: null,
      similarityRaw: null,
      studentMessage: getStudentMessage('VERIFICATION_ERROR', 'LOW_QUALITY_FRAME'),
    };
  }

  // If similarity was not computed (e.g. low quality crop)
  if (visionResult.similarityPct === null || visionResult.similarityPct === undefined) {
    return {
      outcome: 'VERIFICATION_ERROR',
      errorCode: 'LOW_QUALITY_FRAME',
      similarityPct: null,
      similarityRaw: null,
      studentMessage: getStudentMessage('VERIFICATION_ERROR', 'LOW_QUALITY_FRAME'),
    };
  }

  const raw = visionResult.similarityRaw ?? null;
  const pct = visionResult.similarityPct;

  // 4. Threshold comparison (boundary equality: pct >= matchThresholdPct => MATCH)
  if (pct >= settings.matchThresholdPct) {
    return {
      outcome: 'MATCH',
      errorCode: null,
      similarityPct: pct,
      similarityRaw: raw,
      studentMessage: getStudentMessage('MATCH'),
    };
  }

  return {
    outcome: 'MISMATCH',
    errorCode: null,
    similarityPct: pct,
    similarityRaw: raw,
    studentMessage: getStudentMessage('MISMATCH'),
  };
}

