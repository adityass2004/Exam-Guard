import { Prisma, VerificationOutcome, VerificationPhase, TriggerType } from '@prisma/client';

export interface BaseVerificationFilterParams {
  studentId?: string;
  examId?: string;
  sessionId?: string;
  from?: string;
  to?: string;
  outcome?: VerificationOutcome | VerificationOutcome[];
  triggerType?: string;
  phase?: VerificationPhase;
}

export function buildVerificationWhere(
  params: BaseVerificationFilterParams
): Prisma.VerificationLogWhereInput {
  const where: Prisma.VerificationLogWhereInput = {};

  if (params.studentId) {
    where.studentUserId = params.studentId;
  }

  if (params.examId) {
    where.examId = params.examId;
  }

  if (params.sessionId) {
    where.sessionId = params.sessionId;
  }

  if (params.phase) {
    where.phase = params.phase;
  }

  if (params.outcome) {
    if (Array.isArray(params.outcome)) {
      where.outcome = { in: params.outcome };
    } else {
      where.outcome = params.outcome;
    }
  }

  if (params.triggerType) {
    where.trigger = {
      triggerType: params.triggerType as TriggerType,
    };
  }

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      where.createdAt.gte = new Date(params.from);
    }
    if (params.to) {
      where.createdAt.lte = new Date(params.to);
    }
  }

  return where;
}

