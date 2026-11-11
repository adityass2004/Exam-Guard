import { z } from 'zod';
import { ExamStatus, SessionStatus, examStatusSchema, sessionStatusSchema } from './enums.js';

export const createExamSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150, 'Title must not exceed 150 characters'),
  description: z.string().trim().max(1000).optional().nullable(),
  durationMinutes: z.number().int().min(1, 'Duration must be at least 1 minute').max(600, 'Duration cannot exceed 600 minutes'),
  shuffleQuestions: z.boolean().default(false),
  passPercentage: z.number().min(0).max(100).optional().nullable(),
  showScoreAfterSubmit: z.boolean().default(true),
  verificationSettingsId: z.string().nullable().optional(),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = createExamSchema.partial();
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

export const questionOptionSchema = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(1, 'Option text is required').max(500),
  isCorrect: z.boolean().default(false),
});

export type QuestionOptionInput = z.infer<typeof questionOptionSchema>;

export const createQuestionSchema = z.object({
  text: z.string().trim().min(3, 'Question text must be at least 3 characters').max(2000),
  points: z.number().int().min(1, 'Points must be at least 1').default(1),
  orderIndex: z.number().int().min(1).optional(),
  options: z
    .array(questionOptionSchema)
    .min(2, 'A question must have at least 2 options')
    .max(6, 'A question cannot have more than 6 options')
    .refine(
      (opts) => opts.filter((o) => o.isCorrect).length === 1,
      'Exactly one option must be marked as correct'
    ),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  text: z.string().trim().min(3).max(2000).optional(),
  points: z.number().int().min(1).optional(),
  orderIndex: z.number().int().min(1).optional(),
  options: z
    .array(questionOptionSchema)
    .min(2, 'A question must have at least 2 options')
    .max(6, 'A question cannot have more than 6 options')
    .refine(
      (opts) => opts.filter((o) => o.isCorrect).length === 1,
      'Exactly one option must be marked as correct'
    )
    .optional(),
});

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const reorderQuestionsSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1, 'questionIds cannot be empty'),
});

export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;

export const answerQuestionSchema = z.object({
  optionId: z.string().min(1, 'optionId is required'),
});

export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;

export interface StudentExamListItem {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  questionCount: number;
  canStart: boolean;
  reason: string | null;
  activeSessionId: string | null;
}

export interface StudentSessionDetail {
  id: string;
  examId: string;
  examTitle: string;
  status: SessionStatus;
  startedAt: string | null;
  expiresAt: string | null;
  serverNow: string;
  settings: {
    intervalMs: number;
  };
}

export interface StudentSessionQuestionOption {
  id: string;
  text: string;
}

export interface StudentSessionQuestion {
  id: string;
  text: string;
  points: number;
  orderIndex: number;
  options: StudentSessionQuestionOption[];
  selectedOptionId?: string | null;
}

export interface SessionSummary {
  sessionId: string;
  examTitle: string;
  status: SessionStatus;
  startedAt: string | null;
  submittedAt: string | null;
  durationMinutes: number;
  totalAttempts: number;
  successfulMatches: number;
  failedMatches: number;
  unverified: number;
  securityTriggersCount: number;
  securityTriggers: Array<{
    type: string;
    friendlyName: string;
    count: number;
  }>;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
}

