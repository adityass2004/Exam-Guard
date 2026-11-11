import { z } from 'zod';
import { VerificationOutcome, verificationOutcomeSchema } from './enums.js';

export const STUDENT_MESSAGES = {
  MATCH: 'Identity verified',
  NO_FACE: 'Face not detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  MISMATCH: 'Identity could not be confirmed',
  LOW_QUALITY_FRAME: 'Image unclear, improve lighting',
  CAMERA_ERROR: 'Camera disconnected or blocked',
  SERVICE_UNAVAILABLE: 'Verification service temporarily unavailable',
  MODEL_UNAVAILABLE: 'Verification service temporarily unavailable',
  SERVICE_TIMEOUT: 'Verification service temporarily unavailable',
  SERVICE_BUSY: 'Verification service temporarily unavailable',
} as const;

export type StudentMessage = (typeof STUDENT_MESSAGES)[keyof typeof STUDENT_MESSAGES];

export const VERIFICATION_STATUS_CODES = [
  'IDENTITY_VERIFIED',
  'FACE_NOT_DETECTED',
  'MULTIPLE_FACES',
  'IDENTITY_NOT_CONFIRMED',
  'IMAGE_UNCLEAR',
  'CAMERA_PROBLEM',
  'SERVICE_UNAVAILABLE',
] as const;

export type VerificationStatusCode = (typeof VERIFICATION_STATUS_CODES)[number];
export const verificationStatusCodeSchema = z.enum(VERIFICATION_STATUS_CODES);

export const preVerificationResultSchema = z.object({
  outcome: verificationOutcomeSchema,
  studentMessage: z.string(),
  consecutiveMatches: z.number().int().min(0),
  requiredMatches: z.number().int().min(1),
  readyToStart: z.boolean(),
});

export type PreVerificationResult = z.infer<typeof preVerificationResultSchema>;

export const continuousVerificationResponseSchema = z.object({
  outcome: verificationOutcomeSchema,
  studentMessage: z.string(),
  statusCode: verificationStatusCodeSchema,
  activeWarning: z.boolean(),
  nextIntervalMs: z.number().int().min(500).max(10000),
  serverNow: z.string(),
});

export type ContinuousVerificationResponse = z.infer<typeof continuousVerificationResponseSchema>;

export const CAMERA_ERROR_CODES = [
  'CAMERA_PERMISSION_DENIED',
  'CAMERA_NOT_FOUND',
  'CAMERA_IN_USE',
  'CAMERA_TRACK_ENDED',
  'CAMERA_UNKNOWN',
] as const;

export type CameraErrorCode = (typeof CAMERA_ERROR_CODES)[number];
export const cameraErrorCodeSchema = z.enum(CAMERA_ERROR_CODES);

export const clientEventSchema = z.object({
  type: z.literal('CAMERA_ERROR'),
  errorCode: cameraErrorCodeSchema,
  detail: z.string().max(500).optional(),
});

export type ClientEventDto = z.infer<typeof clientEventSchema>;

export interface SettingsSnapshot {
  id: string;
  version: number;
  thresholdPct: number;
  intervalMs: number;
  consecutiveMismatchLimit: number;
  missingFaceLimit: number;
  multipleFacesPolicy: string;
  multipleFacesConsecutiveLimit: number;
  cameraFailurePolicy: string;
  cameraGraceSeconds: number;
  serviceFailureLimit: number;
  repeatedFailureLimit: number;
  recoveryMatchCount: number;
  startupGraceSeconds: number;
  preExamRequiredMatches: number;
  minFaceQuality: {
    minBlur?: number;
    minBrightness?: number;
    maxBrightness?: number;
    minFaceSizeRatio?: number;
    minDetectorScore?: number;
  };
  severityRules: Record<string, string>;
}
