import { z } from 'zod';
import {
  cameraFailurePolicySchema,
  multipleFacesPolicySchema,
  severitySchema,
  TRIGGER_TYPES,
} from './enums.js';

export const minFaceQualitySchema = z.object({
  minBlur: z.number().min(5).max(150).default(35.0),
  minBrightness: z.number().min(5).max(120).default(50.0),
  maxBrightness: z.number().min(150).max(255).default(210.0),
  minFaceSizeRatio: z.number().min(0.01).max(0.5).default(0.05),
  minDetectorScore: z.number().min(0.3).max(0.99).default(0.65),
});

export type MinFaceQualityDto = z.infer<typeof minFaceQualitySchema>;

export const severityRulesSchema = z.record(
  z.enum(TRIGGER_TYPES),
  severitySchema
).refine(
  (rules) => TRIGGER_TYPES.every((t) => rules[t] !== undefined),
  { message: 'All six trigger types must have an assigned severity level' }
);

export type SeverityRulesDto = z.infer<typeof severityRulesSchema>;

export const DEFAULT_SEVERITY_RULES: SeverityRulesDto = {
  IDENTITY_MISMATCH: 'CRITICAL',
  MULTIPLE_FACES: 'HIGH',
  REPEATED_VERIFICATION_FAILURE: 'HIGH',
  NO_FACE: 'MEDIUM',
  CAMERA_DISCONNECTED: 'MEDIUM',
  VERIFICATION_SERVICE_FAILURE: 'LOW',
};

export const createVerificationSettingsSchema = z
  .object({
    name: z.string().max(100).optional(),
    thresholdPct: z.number().min(30).max(99).default(75),
    intervalMs: z.number().int().min(500).max(10000).default(1500),
    consecutiveMismatchLimit: z.number().int().min(1).max(20).default(3),
    missingFaceLimit: z.number().int().min(1).max(60).default(4),
    multipleFacesPolicy: multipleFacesPolicySchema.default('ALERT_IMMEDIATELY'),
    multipleFacesConsecutiveLimit: z.number().int().min(1).max(20).default(2),
    cameraFailurePolicy: cameraFailurePolicySchema.default('ALERT_AFTER_GRACE'),
    cameraGraceSeconds: z.number().int().min(1).max(120).default(6),
    serviceFailureLimit: z.number().int().min(1).max(20).default(3),
    repeatedFailureLimit: z.number().int().min(2).max(100).default(6),
    recoveryMatchCount: z.number().int().min(1).max(20).default(3),
    startupGraceSeconds: z.number().int().min(0).max(120).default(10),
    preExamRequiredMatches: z.number().int().min(1).max(10).default(2),
    minFaceQuality: minFaceQualitySchema.default({
      minBlur: 35.0,
      minBrightness: 50.0,
      maxBrightness: 210.0,
      minFaceSizeRatio: 0.05,
      minDetectorScore: 0.65,
    }),
    severityRules: severityRulesSchema.default(DEFAULT_SEVERITY_RULES),
    changeNote: z.string().min(3, 'Change note must be at least 3 characters').max(300),
  })
  .refine(
    (data) => data.minFaceQuality.minBrightness < data.minFaceQuality.maxBrightness,
    {
      message: 'Minimum brightness must be strictly less than maximum brightness',
      path: ['minFaceQuality', 'minBrightness'],
    }
  );

export type CreateVerificationSettingsDto = z.infer<typeof createVerificationSettingsSchema>;

export interface VerificationSettingsDto {
  id: string;
  version: number;
  isActive: boolean;
  name: string | null;
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
  minFaceQuality: MinFaceQualityDto;
  severityRules: SeverityRulesDto;
  changeNote: string | null;
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
}

export interface VerificationSettingsHistoryDto {
  active: VerificationSettingsDto | null;
  history: VerificationSettingsDto[];
}

