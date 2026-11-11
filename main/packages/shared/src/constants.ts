import {
  CameraFailurePolicy,
  MultipleFacesPolicy,
  Severity,
  TriggerType,
} from './enums.js';

export const VERIFICATION_LOG_ERROR_CODES = [
  'NONE',
  'LOW_QUALITY_FRAME',
  'SERVICE_UNAVAILABLE',
  'SERVICE_TIMEOUT',
  'SERVICE_BUSY',
  'MODEL_UNAVAILABLE',
  'MODEL_MISMATCH',
  'INVALID_IMAGE',
  'CAMERA_PERMISSION_DENIED',
  'CAMERA_NOT_FOUND',
  'CAMERA_IN_USE',
  'CAMERA_TRACK_ENDED',
  'CAMERA_UNKNOWN',
  'NO_SIGNAL',
  'INTERNAL_ERROR',
] as const;

export type VerificationLogErrorCode = (typeof VERIFICATION_LOG_ERROR_CODES)[number];

export const STORAGE_SUBDIRECTORIES = ['enrollment', 'evidence', 'tmp'] as const;

export const DEFAULT_VERIFICATION_SETTINGS = {
  version: 1,
  name: 'Default Institution Policy',
  thresholdPct: 75.0,
  intervalMs: 1500,
  consecutiveMismatchLimit: 3,
  missingFaceLimit: 4,
  multipleFacesPolicy: MultipleFacesPolicy.ALERT_AFTER_CONSECUTIVE,
  multipleFacesConsecutiveLimit: 2,
  cameraFailurePolicy: CameraFailurePolicy.ALERT_AFTER_GRACE,
  cameraGraceSeconds: 6,
  serviceFailureLimit: 3,
  repeatedFailureLimit: 6,
  recoveryMatchCount: 3,
  startupGraceSeconds: 10,
  preExamRequiredMatches: 2,
  minFaceQuality: {
    blurThreshold: 100,
    minBrightness: 40,
    maxBrightness: 220,
    minFaceSizeRatio: 0.15,
    minDetScore: 0.6,
  },
  severityRules: {
    [TriggerType.IDENTITY_MISMATCH]: Severity.CRITICAL,
    [TriggerType.MULTIPLE_FACES]: Severity.HIGH,
    [TriggerType.REPEATED_VERIFICATION_FAILURE]: Severity.HIGH,
    [TriggerType.NO_FACE]: Severity.MEDIUM,
    [TriggerType.CAMERA_DISCONNECTED]: Severity.MEDIUM,
    [TriggerType.VERIFICATION_SERVICE_FAILURE]: Severity.LOW,
  },
} as const;

