import { ClientEventDto } from '@examguard/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { withSessionLock } from './sessionLock.js';
import { verificationRecorder } from './recorder.js';
import { verificationEventBus } from './eventBus.js';

class ClientEventsService {
  // In-memory throttling map: key -> timestamp of last accepted event
  private lastEventMap = new Map<string, number>();

  async recordClientEvent(
    sessionId: string,
    studentUserId: string,
    dto: ClientEventDto
  ): Promise<{ success: boolean; logged: boolean }> {
    const throttleKey = `${sessionId}:${dto.errorCode}`;
    const now = Date.now();
    const lastTimestamp = this.lastEventMap.get(throttleKey) || 0;

    // Throttle duplicate events within 1 second
    if (now - lastTimestamp < 1000) {
      return { success: true, logged: false };
    }
    this.lastEventMap.set(throttleKey, now);

    return await withSessionLock(sessionId, async () => {
      const session = await prisma.examSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new AppError('NOT_FOUND', 404, 'Exam session not found');
      }

      if (session.studentUserId !== studentUserId) {
        throw new AppError('FORBIDDEN', 403, 'Unauthorized access to session');
      }

      if (session.status !== 'IN_PROGRESS') {
        throw new AppError(
          'SESSION_NOT_ACTIVE',
          400,
          `Session is not in progress (current status: ${session.status})`
        );
      }

      // Record CAMERA_ERROR in verification logs & increment cameraErrorCount
      const result = await verificationRecorder.record({
        sessionId,
        phase: 'CONTINUOUS',
        outcome: 'CAMERA_ERROR',
        errorCode: dto.errorCode,
        processingMs: 0,
        clientCapturedAt: new Date(),
      });

      verificationEventBus.emitClientEventRecorded({
        sessionId,
        studentUserId,
        examId: session.examId,
        logId: result.logId,
        sequenceNo: result.sequenceNo,
        eventType: dto.type,
        errorCode: dto.errorCode,
        timestamp: new Date(),
      });

      return { success: true, logged: true };
    });
  }

  clearThrottle(): void {
    this.lastEventMap.clear();
  }
}

export const clientEventsService = new ClientEventsService();

