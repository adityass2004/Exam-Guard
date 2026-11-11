import { z } from 'zod';
import {
  TriggerType,
  triggerTypeSchema,
  Severity,
  severitySchema,
  IncidentStatus,
  incidentStatusSchema,
  ReviewDisposition,
  reviewDispositionSchema,
  EvidenceCaptureStatus,
  evidenceCaptureStatusSchema,
} from './enums.js';

export interface TriggerEvidenceDto {
  id: string;
  triggerId: string;
  verificationLogId: string;
  storagePath: string;
  sha256: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  capturedAt: string;
  createdAt: string;
}

export interface SecurityIncidentDto {
  id: string;
  incidentCode: string;
  sessionId: string;
  studentUserId: string;
  studentName?: string;
  studentEmail?: string;
  examId: string;
  examTitle?: string;
  triggerType: TriggerType;
  severity: Severity;
  status: IncidentStatus;
  disposition: ReviewDisposition | null;
  activeDedupeKey: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  recoveredAt: string | null;
  occurrenceCount: number;
  firstSimilarityPct: number | null;
  worstSimilarityPct: number | null;
  firstVerificationLogId: string;
  lastVerificationLogId: string;
  evidenceStatus: EvidenceCaptureStatus;
  evidenceFailureReason: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  evidence?: TriggerEvidenceDto | null;
}

export interface TriggerEventDto {
  id: string;
  incidentId: string;
  sessionId: string;
  verificationLogId: string;
  triggerType: TriggerType;
  severity: Severity;
  contextData?: Record<string, any> | null;
  createdAt: string;
}

export interface IncidentWarningDto {
  id: string;
  incidentCode: string;
  triggerType: TriggerType;
  message: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  examTitle: string;
  note: string;
}

export const incidentFilterSchema = z.object({
  status: incidentStatusSchema.optional(),
  severity: severitySchema.optional(),
  triggerType: triggerTypeSchema.optional(),
  examId: z.string().uuid().optional(),
  studentUserId: z.string().uuid().optional(),
  ongoingOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  evidenceFailedOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type IncidentFilterQuery = z.infer<typeof incidentFilterSchema>;

export const acknowledgeIncidentSchema = z.object({
  note: z.string().max(1000).optional(),
});

export type AcknowledgeIncidentInput = z.infer<typeof acknowledgeIncidentSchema>;

export const reviewIncidentSchema = z.object({
  disposition: reviewDispositionSchema,
  note: z.string().max(2000).optional(),
}).refine(
  (data) => {
    if (data.disposition === 'CONFIRMED_CONCERN') {
      return !!data.note && data.note.trim().length >= 10;
    }
    return true;
  },
  {
    message: 'A note of at least 10 characters is required when confirming concern',
    path: ['note'],
  }
);

export type ReviewIncidentInput = z.infer<typeof reviewIncidentSchema>;

export const addIncidentNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});

export type AddIncidentNoteInput = z.infer<typeof addIncidentNoteSchema>;
