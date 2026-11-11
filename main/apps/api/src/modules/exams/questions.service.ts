import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { auditService } from '../audit/audit.service.js';
import { CreateQuestionInput, UpdateQuestionInput } from '@examguard/shared';

export class QuestionsService {
  private async assertNoSessions(examId: string): Promise<void> {
    const sessionCount = await prisma.examSession.count({
      where: { examId },
    });
    if (sessionCount > 0) {
      throw new AppError(
        'EXAM_HAS_SESSIONS',
        409,
        'Cannot modify questions of an exam that has existing sessions'
      );
    }
  }

  async addQuestion(
    examId: string,
    input: CreateQuestionInput,
    actorUserId: string,
    requestId?: string
  ) {
    await this.assertNoSessions(examId);

    const exam = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
      include: {
        questions: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!exam) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    const nextPosition = exam.questions.length + 1;

    return prisma.$transaction(async (tx) => {
      const question = await tx.examQuestion.create({
        data: {
          examId,
          prompt: input.text,
          points: input.points ?? 1,
          position: nextPosition,
          options: {
            create: input.options.map((opt, idx) => ({
              label: opt.text,
              isCorrect: opt.isCorrect,
              position: idx + 1,
            })),
          },
        },
        include: {
          options: {
            orderBy: { position: 'asc' },
          },
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'QUESTION_CREATED',
          entityType: 'ExamQuestion',
          entityId: question.id,
          before: Prisma.JsonNull,
          after: {
            examId,
            questionId: question.id,
            position: question.position,
            prompt: question.prompt,
            optionsCount: question.options.length,
          },
          requestId: requestId ?? null,
        },
      });

      return question;
    });
  }

  async updateQuestion(
    examId: string,
    questionId: string,
    input: UpdateQuestionInput,
    actorUserId: string,
    requestId?: string
  ) {
    await this.assertNoSessions(examId);

    const existing = await prisma.examQuestion.findFirst({
      where: { id: questionId, examId, deletedAt: null },
      include: { options: true },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Question not found');
    }

    return prisma.$transaction(async (tx) => {
      if (input.options && input.options.length > 0) {
        // Delete existing options and recreate
        await tx.examQuestionOption.deleteMany({
          where: { questionId },
        });

        await tx.examQuestionOption.createMany({
          data: input.options.map((opt, idx) => ({
            questionId,
            label: opt.text,
            isCorrect: opt.isCorrect,
            position: idx + 1,
          })),
        });
      }

      const updated = await tx.examQuestion.update({
        where: { id: questionId },
        data: {
          prompt: input.text ?? existing.prompt,
          points: input.points ?? existing.points,
        },
        include: {
          options: {
            orderBy: { position: 'asc' },
          },
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'QUESTION_UPDATED',
          entityType: 'ExamQuestion',
          entityId: questionId,
          before: {
            prompt: existing.prompt,
            points: existing.points,
            optionsCount: existing.options.length,
          },
          after: {
            prompt: updated.prompt,
            points: updated.points,
            optionsCount: updated.options.length,
          },
          requestId: requestId ?? null,
        },
      });

      return updated;
    });
  }

  async deleteQuestion(
    examId: string,
    questionId: string,
    actorUserId: string,
    requestId?: string
  ) {
    await this.assertNoSessions(examId);

    const existing = await prisma.examQuestion.findFirst({
      where: { id: questionId, examId, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Question not found');
    }

    await prisma.$transaction(async (tx) => {
      // Delete options and question
      await tx.examQuestionOption.deleteMany({
        where: { questionId },
      });

      await tx.examQuestion.delete({
        where: { id: questionId },
      });

      // Renumber remaining questions contiguously 1..N
      const remaining = await tx.examQuestion.findMany({
        where: { examId, deletedAt: null },
        orderBy: { position: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        const newPos = i + 1;
        if (remaining[i].position !== newPos) {
          await tx.examQuestion.update({
            where: { id: remaining[i].id },
            data: { position: newPos },
          });
        }
      }

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'QUESTION_DELETED',
          entityType: 'ExamQuestion',
          entityId: questionId,
          before: {
            examId,
            position: existing.position,
            prompt: existing.prompt,
          },
          after: Prisma.JsonNull,
          requestId: requestId ?? null,
        },
      });
    });
  }

  async reorderQuestions(
    examId: string,
    questionIds: string[],
    actorUserId: string,
    requestId?: string
  ) {
    await this.assertNoSessions(examId);

    const existing = await prisma.examQuestion.findMany({
      where: { examId, deletedAt: null },
      orderBy: { position: 'asc' },
    });

    if (existing.length !== questionIds.length) {
      throw new AppError('VALIDATION_ERROR', 400, 'Reorder list must contain all active question IDs');
    }

    const existingSet = new Set(existing.map((q) => q.id));
    for (const qId of questionIds) {
      if (!existingSet.has(qId)) {
        throw new AppError('VALIDATION_ERROR', 400, `Question ${qId} does not belong to this exam`);
      }
    }

    await prisma.$transaction(async (tx) => {
      // Temporarily shift positions to prevent collision if unique index exists
      for (let i = 0; i < questionIds.length; i++) {
        await tx.examQuestion.update({
          where: { id: questionIds[i] },
          data: { position: 10000 + i },
        });
      }

      for (let i = 0; i < questionIds.length; i++) {
        await tx.examQuestion.update({
          where: { id: questionIds[i] },
          data: { position: i + 1 },
        });
      }

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'QUESTIONS_REORDERED',
          entityType: 'Exam',
          entityId: examId,
          before: { order: existing.map((q) => q.id) },
          after: { order: questionIds },
          requestId: requestId ?? null,
        },
      });
    });
  }
}

export const questionsService = new QuestionsService();
