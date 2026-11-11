import { z } from 'zod';
import { EnrollmentStatus, FaceAngle, faceAngleSchema } from './enums.js';

export const BIOMETRIC_CONSENT_POLICY_VERSION = '1.0';

export const BIOMETRIC_CONSENT_TEXT = `ExamGuard Biometric Identity Verification Consent (Version 1.0)

1. Purpose: You are providing facial biometric reference data solely for verifying your identity before and continuously during official online examinations administered through ExamGuard.
2. Data Collected: During the multi-angle enrollment process, ExamGuard captures five photographs of your face from specific angles (Front, Left, Right, Slight Up, Slight Down) and extracts mathematical facial embedding vectors.
3. Security & Storage: All captured photographs and biometric embeddings are encrypted using AES-256-GCM encryption keys and stored securely in private institutional storage. No biometric data is stored unencrypted, and no biometric data is transmitted to external cloud services or third parties.
4. Access: Encrypted enrollment photos may only be accessed by authorized institutional proctors and system administrators for identity verification, proctoring reviews, and investigating flagged exam integrity incidents.
5. Your Rights: You have the right to request deletion of your biometric profile at any time through the student portal. Withdrawing consent or requesting deletion will remove your biometric reference data in accordance with institutional retention policies.

By checking the agreement box and clicking accept, you acknowledge that you have read, understand, and voluntarily consent to the collection and processing of your facial biometric data for the purposes described above.`.trim();

// Pre-computed SHA-256 of the canonical BIOMETRIC_CONSENT_TEXT
// Computed using crypto.createHash('sha256').update(BIOMETRIC_CONSENT_TEXT).digest('hex')
export const BIOMETRIC_CONSENT_SHA256 = '2c25a418f141e2b764c9b1471ff10721a81b115d3f0f4681f5dc63b3b310ca73';

export const consentInputSchema = z.object({
  accepted: z.boolean(),
  policyVersion: z.string().min(1),
});
export type ConsentInput = z.infer<typeof consentInputSchema>;

export const previewCheckSchema = z.object({
  angle: faceAngleSchema,
});
export type PreviewCheckInput = z.infer<typeof previewCheckSchema>;

export const captureSchema = z.object({
  angle: faceAngleSchema,
});
export type CaptureInput = z.infer<typeof captureSchema>;

export const deletionRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type DeletionRequestInput = z.infer<typeof deletionRequestSchema>;

export interface AngleCaptureDto {
  captured: boolean;
  capturedAt?: string;
  qualitySummary?: Record<string, any>;
}

export interface EnrollmentProfileDto {
  id: string;
  version: number;
  status: EnrollmentStatus;
  progress: number; // 0..5
  angles: Record<FaceAngle, AngleCaptureDto>;
  submittedAt?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

export interface EnrollmentStatusResponse {
  hasConsent: boolean;
  profile: EnrollmentProfileDto | null;
  previousApprovedProfileExists: boolean;
}

export interface PreviewCheckResponse {
  acceptable: boolean;
  reasons: string[];
  hints: string[];
  quality: {
    blur: number;
    brightness: number;
    faceSizeRatio: number;
    faceInFrame: boolean;
    poseOk: boolean;
    underExposureFraction: number;
    overExposureFraction: number;
  };
  faceCount: number;
}

export interface EnrollmentCaptureResponse {
  angle: FaceAngle;
  captured: boolean;
  progress: number;
  quality: Record<string, any>;
}

export interface EnrollmentFinalizeResponse {
  profileId: string;
  status: EnrollmentStatus;
  submittedAt: string;
  approvedAt?: string;
  message: string;
}

export interface StudentDashboardDto {
  profile: {
    fullName: string;
    email: string;
    studentId: string;
  };
  enrollment: {
    status: EnrollmentStatus | 'NOT_STARTED';
    version: number;
    hasConsent: boolean;
    progress: number;
    canStartExam: boolean;
    statusMessage: string;
  };
  availableExams: Array<{
    id: string;
    title: string;
    durationMinutes: number;
    totalQuestions: number;
    canStart: boolean;
    eligibilityReason?: string;
  }>;
  previousSessions: Array<{
    id: string;
    examTitle: string;
    startedAt: string;
    submittedAt?: string;
    status: string;
    score?: number | null;
    maxScore?: number | null;
  }>;
  verificationSummary: {
    totalAttempts: number;
    successfulMatches: number;
    failedMatches: number;
    unverified: number;
  };
  previousWarnings: Array<{
    id: string;
    type: string;
    detectedAt: string;
    description: string;
    examTitle?: string;
    note?: string;
  }>;
}
