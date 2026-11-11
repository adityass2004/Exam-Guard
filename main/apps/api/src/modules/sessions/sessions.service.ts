import { ExamStatus, Prisma, SessionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { computeExamScore } from './scoring.js';
import {
  StudentExamListItem,
  StudentSessionDetail,
  StudentSessionQuestion,
} from '@examguard/shared';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

function stableShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h) ^ h;
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class SessionsService {
  constructor(private clock: Clock = systemClock) {}

  async listStudentExams(studentUserId: string): Promise<StudentExamListItem[]> {
    const student = await prisma.user.findUnique({
      where: { id: studentUserId, deletedAt: null },
      include: {
        studentProfile: true,
        faceProfiles: {
          where: { status: 'APPROVED' },
          take: 1,
        },
      },
    });

    if (!student) {
      throw new AppError('NOT_FOUND', 404, 'Student user not found');
    }

    const isSuspended = student.status === 'SUSPENDED';
    const hasApprovedProfile = student.faceProfiles.length > 0;

    // Check if student currently has an active session
    const activeSession = await prisma.examSession.findFirst({
      where: {
        studentUserId,
        status: { in: ['PENDING_VERIFICATION', 'IN_PROGRESS'] },
      },
    });

    // Check lazy expiry on activeSession
    if (
      activeSession &&
      activeSession.status === 'IN_PROGRESS' &&
      activeSession.expiresAt &&
      activeSession.expiresAt <= this.clock.now()
    ) {
      await this.expireSession(activeSession.id);
    }

    const liveSession = await prisma.examSession.findFirst({
      where: {
        studentUserId,
        status: { in: ['PENDING_VERIFICATION', 'IN_PROGRESS'] },
      },
    });

    const exams = await prisma.exam.findMany({
      where: {
        status: ExamStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            questions: { where: { deletedAt: null } },
          },
        },
      },
    });

    return exams.map((exam) => {
      let canStart = true;
      let reason: string | null = null;
      let activeSessionId: string | null = null;

      if (isSuspended) {
        canStart = false;
        reason = 'ACCOUNT_SUSPENDED';
      } else if (!hasApprovedProfile) {
        canStart = false;
        reason = 'ENROLLMENT_NOT_APPROVED';
      } else if (liveSession) {
        if (liveSession.examId === exam.id) {
          canStart = true;
          activeSessionId = liveSession.id;
        } else {
          canStart = false;
          reason = 'ANOTHER_SESSION_ACTIVE';
        }
      }

      return {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        questionCount: exam._count.questions,
        canStart,
        reason,
        activeSessionId,
      };
    });
  }

  async createOrResumeSession(
    examId: string,
    studentUserId: string,
    requestId?: string
  ): Promise<StudentSessionDetail> {
    const student = await prisma.user.findUnique({
      where: { id: studentUserId, deletedAt: null },
      include: {
        faceProfiles: {
          where: { status: 'APPROVED' },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!student || student.status === 'SUSPENDED') {
      throw new AppError('FORBIDDEN', 403, 'Account is suspended or invalid');
    }

    if (student.faceProfiles.length === 0) {
      throw new AppError(
        'ENROLLMENT_NOT_APPROVED',
        403,
        'Approved biometric face enrollment is required to take exams'
      );
    }

    const faceProfile = student.faceProfiles[0];

    const exam = await prisma.exam.findUnique({
      where: { id: examId, deletedAt: null },
    });

    if (!exam || exam.status !== ExamStatus.ACTIVE) {
      throw new AppError('EXAM_NOT_ACTIVE', 400, 'This exam is not active or available');
    }

    // Check existing live session
    const existing = await prisma.examSession.findFirst({
      where: {
        studentUserId,
        status: { in: ['PENDING_VERIFICATION', 'IN_PROGRESS'] },
      },
      include: { exam: true },
    });

    if (existing) {
      // Lazy check expiry
      if (
        existing.status === 'IN_PROGRESS' &&
        existing.expiresAt &&
        existing.expiresAt <= this.clock.now()
      ) {
        await this.expireSession(existing.id);
      } else {
        if (existing.examId === examId) {
          const snapshot = existing.settingsSnapshot as any;
          return {
            id: existing.id,
            examId: existing.examId,
            examTitle: existing.exam.title,
            status: existing.status,
            startedAt: existing.startedAt?.toISOString() ?? null,
            expiresAt: existing.expiresAt?.toISOString() ?? null,
            serverNow: this.clock.now().toISOString(),
            settings: {
              intervalMs: Number(snapshot?.intervalMs) || 1500,
            },
          };
        } else {
          throw new AppError(
            'ANOTHER_SESSION_ACTIVE',
            409,
            'You already have an active session for another exam'
          );
        }
      }
    }

    // Find active settings or exam override
    let settingId = exam.verificationSettingsId;
    let setting;
    if (settingId) {
      setting = await prisma.verificationSetting.findUnique({ where: { id: settingId } });
    }
    if (!setting) {
      setting = await prisma.verificationSetting.findFirst({
        where: { isActive: true },
        orderBy: { version: 'desc' },
      });
    }

    if (!setting) {
      throw new AppError('INTERNAL_ERROR', 500, 'No active verification settings found in system');
    }

    // Build immutable snapshot
    const settingsSnapshot = {
      id: setting.id,
      version: setting.version,
      thresholdPct: setting.thresholdPct,
      matchThresholdPct: setting.thresholdPct,
      minFaceQuality:
        typeof setting.minFaceQuality === 'object' &&
        setting.minFaceQuality !== null &&
        'minDetScore' in (setting.minFaceQuality as any)
          ? (setting.minFaceQuality as any).minDetScore
          : 0.60,
      intervalMs: setting.intervalMs,
      consecutiveMismatchLimit: setting.consecutiveMismatchLimit,
      missingFaceLimit: setting.missingFaceLimit,
      multipleFacesPolicy: setting.multipleFacesPolicy,
      multipleFacesConsecutiveLimit: setting.multipleFacesConsecutiveLimit,
      cameraFailurePolicy: setting.cameraFailurePolicy,
      cameraGraceSeconds: setting.cameraGraceSeconds,
      serviceFailureLimit: setting.serviceFailureLimit,
      repeatedFailureLimit: setting.repeatedFailureLimit,
      recoveryMatchCount: setting.recoveryMatchCount,
      startupGraceSeconds: setting.startupGraceSeconds,
      preExamRequiredMatches: setting.preExamRequiredMatches,
      severityRules: setting.severityRules,
    };

    return prisma.$transaction(async (tx) => {
      // Re-verify active_student_key inside transaction
      const liveConflict = await tx.examSession.findUnique({
        where: { activeStudentKey: studentUserId },
      });

      if (liveConflict) {
        if (liveConflict.examId === examId) {
          const snapshot = liveConflict.settingsSnapshot as any;
          return {
            id: liveConflict.id,
            examId: liveConflict.examId,
            examTitle: exam.title,
            status: liveConflict.status,
            startedAt: liveConflict.startedAt?.toISOString() ?? null,
            expiresAt: liveConflict.expiresAt?.toISOString() ?? null,
            serverNow: this.clock.now().toISOString(),
            settings: {
              intervalMs: Number(snapshot?.intervalMs) || 1500,
            },
          };
        }
        throw new AppError('ANOTHER_SESSION_ACTIVE', 409, 'Another exam session is currently active');
      }

      const session = await tx.examSession.create({
        data: {
          examId,
          studentUserId,
          faceProfileId: faceProfile.id,
          settingsVersionId: setting.id,
          settingsSnapshot,
          status: SessionStatus.PENDING_VERIFICATION,
          activeStudentKey: studentUserId,
          nextSequenceNo: 1,
          preExamAttempts: 0,
          preExamConsecutiveMatches: 0,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: studentUserId,
          actorRole: 'STUDENT',
          action: 'SESSION_CREATED',
          entityType: 'ExamSession',
          entityId: session.id,
          before: Prisma.JsonNull,
          after: {
            examId,
            studentUserId,
            status: session.status,
          },
          requestId: requestId ?? null,
        },
      });

      return {
        id: session.id,
        examId: session.examId,
        examTitle: exam.title,
        status: session.status,
        startedAt: null,
        expiresAt: null,
        serverNow: this.clock.now().toISOString(),
        settings: {
          intervalMs: setting.intervalMs,
        },
      };
    });
  }

  async getSession(sessionId: string, studentUserId: string): Promise<StudentSessionDetail> {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: true },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    // Lazy expiry check
    if (
      session.status === 'IN_PROGRESS' &&
      session.expiresAt &&
      session.expiresAt <= this.clock.now()
    ) {
      await this.expireSession(sessionId);
      session.status = SessionStatus.EXPIRED;
      session.activeStudentKey = null;
    }

    const snapshot = session.settingsSnapshot as any;

    return {
      id: session.id,
      examId: session.examId,
      examTitle: session.exam.title,
      status: session.status,
      startedAt: session.startedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt?.toISOString() ?? null,
      serverNow: this.clock.now().toISOString(),
      settings: {
        intervalMs: Number(snapshot?.intervalMs) || 1500,
      },
    };
  }

  async getQuestions(sessionId: string, studentUserId: string): Promise<StudentSessionQuestion[]> {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
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
          },
        },
        answers: true,
      },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    // Lazy expiry check
    if (
      session.status === 'IN_PROGRESS' &&
      session.expiresAt &&
      session.expiresAt <= this.clock.now()
    ) {
      await this.expireSession(sessionId);
      throw new AppError('SESSION_EXPIRED', 409, 'Exam session has expired');
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new AppError(
        'SESSION_NOT_ACTIVE',
        403,
        `Questions are only available while the exam is IN_PROGRESS (current: ${session.status})`
      );
    }

    const answerMap = new Map<string, string | null>();
    for (const a of session.answers) {
      answerMap.set(a.questionId, a.optionId);
    }

    let questions = session.exam.questions;
    if (session.exam.shuffleQuestions) {
      questions = stableShuffle(questions, session.id);
    }

    // Return questions and options strictly concealing `isCorrect`
    return questions.map((q, idx) => ({
      id: q.id,
      text: q.prompt,
      points: q.points,
      orderIndex: idx + 1,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.label,
      })),
      selectedOptionId: answerMap.get(q.id) ?? null,
    }));
  }

  async answerQuestion(
    sessionId: string,
    questionId: string,
    optionId: string,
    studentUserId: string
  ) {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: true },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    const now = this.clock.now();

    // Lazy expiry check
    if (
      session.status === 'IN_PROGRESS' &&
      session.expiresAt &&
      session.expiresAt <= now
    ) {
      await this.expireSession(sessionId);
      throw new AppError('SESSION_EXPIRED', 409, 'Cannot submit answer: session has expired');
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new AppError(
        'SESSION_NOT_ACTIVE',
        403,
        `Cannot submit answer: session is in status ${session.status}`
      );
    }

    // Validate question & option
    const option = await prisma.examQuestionOption.findFirst({
      where: {
        id: optionId,
        questionId,
        question: {
          examId: session.examId,
          deletedAt: null,
        },
      },
    });

    if (!option) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid question or option ID for this exam');
    }

    const answer = await prisma.examAnswer.upsert({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId,
        },
      },
      create: {
        sessionId,
        questionId,
        optionId,
        answeredAt: now,
      },
      update: {
        optionId,
        answeredAt: now,
      },
    });

    return {
      success: true,
      questionId: answer.questionId,
      optionId: answer.optionId,
      answeredAt: answer.answeredAt.toISOString(),
    };
  }

  async startSession(sessionId: string, studentUserId: string) {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: true },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    // Idempotent if already IN_PROGRESS
    if (session.status === SessionStatus.IN_PROGRESS) {
      return {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt?.toISOString() ?? null,
        expiresAt: session.expiresAt?.toISOString() ?? null,
        serverNow: this.clock.now().toISOString(),
      };
    }

    if (session.status !== SessionStatus.PENDING_VERIFICATION) {
      throw new AppError(
        'SESSION_NOT_ACTIVE',
        409,
        `Cannot start session in status ${session.status}`
      );
    }

    const snapshot = session.settingsSnapshot as any;
    const requiredMatches = Number(snapshot?.preExamRequiredMatches) || 2;

    if (session.preExamConsecutiveMatches < requiredMatches) {
      throw new AppError(
        'VERIFICATION_REQUIRED',
        403,
        'Pre-examination face verification required before starting exam'
      );
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + session.exam.durationMinutes * 60 * 1000);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.examSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.IN_PROGRESS,
          startedAt: now,
          expiresAt,
          preVerifiedAt: now,
          lastSeenAt: now,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: studentUserId,
          actorRole: 'STUDENT',
          action: 'SESSION_STARTED',
          entityType: 'ExamSession',
          entityId: sessionId,
          before: { status: session.status },
          after: {
            status: SessionStatus.IN_PROGRESS,
            startedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        startedAt: updated.startedAt?.toISOString() ?? null,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        serverNow: now.toISOString(),
      };
    });
  }

  async submitSession(sessionId: string, studentUserId: string) {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
          include: {
            questions: {
              where: { deletedAt: null },
              include: { options: true },
            },
          },
        },
        answers: true,
      },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    if (session.status === SessionStatus.SUBMITTED) {
      return {
        id: session.id,
        status: session.status,
        submittedAt: session.submittedAt?.toISOString() ?? null,
        score: session.exam.showScoreAfterSubmit ? session.score : null,
      };
    }

    const now = this.clock.now();

    // If expired, perform expiry auto-submit
    if (session.expiresAt && session.expiresAt <= now) {
      return this.expireSession(sessionId);
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new AppError(
        'SESSION_NOT_ACTIVE',
        409,
        `Cannot submit session in status ${session.status}`
      );
    }

    // Compute score
    const scoringQuestions = session.exam.questions.map((q) => {
      const correctOpt = q.options.find((o) => o.isCorrect);
      return {
        id: q.id,
        points: q.points,
        correctOptionId: correctOpt?.id ?? null,
      };
    });

    const scoringAnswers = session.answers.map((a) => ({
      questionId: a.questionId,
      optionId: a.optionId,
    }));

    const scoreResult = computeExamScore(scoringQuestions, scoringAnswers);

    return prisma.$transaction(async (tx) => {
      // Clear active_dedupe_key on ongoing incidents so they remain reviewable without recovery
      await tx.securityTrigger.updateMany({
        where: {
          sessionId,
          activeDedupeKey: { not: null },
        },
        data: {
          activeDedupeKey: null,
        },
      });

      const updated = await tx.examSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.SUBMITTED,
          submittedAt: now,
          score: scoreResult.score,
          maxScore: scoreResult.maxScore,
          activeStudentKey: null, // Clear key to allow future exam sessions
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: studentUserId,
          actorRole: 'STUDENT',
          action: 'SESSION_SUBMITTED',
          entityType: 'ExamSession',
          entityId: sessionId,
          before: { status: session.status },
          after: {
            status: SessionStatus.SUBMITTED,
            submittedAt: now.toISOString(),
            score: scoreResult.score,
            maxScore: scoreResult.maxScore,
          },
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
        score: session.exam.showScoreAfterSubmit ? scoreResult.score : null,
      };
    });
  }

  async expireSession(sessionId: string) {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
          include: {
            questions: {
              where: { deletedAt: null },
              include: { options: true },
            },
          },
        },
        answers: true,
      },
    });

    if (!session || session.status !== SessionStatus.IN_PROGRESS) {
      return;
    }

    const scoringQuestions = session.exam.questions.map((q) => {
      const correctOpt = q.options.find((o) => o.isCorrect);
      return {
        id: q.id,
        points: q.points,
        correctOptionId: correctOpt?.id ?? null,
      };
    });

    const scoringAnswers = session.answers.map((a) => ({
      questionId: a.questionId,
      optionId: a.optionId,
    }));

    const scoreResult = computeExamScore(scoringQuestions, scoringAnswers);
    const now = this.clock.now();

    return prisma.$transaction(async (tx) => {
      // Clear active_dedupe_key on ongoing incidents so they remain reviewable without recovery
      await tx.securityTrigger.updateMany({
        where: {
          sessionId,
          activeDedupeKey: { not: null },
        },
        data: {
          activeDedupeKey: null,
        },
      });

      const updated = await tx.examSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.EXPIRED,
          submittedAt: now,
          score: scoreResult.score,
          maxScore: scoreResult.maxScore,
          activeStudentKey: null,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: session.studentUserId,
          actorRole: 'STUDENT',
          action: 'SESSION_EXPIRED',
          entityType: 'ExamSession',
          entityId: sessionId,
          before: { status: session.status },
          after: {
            status: SessionStatus.EXPIRED,
            submittedAt: now.toISOString(),
            score: scoreResult.score,
            maxScore: scoreResult.maxScore,
          },
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
        score: session.exam.showScoreAfterSubmit ? scoreResult.score : null,
      };
    });
  }
}

export const sessionsService = new SessionsService();
