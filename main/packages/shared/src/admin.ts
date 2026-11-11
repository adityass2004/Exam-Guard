import { z } from 'zod';
import { EnrollmentStatus, FaceAngle, UserRole, UserStatus, DeletionRequestStatus } from './enums.js';

// ============================================================================
// Admin Dashboard
// ============================================================================

export interface AdminDashboardMetrics {
  totalStudents: number;
  enrolledCandidates: number;
  pendingEnrollmentApprovals: number;
  activeExams: number;
  activeSessions: number;
  totalVerificationAttempts: number;
  successfulVerifications: number;
  failedVerifications: number;
  unverifiedVerifications: number;
  activeSecurityIncidents: number;
}

export interface PendingApprovalSummary {
  profileId: string;
  studentUserId: string;
  studentId: string;
  fullName: string;
  email: string;
  version: number;
  submittedAt: string | null;
  createdAt: string;
  sampleCount: number;
}

export interface RecentAdminAction {
  id: string;
  action: string;
  actorEmail?: string | null;
  actorName?: string | null;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface AdminDashboardData {
  metrics: AdminDashboardMetrics;
  pendingApprovals: PendingApprovalSummary[];
  recentActions: RecentAdminAction[];
}

// ============================================================================
// Student Management
// ============================================================================

export interface StudentListItemDto {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  status: UserStatus;
  enrollmentStatus: EnrollmentStatus | 'NOT_STARTED';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StudentDetailDto {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  status: UserStatus;
  enrollmentStatus: EnrollmentStatus | 'NOT_STARTED';
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  enrollmentSummary: {
    currentVersion: number | null;
    totalVersions: number;
    status: EnrollmentStatus | 'NOT_STARTED';
    consistency: number | null;
    submittedAt: string | null;
    approvedAt: string | null;
    rejectedReason: string | null;
  };
  sessions: any[];
  recentWarnings: any[];
}

export const updateStudentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export type UpdateStudentStatusInput = z.infer<typeof updateStudentStatusSchema>;

export const resetPasswordResponseSchema = z.object({
  temporaryPassword: z.string(),
  message: z.string(),
});

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

// ============================================================================
// Face Gallery & Enrollment Images
// ============================================================================

export interface FaceImageDto {
  id: string;
  angle: FaceAngle;
  capturedAt: string;
  width: number;
  height: number;
  byteSize: number;
  mime: string;
  quality: any;
  authorizedImageUrl: string;
}

export interface FaceProfileVersionDto {
  id: string;
  version: number;
  status: EnrollmentStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approverName?: string | null;
  rejectedReason: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  qualitySummary: any | null;
  consistencyMinObserved: number | null;
  modelName: string;
  modelVersion: string;
  embeddingDim: number;
  images: FaceImageDto[];
}

export interface CandidateFaceGalleryDto {
  student: {
    id: string;
    fullName: string;
    studentId: string;
    email: string;
    status: UserStatus;
  };
  profiles: FaceProfileVersionDto[];
}

export interface CandidateGalleryItemDto {
  studentUserId: string;
  fullName: string;
  studentId: string;
  email: string;
  status: UserStatus;
  enrollmentStatus: EnrollmentStatus | 'NOT_STARTED';
  activeProfileId?: string;
  frontImageId?: string;
  frontImageUrl?: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
}

// ============================================================================
// Enrollment Approval
// ============================================================================

export const rejectEnrollmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Rejection reason must be at least 3 characters')
    .max(500, 'Rejection reason cannot exceed 500 characters'),
});

export type RejectEnrollmentInput = z.infer<typeof rejectEnrollmentSchema>;

export interface PendingEnrollmentItemDto {
  profileId: string;
  student: {
    id: string;
    fullName: string;
    studentId: string;
    email: string;
  };
  version: number;
  submittedAt: string | null;
  consistency: number | null;
  qualitySummary: any;
  images: FaceImageDto[];
}

// ============================================================================
// System Settings
// ============================================================================

export interface SystemSettingsDto {
  requireEnrollmentApproval: boolean;
  retentionEnrollmentImagesDays?: number;
  retentionEvidenceDays?: number;
  retentionVerificationLogsDays?: number;
  retentionAuditLogsDays?: number;
  consentPolicyVersion?: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export const updateSystemSettingsSchema = z.object({
  requireEnrollmentApproval: z.boolean().optional(),
  retentionEnrollmentImagesDays: z.number().int().min(0).max(3650).optional(),
  retentionEvidenceDays: z.number().int().min(0).max(3650).optional(),
  retentionVerificationLogsDays: z.number().int().min(0).max(3650).optional(),
  retentionAuditLogsDays: z.number().int().min(0).max(3650).optional(),
  consentPolicyVersion: z.string().min(1).max(20).optional(),
});

export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;

// ============================================================================
// Data Deletion Workflow
// ============================================================================

export interface DataDeletionRequestDto {
  id: string;
  studentUserId: string;
  studentFullName: string;
  studentId: string;
  studentEmail: string;
  status: DeletionRequestStatus;
  reason: string | null;
  requestedAt: string;
  handledAt: string | null;
  handlerEmail?: string | null;
  handlerNote: string | null;
}

export const rejectDeletionRequestSchema = z.object({
  note: z
    .string()
    .trim()
    .min(3, 'Rejection note must be at least 3 characters')
    .max(500, 'Rejection note cannot exceed 500 characters'),
});

export type RejectDeletionRequestInput = z.infer<typeof rejectDeletionRequestSchema>;

// ============================================================================
// Audit Viewer
// ============================================================================

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorRole: UserRole;
  actorEmail?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: any | null;
  after: any | null;
  requestId: string | null;
  ipHash: string | null;
  createdAt: string;
}
