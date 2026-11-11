import { z } from 'zod';
import { VerificationOutcome, VerificationPhase } from '@prisma/client';

export const verificationHistoryQuerySchema = z.object({
  studentId: z.string().trim().optional(),
  examId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  outcome: z
    .union([
      z.nativeEnum(VerificationOutcome),
      z.array(z.nativeEnum(VerificationOutcome)),
      z.string().transform((val) => val.split(',').map((s) => s.trim()) as VerificationOutcome[]),
    ])
    .optional(),
  triggerType: z.string().trim().optional(),
  phase: z.nativeEnum(VerificationPhase).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export type VerificationHistoryQuery = z.infer<typeof verificationHistoryQuerySchema>;

