import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { SessionSummary } from '@examguard/shared';

const TRIGGER_FRIENDLY_NAMES: Record<string, string> = {
  IDENTITY_MISMATCH: 'Identity discrepancy detected',
  NO_FACE: 'Face not detected in frame',
  MULTIPLE_FACES: 'Multiple faces in frame',
  CAMERA_DISCONNECTED: 'Camera signal interrupted',
  VERIFICATION_SERVICE_FAILURE: 'Verification service disruption',
  REPEATED_VERIFICATION_FAILURE: 'Consecutive verification difficulty',
};

export class SummaryService {
  async getSessionSummary(sessionId: string, studentUserId: string): Promise<SessionSummary> {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: true,
        securityTriggers: {
          select: {
            id: true,
            triggerType: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Exam session not found');
    }

    if (session.studentUserId !== studentUserId) {
      throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
    }

    const unverified =
      session.noFaceCount +
      session.multiFaceCount +
      session.cameraErrorCount +
      session.verificationErrorCount;

    const showScore = session.exam.showScoreAfterSubmit;
    const score = showScore ? session.score : null;
    const maxScore = showScore ? session.maxScore : null;
    let percentage: number | null = null;
    let passed: boolean | null = null;

    if (showScore && score != null && maxScore && maxScore > 0) {
      percentage = Math.round((score / maxScore) * 10000) / 100;
    }

    const countByType = new Map<string, number>();
    for (const t of session.securityTriggers) {
      countByType.set(t.triggerType, (countByType.get(t.triggerType) ?? 0) + 1);
    }

    const formattedTriggers = Array.from(countByType.entries()).map(([type, count]) => ({
      type,
      friendlyName: TRIGGER_FRIENDLY_NAMES[type] || 'Verification observation',
      count,
    }));

    return {
      sessionId: session.id,
      examTitle: session.exam.title,
      status: session.status,
      startedAt: session.startedAt?.toISOString() ?? null,
      submittedAt: session.submittedAt?.toISOString() ?? null,
      durationMinutes: session.exam.durationMinutes,
      totalAttempts: session.totalAttempts,
      successfulMatches: session.matchCount,
      failedMatches: session.mismatchCount,
      unverified,
      securityTriggersCount: session.securityTriggers.length,
      securityTriggers: formattedTriggers,
      score,
      maxScore,
      percentage,
      passed,
    };
  }
}

export const summaryService = new SummaryService();
