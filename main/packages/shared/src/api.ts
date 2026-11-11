import { z } from 'zod';

export interface ApiSuccess<T = unknown> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    nextCursor?: string | null;
    [key: string]: unknown;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface ApiError {
  error: ApiErrorDetail;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

export const STANDARD_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'NOT_IMPLEMENTED',
  'EMAIL_TAKEN',
  'STUDENT_ID_TAKEN',
  'INVALID_CREDENTIALS',
  'CONSENT_REQUIRED',
  'QUALITY_FAILED',
  'WRONG_POSE',
  'MODEL_UNAVAILABLE',
  'MODEL_MISMATCH',
  'ENROLLMENT_INCOMPLETE',
  'ENROLLMENT_INCONSISTENT',
  'ENROLLMENT_NOT_APPROVED',
  'EXAM_NOT_ACTIVE',
  'ANOTHER_SESSION_ACTIVE',
  'VERIFICATION_REQUIRED',
  'SESSION_NOT_ACTIVE',
  'SESSION_EXPIRED',
  'VERIFICATION_IN_PROGRESS',
  'EXAM_HAS_SESSIONS',
  'INVALID_IMAGE',
  'CAMERA_PERMISSION_DENIED',
  'CAMERA_NOT_FOUND',
  'CAMERA_IN_USE',
  'CAMERA_TRACK_ENDED',
  'CAMERA_UNKNOWN',
  'LOW_QUALITY_FRAME',
  'SERVICE_TIMEOUT',
  'SERVICE_BUSY',
  'NO_SIGNAL',
  'BAD_INTERNAL_KEY',
  'EVIDENCE_INTEGRITY_FAILURE',
] as const;

export type StandardErrorCode = (typeof STANDARD_ERROR_CODES)[number];
export const standardErrorCodeSchema = z.enum(STANDARD_ERROR_CODES);

export interface PagePaginationParams {
  page?: number;
  limit?: number;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginationMeta {
  total?: number;
  page?: number;
  limit: number;
  nextCursor?: string | null;
}

// Health and System Status contracts
export type ServiceStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface HealthResponseData {
  status: 'ok';
  uptimeSec: number;
  version: string;
}

export interface HealthReadyDetails {
  databaseError?: string | null;
  visionError?: string | null;
  visionModelLoaded?: boolean;
  [key: string]: unknown;
}

export interface HealthReadyResponseData {
  api: 'UP';
  database: 'UP' | 'DOWN';
  vision: 'UP' | 'DEGRADED' | 'DOWN';
  details: HealthReadyDetails;
}

export interface SystemStatusResponseData extends HealthReadyResponseData {
  version: string;
  nodeEnv: string;
  calibrationStatus: 'PROVISIONAL' | 'CALIBRATED' | 'UNKNOWN';
  visionDetails?: {
    versions?: Record<string, string | null>;
    executionProviders?: string[];
    modelState?: string;
    concurrency?: {
      inFlight: number;
      limit: number;
    };
  } | null;
  serverTime: string;
}

