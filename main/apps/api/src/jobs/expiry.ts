import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { computeExamScore } from '../modules/sessions/scoring.js';
import { Clock, systemClock } from '../modules/sessions/sessions.service.js';
import { SessionStatus } from '@prisma/client';

export class SessionExpiryJob {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly intervalMs: number;
  private readonly abandonedHours: number;
  private clock: Clock;

  constructor(options?: {
    intervalMs?: number;
    abandonedHours?: number;
    clock?: Clock;
  }) {
    this.intervalMs = options?.intervalMs ?? 10_000; // 10s default
    this.abandonedHours = options?.abandonedHours ?? 2; // 2h default
    this.clock = options?.clock ?? systemClock;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        logger.error({ err }, 'SessionExpiryJob error');
      });
    }, this.intervalMs);
    // Do not keep Node process alive just for the expiry interval in tests
    if (this.timer.unref) {
      this.timer.unref();
    }
    logger.info({ intervalMs: this.intervalMs }, 'SessionExpiryJob started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('SessionExpiryJob stopped');
    }
  }

  async runOnce(): Promise<{ expiredCount: number; cancelledCount: number }> {
    if (this.isRunning) return { expiredCount: 0, cancelledCount: 0 };
    this.isRunning = true;

    try {
      const now = this.clock.now();

      // 1. Find overdue IN_PROGRESS sessions
      const overdueSessions = await prisma.examSession.findMany({
        where: {
          status: SessionStatus.IN_PROGRESS,
          expiresAt: { lte: now },
        },
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

      let expiredCount = 0;
      for (const session of overdueSessions) {
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

        await prisma.$transaction(async (tx) => {
          await tx.examSession.update({
            where: { id: session.id },
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
              entityId: session.id,
              before: { status: session.status },
              after: {
                status: SessionStatus.EXPIRED,
                submittedAt: now.toISOString(),
                score: scoreResult.score,
                maxScore: scoreResult.maxScore,
              },
            },
          });
        });

        expiredCount++;
      }

      // 2. Find abandoned PENDING_VERIFICATION sessions (> abandonedHours old)
      const abandonedCutoff = new Date(now.getTime() - this.abandonedHours * 60 * 60 * 1000);
      const abandonedSessions = await prisma.examSession.findMany({
        where: {
          status: SessionStatus.PENDING_VERIFICATION,
          createdAt: { lte: abandonedCutoff },
        },
      });

      let cancelledCount = 0;
      for (const session of abandonedSessions) {
        await prisma.$transaction(async (tx) => {
          await tx.examSession.update({
            where: { id: session.id },
            data: {
              status: SessionStatus.CANCELLED,
              cancelledAt: now,
              activeStudentKey: null,
            },
          });

          await tx.adminAuditLog.create({
            data: {
              actorUserId: session.studentUserId,
              actorRole: 'STUDENT',
              action: 'SESSION_CANCELLED',
              entityType: 'ExamSession',
              entityId: session.id,
              before: { status: session.status },
              after: {
                status: SessionStatus.CANCELLED,
                reason: 'AUTO_CANCELLED_ABANDONED',
              },
            },
          });
        });

        cancelledCount++;
      }

      if (expiredCount > 0 || cancelledCount > 0) {
        logger.info({ expiredCount, cancelledCount }, 'SessionExpiryJob completed run');
      }

      return { expiredCount, cancelledCount };
    } finally {
      this.isRunning = false;
    }
  }
}

export const sessionExpiryJob = new SessionExpiryJob();

