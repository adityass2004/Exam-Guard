import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { verificationEventBus } from '../verification/eventBus.js';

export class SessionCancelService {
  async cancelSession(
    sessionId: string,
    adminUserId: string,
    reason: string
  ): Promise<{ id: string; status: string; cancelledAt: string }> {
    if (!reason || reason.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 400, 'A cancellation reason is required');
    }

    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.status !== 'IN_PROGRESS' && session.status !== 'PENDING_VERIFICATION') {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        `Cannot cancel session in terminal status ${session.status}`
      );
    }

    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      // Clear ongoing incident active_dedupe_keys
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
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: adminUserId,
          activeStudentKey: null, // Allow student to register for other exams
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: 'ADMIN',
          action: 'SESSION_CANCELLED',
          entityType: 'EXAM_SESSION',
          entityId: sessionId,
          before: { status: session.status },
          after: {
            status: 'CANCELLED',
            cancelledAt: now.toISOString(),
            cancelledBy: adminUserId,
            reason: reason.trim(),
          },
        },
      });

      verificationEventBus.emit('session.ended', {
        sessionId,
        studentUserId: session.studentUserId,
        examId: session.examId,
        status: 'CANCELLED',
        endedAt: now.toISOString(),
        reason: reason.trim(),
      });

      return {
        id: updated.id,
        status: updated.status,
        cancelledAt: now.toISOString(),
      };
    });
  }
}

export const sessionCancelService = new SessionCancelService();
