import { ExamStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { CreateExamInput, UpdateExamInput } from '@examguard/shared';

export class ExamsService {
  async listExams(query: {
    search?: string;
    status?: ExamStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      where.title = { contains: query.search.trim() };
    }

    const [total, exams] = await Promise.all([
      prisma.exam.count({ where }),
      prisma.exam.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              questions: { where: { deletedAt: null } },
              sessions: true,
            },
          },
        },
      }),
    ]);

    return {
      data: exams.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        durationMinutes: e.durationMinutes,
        status: e.status,
        shuffleQuestions: e.shuffleQuestions,
        showScoreAfterSubmit: e.showScoreAfterSubmit,
        questionCount: e._count.questions,
        sessionCount: e._count.sessions,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createExam(input: CreateExamInput, actorUserId: string, requestId?: string) {
    if (input.verificationSettingsId) {
      const setting = await prisma.verificationSetting.findUnique({
        where: { id: input.verificationSettingsId },
      });
      if (!setting) {
        throw new AppError('SETTINGS_NOT_FOUND', 400, 'Specified verification settings version was not found');
      }
    }

    return prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          durationMinutes: input.durationMinutes,
          shuffleQuestions: input.shuffleQuestions ?? false,
          showScoreAfterSubmit: input.showScoreAfterSubmit ?? true,
          verificationSettingsId: input.verificationSettingsId ?? null,
          status: ExamStatus.DRAFT,
          createdBy: actorUserId,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'EXAM_CREATED',
          entityType: 'Exam',
          entityId: exam.id,
          before: Prisma.JsonNull,
          after: {
            title: exam.title,
            durationMinutes: exam.durationMinutes,
            status: exam.status,
          },
          requestId: requestId ?? null,
        },
      });

      return exam;
    });
  }

  async getExam(examId: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
      include: {
        questions: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          include: {
            options: {
              orderBy: { position: 'asc' },
            },
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!exam) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    const activeSessionsCount = await prisma.examSession.count({
      where: {
        examId,
        status: { in: ['PENDING_VERIFICATION', 'IN_PROGRESS'] },
      },
    });

    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      status: exam.status,
      shuffleQuestions: exam.shuffleQuestions,
      showScoreAfterSubmit: exam.showScoreAfterSubmit,
      totalSessionsCount: exam._count.sessions,
      activeSessionsCount,
      questions: exam.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        position: q.position,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          position: o.position,
          isCorrect: o.isCorrect,
        })),
      })),
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString(),
    };
  }

  async updateExam(
    examId: string,
    input: UpdateExamInput,
    actorUserId: string,
    requestId?: string
  ) {
    const existing = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    if (input.verificationSettingsId) {
      const setting = await prisma.verificationSetting.findUnique({
        where: { id: input.verificationSettingsId },
      });
      if (!setting) {
        throw new AppError('SETTINGS_NOT_FOUND', 400, 'Specified verification settings version was not found');
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data: {
          title: input.title ?? existing.title,
          description: input.description !== undefined ? input.description : existing.description,
          durationMinutes: input.durationMinutes ?? existing.durationMinutes,
          shuffleQuestions: input.shuffleQuestions ?? existing.shuffleQuestions,
          showScoreAfterSubmit: input.showScoreAfterSubmit ?? existing.showScoreAfterSubmit,
          verificationSettingsId:
            input.verificationSettingsId !== undefined
              ? input.verificationSettingsId
              : existing.verificationSettingsId,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'EXAM_UPDATED',
          entityType: 'Exam',
          entityId: examId,
          before: {
            title: existing.title,
            durationMinutes: existing.durationMinutes,
            shuffleQuestions: existing.shuffleQuestions,
          },
          after: {
            title: updated.title,
            durationMinutes: updated.durationMinutes,
            shuffleQuestions: updated.shuffleQuestions,
          },
          requestId: requestId ?? null,
        },
      });

      return updated;
    });
  }

  async deleteExam(examId: string, actorUserId: string, requestId?: string) {
    const existing = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    if (existing._count.sessions > 0) {
      throw new AppError(
        'EXAM_HAS_SESSIONS',
        409,
        'Cannot delete an exam that has existing sessions. Deactivate the exam instead.'
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id: examId },
        data: {
          deletedAt: new Date(),
          status: ExamStatus.INACTIVE,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'EXAM_DELETED',
          entityType: 'Exam',
          entityId: examId,
          before: { status: existing.status, title: existing.title },
          after: { deletedAt: new Date().toISOString(), status: ExamStatus.INACTIVE },
          requestId: requestId ?? null,
        },
      });
    });
  }

  async activateExam(examId: string, actorUserId: string, requestId?: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
      include: {
        questions: {
          where: { deletedAt: null },
          include: {
            options: true,
          },
        },
      },
    });

    if (!exam) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    // Validation 1: At least 1 question
    if (exam.questions.length === 0) {
      throw new AppError(
        'EXAM_NOT_READY',
        400,
        'Cannot activate exam: must contain at least one question'
      );
    }

    // Validation 2: Every question must have 2–6 options with exactly one correct option
    const errors: string[] = [];
    for (const q of exam.questions) {
      if (q.options.length < 2 || q.options.length > 6) {
        errors.push(`Question #${q.position} must have between 2 and 6 options (found ${q.options.length})`);
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        errors.push(
          `Question #${q.position} must have exactly one correct option (found ${correctCount})`
        );
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        'EXAM_NOT_READY',
        400,
        `Cannot activate exam: question validation failed`,
        errors
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data: { status: ExamStatus.ACTIVE },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'EXAM_ACTIVATED',
          entityType: 'Exam',
          entityId: examId,
          before: { status: exam.status },
          after: { status: ExamStatus.ACTIVE },
          requestId: requestId ?? null,
        },
      });

      return updated;
    });
  }

  async deactivateExam(examId: string, actorUserId: string, requestId?: string) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
    });

    if (!exam) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data: { status: ExamStatus.INACTIVE },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'EXAM_DEACTIVATED',
          entityType: 'Exam',
          entityId: examId,
          before: { status: exam.status },
          after: { status: ExamStatus.INACTIVE },
          requestId: requestId ?? null,
        },
      });

      return updated;
    });
  }

  async getParticipants(
    examId: string,
    query: { page?: number; limit?: number }
  ) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const exam = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
    });

    if (!exam) {
      throw new AppError('NOT_FOUND', 404, 'Exam not found');
    }

    const where = { examId };

    const [total, sessions] = await Promise.all([
      prisma.examSession.count({ where }),
      prisma.examSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          studentUser: {
            include: {
              studentProfile: true,
            },
          },
        },
      }),
    ]);

    return {
      data: sessions.map((s) => ({
        sessionId: s.id,
        studentId: s.studentUser.studentProfile?.studentId ?? s.studentUserId,
        studentName: s.studentUser.fullName,
        studentEmail: s.studentUser.email,
        status: s.status,
        startedAt: s.startedAt?.toISOString() ?? null,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        score: s.score,
        maxScore: s.maxScore,
        attemptsCount: s.totalAttempts,
        preExamAttempts: s.preExamAttempts,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const examsService = new ExamsService();
