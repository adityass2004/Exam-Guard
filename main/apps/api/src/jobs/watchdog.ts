import { prisma as defaultPrisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sessionLockManager } from '../modules/verification/sessionLock.js';
import { verificationRecorder } from '../modules/verification/recorder.js';
import { verificationEventBus } from '../modules/verification/eventBus.js';
import { PrismaClient } from '@prisma/client';

export interface WatchdogClock {
  now(): Date;
}

export const systemWatchdogClock: WatchdogClock = {
  now: () => new Date(),
};

export class SessionWatchdogJob {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private clock: WatchdogClock = systemWatchdogClock,
    private intervalMs: number = 5000,
    private prisma: PrismaClient = defaultPrisma
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        logger.error({ err: err?.message }, 'Error during watchdog sweep');
      });
    }, this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, 'Session watchdog job started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Session watchdog job stopped');
    }
  }

  /**
   * Sweeps active IN_PROGRESS sessions to detect silent clients whose verification
   * ticks have stopped past the configured grace period.
   */
  async sweep(): Promise<{ checked: number; flagged: number; updated: number }> {
    if (this.isRunning) {
      return { checked: 0, flagged: 0, updated: 0 };
    }

    this.isRunning = true;
    let checkedCount = 0;
    let flaggedCount = 0;
    let updatedCount = 0;

    try {
      const now = this.clock.now();

      // Query active IN_PROGRESS sessions bounded per run
      const sessions = await this.prisma.examSession.findMany({
        where: { status: 'IN_PROGRESS' },
        take: 200,
        select: {
          id: true,
          studentUserId: true,
          examId: true,
          startedAt: true,
          lastSeenAt: true,
          settingsSnapshot: true,
        },
      });

      for (const session of sessions) {
        checkedCount++;

        // 1. Skip session if its verification lock is currently held
        if (sessionLockManager.isLocked(session.id)) {
          continue;
        }

        try {
          const snapshot = session.settingsSnapshot as Record<string, any>;
          const intervalMs = Number(snapshot?.intervalMs ?? 1500);
          const cameraGraceSeconds = Number(snapshot?.cameraGraceSeconds ?? 10);
          const startupGraceSeconds = Number(snapshot?.startupGraceSeconds ?? 15);

          // 2. Check startup grace period
          if (session.startedAt) {
            const startedAtTime = new Date(session.startedAt).getTime();
            const elapsedSinceStart = (now.getTime() - startedAtTime) / 1000;
            if (elapsedSinceStart < startupGraceSeconds) {
              continue; // Inside startup grace
            }
          }

          // 3. Check silence duration
          const lastSeenTime = session.lastSeenAt
            ? new Date(session.lastSeenAt).getTime()
            : session.startedAt
            ? new Date(session.startedAt).getTime()
            : now.getTime();

          const silentDurationMs = Math.max(0, now.getTime() - lastSeenTime);
          const timeoutThresholdMs = intervalMs * 3 + cameraGraceSeconds * 1000;

          if (silentDurationMs <= timeoutThresholdMs) {
            continue; // Session is healthy and active
          }

          // 4. Session is silent past threshold: check if incident already active
          const activeIncident = await this.prisma.securityTrigger.findFirst({
            where: {
              sessionId: session.id,
              triggerType: 'CAMERA_DISCONNECTED',
              activeDedupeKey: `${session.id}:CAMERA_DISCONNECTED`,
            },
          });

          if (!activeIncident) {
            // Case A: Open new CAMERA_DISCONNECTED incident and log exactly one row
            await verificationRecorder.record({
              sessionId: session.id,
              phase: 'CONTINUOUS',
              outcome: 'CAMERA_ERROR',
              errorCode: 'NO_SIGNAL',
              processingMs: 0,
              clientCapturedAt: null,
              frameBuffer: null,
              now,
            });
            flaggedCount++;
            logger.warn(
              { sessionId: session.id, silentDurationMs, timeoutThresholdMs },
              'Watchdog detected silent session; opened CAMERA_DISCONNECTED incident'
            );
          } else {
            // Case B: Incident already active -> only update occurrenceCount and lastDetectedAt
            const updated = await this.prisma.securityTrigger.update({
              where: { id: activeIncident.id },
              data: {
                lastDetectedAt: now,
                occurrenceCount: { increment: 1 },
              },
            });

            verificationEventBus.emitIncidentUpdated({
              sessionId: session.id,
              incidentId: updated.id,
              incidentCode: updated.incidentCode,
              triggerType: 'CAMERA_DISCONNECTED',
              occurrenceCount: updated.occurrenceCount,
              lastDetectedAt: now,
              worstSimilarityPct: updated.worstSimilarityPct,
            });
            updatedCount++;
          }
        } catch (err: any) {
          logger.error(
            { sessionId: session.id, err: err?.message },
            'Watchdog error checking session'
          );
        }
      }
    } finally {
      this.isRunning = false;
    }

    return {
      checked: checkedCount,
      flagged: flaggedCount,
      updated: updatedCount,
    };
  }
}

export const sessionWatchdogJob = new SessionWatchdogJob();
