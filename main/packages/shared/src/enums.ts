import { z } from 'zod';

export const USER_ROLES = ['STUDENT', 'ADMIN'] as const;
export const UserRole = {
  STUDENT: 'STUDENT',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = z.enum(USER_STATUSES);

export const ENROLLMENT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
  'REVOKED',
] as const;
export const EnrollmentStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
  REVOKED: 'REVOKED',
} as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export const enrollmentStatusSchema = z.enum(ENROLLMENT_STATUSES);

export const FACE_ANGLES = ['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'] as const;
export const FaceAngle = {
  FRONT: 'FRONT',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
  DOWN: 'DOWN',
} as const;
export type FaceAngle = (typeof FACE_ANGLES)[number];
export const faceAngleSchema = z.enum(FACE_ANGLES);

export const EMBEDDING_KINDS = ['SAMPLE', 'CENTROID'] as const;
export const EmbeddingKind = {
  SAMPLE: 'SAMPLE',
  CENTROID: 'CENTROID',
} as const;
export type EmbeddingKind = (typeof EMBEDDING_KINDS)[number];
export const embeddingKindSchema = z.enum(EMBEDDING_KINDS);

export const EXAM_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export const ExamStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export const examStatusSchema = z.enum(EXAM_STATUSES);

export const SESSION_STATUSES = [
  'PENDING_VERIFICATION',
  'IN_PROGRESS',
  'SUBMITTED',
  'EXPIRED',
  'CANCELLED',
] as const;
export const SessionStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const sessionStatusSchema = z.enum(SESSION_STATUSES);

export const VERIFICATION_PHASES = ['PRE_EXAM', 'CONTINUOUS'] as const;
export const VerificationPhase = {
  PRE_EXAM: 'PRE_EXAM',
  CONTINUOUS: 'CONTINUOUS',
} as const;
export type VerificationPhase = (typeof VERIFICATION_PHASES)[number];
export const verificationPhaseSchema = z.enum(VERIFICATION_PHASES);

export const VERIFICATION_OUTCOMES = [
  'MATCH',
  'MISMATCH',
  'NO_FACE',
  'MULTIPLE_FACES',
  'CAMERA_ERROR',
  'VERIFICATION_ERROR',
] as const;
export const VerificationOutcome = {
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  NO_FACE: 'NO_FACE',
  MULTIPLE_FACES: 'MULTIPLE_FACES',
  CAMERA_ERROR: 'CAMERA_ERROR',
  VERIFICATION_ERROR: 'VERIFICATION_ERROR',
} as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];
export const verificationOutcomeSchema = z.enum(VERIFICATION_OUTCOMES);

export const TRIGGER_TYPES = [
  'IDENTITY_MISMATCH',
  'NO_FACE',
  'MULTIPLE_FACES',
  'CAMERA_DISCONNECTED',
  'VERIFICATION_SERVICE_FAILURE',
  'REPEATED_VERIFICATION_FAILURE',
] as const;
export const TriggerType = {
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  NO_FACE: 'NO_FACE',
  MULTIPLE_FACES: 'MULTIPLE_FACES',
  CAMERA_DISCONNECTED: 'CAMERA_DISCONNECTED',
  VERIFICATION_SERVICE_FAILURE: 'VERIFICATION_SERVICE_FAILURE',
  REPEATED_VERIFICATION_FAILURE: 'REPEATED_VERIFICATION_FAILURE',
} as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type Severity = (typeof SEVERITIES)[number];
export const severitySchema = z.enum(SEVERITIES);

export const INCIDENT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'REVIEWED'] as const;
export const IncidentStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  REVIEWED: 'REVIEWED',
} as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const incidentStatusSchema = z.enum(INCIDENT_STATUSES);

export const REVIEW_DISPOSITIONS = [
  'CONFIRMED_CONCERN',
  'FALSE_POSITIVE',
  'INCONCLUSIVE',
] as const;
export const ReviewDisposition = {
  CONFIRMED_CONCERN: 'CONFIRMED_CONCERN',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  INCONCLUSIVE: 'INCONCLUSIVE',
} as const;
export type ReviewDisposition = (typeof REVIEW_DISPOSITIONS)[number];
export const reviewDispositionSchema = z.enum(REVIEW_DISPOSITIONS);

export const EVIDENCE_CAPTURE_STATUSES = ['CAPTURED', 'FAILED', 'NOT_AVAILABLE'] as const;
export const EvidenceCaptureStatus = {
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
} as const;
export type EvidenceCaptureStatus = (typeof EVIDENCE_CAPTURE_STATUSES)[number];
export const evidenceCaptureStatusSchema = z.enum(EVIDENCE_CAPTURE_STATUSES);

export const MULTIPLE_FACES_POLICIES = [
  'LOG_ONLY',
  'ALERT_AFTER_CONSECUTIVE',
  'ALERT_IMMEDIATELY',
] as const;
export const MultipleFacesPolicy = {
  LOG_ONLY: 'LOG_ONLY',
  ALERT_AFTER_CONSECUTIVE: 'ALERT_AFTER_CONSECUTIVE',
  ALERT_IMMEDIATELY: 'ALERT_IMMEDIATELY',
} as const;
export type MultipleFacesPolicy = (typeof MULTIPLE_FACES_POLICIES)[number];
export const multipleFacesPolicySchema = z.enum(MULTIPLE_FACES_POLICIES);

export const CAMERA_FAILURE_POLICIES = ['ALERT_AFTER_GRACE', 'ALERT_IMMEDIATELY'] as const;
export const CameraFailurePolicy = {
  ALERT_AFTER_GRACE: 'ALERT_AFTER_GRACE',
  ALERT_IMMEDIATELY: 'ALERT_IMMEDIATELY',
} as const;
export type CameraFailurePolicy = (typeof CAMERA_FAILURE_POLICIES)[number];
export const cameraFailurePolicySchema = z.enum(CAMERA_FAILURE_POLICIES);

export const DELETION_REQUEST_STATUSES = ['PENDING', 'FULFILLED', 'REJECTED'] as const;
export const DeletionRequestStatus = {
  PENDING: 'PENDING',
  FULFILLED: 'FULFILLED',
  REJECTED: 'REJECTED',
} as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];
export const deletionRequestStatusSchema = z.enum(DELETION_REQUEST_STATUSES);

