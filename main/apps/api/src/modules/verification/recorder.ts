import { Prisma, VerificationOutcome, VerificationPhase } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { verificationEventBus } from './eventBus.js';
import { incidentService, PostCommitEvent } from '../triggers/incident.service.js';
import { evidenceWriter, StoredImageRecord } from '../triggers/evidence.writer.js';

export interface RecordAttemptInput {
  sessionId: string;
  phase: VerificationPhase;
  outcome: VerificationOutcome;
  errorCode?: string;
  similarityRaw?: number | null;
  similarityPct?: number | null;
  faceCount?: number | null;
  quality?: Record<string, any> | null;
  visionMs?: number | null;
  processingMs: number;
  clientCapturedAt?: Date | null;
  frameBuffer?: Buffer | null;
  now?: Date;
}

export interface AfterRecordContext {
  sessionId: string;
  logId: string;
  sequenceNo: number;
  outcome: VerificationOutcome;
  errorCode: string;
  similarityPct: number | null;
  phase: VerificationPhase;
  settingsSnapshot: any;
  triggerId?: string;
}

export class VerificationRecorder {
  /**
   * Extensible hook point for Prompt 07/08.
   * Runs within the same database transaction right after inserting the log row,
   * evaluating triggers, and updating session counters.
   */
  async afterRecord(
    _tx: Prisma.TransactionClient,
    _ctx: AfterRecordContext
  ): Promise<void> {
    // Hook called inside transaction
  }

  async record(input: RecordAttemptInput): Promise<{
    logId: string;
    sequenceNo: number;
    preExamConsecutiveMatches?: number;
    triggerId?: string;
  }> {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      const writtenEvidence: StoredImageRecord[] = [];

      try {
        const result = await this.executeTransaction(input, writtenEvidence);

        // Transaction succeeded - dispatch post-commit events
        if (result.postCommitEvents?.length) {
          incidentService.dispatchPostCommitEvents(result.postCommitEvents);
        }

        verificationEventBus.emitVerificationRecorded({
          sessionId: input.sessionId,
          studentUserId: result.studentUserId,
          examId: result.examId,
          logId: result.logId,
          sequenceNo: result.sequenceNo,
          outcome: input.outcome,
          similarityPct: input.similarityPct ?? null,
          phase: input.phase,
          timestamp: new Date(),
        });

        verificationEventBus.emitSessionUpdated({
          sessionId: input.sessionId,
          studentUserId: result.studentUserId,
          examId: result.examId,
          totalAttempts: result.totalAttempts,
          matchCount: result.matchCount,
          mismatchCount: result.mismatchCount,
          lastOutcome: input.outcome,
          lastSimilarityPct: input.similarityPct ?? null,
          lastSeenAt: result.lastSeenAt,
        });

        return {
          logId: result.logId,
          sequenceNo: result.sequenceNo,
          preExamConsecutiveMatches: result.preExamConsecutiveMatches,
          triggerId: result.triggerId,
        };
      } catch (err: any) {
        // Rollback any evidence images written during this failed attempt
        for (const record of writtenEvidence) {
          await evidenceWriter.rollbackEvidence(record);
        }

        const isDeadlock =
          err?.code === 'P2034' ||
          err?.message?.includes('Deadlock') ||
          err?.code === 'ER_LOCK_DEADLOCK';

        if (isDeadlock && attempts < maxAttempts) {
          logger.warn(
            { sessionId: input.sessionId, attempt: attempts },
            'Deadlock detected during verification recording; retrying transaction'
          );
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        throw err;
      }
    }

    throw new Error('Verification recording failed after retries');
  }

  private async executeTransaction(
    input: RecordAttemptInput,
    writtenEvidence: StoredImageRecord[]
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current session and lock the row for update
      const session = await tx.examSession.findUniqueOrThrow({
        where: { id: input.sessionId },
      });

      const sequenceNo = session.nextSequenceNo;
      const settingsSnapshot = session.settingsSnapshot as Record<string, any>;
      const thresholdPct =
        settingsSnapshot?.thresholdPct ??
        settingsSnapshot?.matchThresholdPct ??
        75.0;

      const errorCode = input.errorCode || 'NONE';

      // 2. Prepare quality JSON with numbers and booleans only
      let safeQuality: Prisma.InputJsonValue | undefined = undefined;
      if (input.quality) {
        safeQuality = {
          blur: Number(input.quality.blur ?? 0),
          brightness: Number(input.quality.brightness ?? 0),
          faceSizeRatio: Number(input.quality.faceSizeRatio ?? 0),
          faceInFrame: Boolean(input.quality.faceInFrame),
          poseOk: Boolean(input.quality.poseOk),
        };
      }

      // 3. Create verification log row (triggerId will be linked if incident occurs)
      const log = await tx.verificationLog.create({
        data: {
          sessionId: session.id,
          studentUserId: session.studentUserId,
          examId: session.examId,
          sequenceNo,
          phase: input.phase,
          outcome: input.outcome,
          errorCode,
          similarityRaw: input.similarityRaw ?? null,
          similarityPct: input.similarityPct ?? null,
          thresholdPct,
          faceCount: input.faceCount ?? null,
          quality: safeQuality,
          visionMs: input.visionMs ?? null,
          processingMs: input.processingMs,
          clientCapturedAt: input.clientCapturedAt ?? null,
          settingsVersionId: session.settingsVersionId,
        },
      });

      // 4. Compute counter updates
      const attemptDate = input.now || new Date();
      const sessionUpdate: Prisma.ExamSessionUpdateInput = {
        nextSequenceNo: { increment: 1 },
        totalAttempts: { increment: 1 },
        lastOutcome: input.outcome,
        lastSimilarityPct: input.similarityPct ?? null,
        lastVerificationAt: attemptDate,
      };

      if (input.errorCode !== 'NO_SIGNAL') {
        sessionUpdate.lastSeenAt = attemptDate;
      }

      // Outcome specific counters
      switch (input.outcome) {
        case 'MATCH':
          sessionUpdate.matchCount = { increment: 1 };
          break;
        case 'MISMATCH':
          sessionUpdate.mismatchCount = { increment: 1 };
          break;
        case 'NO_FACE':
          sessionUpdate.noFaceCount = { increment: 1 };
          break;
        case 'MULTIPLE_FACES':
          sessionUpdate.multiFaceCount = { increment: 1 };
          break;
        case 'CAMERA_ERROR':
          sessionUpdate.cameraErrorCount = { increment: 1 };
          break;
        case 'VERIFICATION_ERROR':
          sessionUpdate.verificationErrorCount = { increment: 1 };
          break;
      }

      // Pre-exam phase specific counters
      let updatedPreExamMatches = session.preExamConsecutiveMatches;
      if (input.phase === 'PRE_EXAM') {
        sessionUpdate.preExamAttempts = { increment: 1 };
        const requiredMatches = Number(settingsSnapshot?.preExamRequiredMatches) || 2;
        if (input.outcome === 'MATCH') {
          updatedPreExamMatches += 1;
          sessionUpdate.preExamConsecutiveMatches = { increment: 1 };
        } else {
          // If the student already satisfied the required consecutive matches, keep the verified status
          // and do not reset pre-exam approval back to 0 when the student glances down at the button.
          if (session.preExamConsecutiveMatches >= requiredMatches) {
            updatedPreExamMatches = session.preExamConsecutiveMatches;
          } else {
            updatedPreExamMatches = 0;
            sessionUpdate.preExamConsecutiveMatches = 0;
          }
        }
      }

      let postCommitEvents: PostCommitEvent[] = [];
      let touchTriggerId: string | undefined = undefined;

      // 5. Evaluate Security Triggers and Incidents for CONTINUOUS phase
      if (input.phase === 'CONTINUOUS') {
        const incidentResult = await incidentService.processVerificationAttempt({
          tx,
          sessionId: session.id,
          studentUserId: session.studentUserId,
          examId: session.examId,
          logId: log.id,
          sequenceNo,
          outcome: input.outcome,
          errorCode,
          similarityPct: input.similarityPct ?? null,
          phase: input.phase,
          frameBuffer: input.frameBuffer,
          snapshot: settingsSnapshot,
          sessionStartedAt: session.startedAt,
          now: input.now || new Date(),
          onEvidenceCreated: (rec) => writtenEvidence.push(rec),
        });

        // Apply updated continuous counters from pure engine
        sessionUpdate.consecutiveMatch = incidentResult.nextCounters.consecutiveMatch;
        sessionUpdate.consecutiveMismatch = incidentResult.nextCounters.consecutiveMismatch;
        sessionUpdate.consecutiveNoFace = incidentResult.nextCounters.consecutiveNoFace;
        sessionUpdate.consecutiveMultiFace = incidentResult.nextCounters.consecutiveMultiFace;
        sessionUpdate.consecutiveServiceError = incidentResult.nextCounters.consecutiveServiceError;
        sessionUpdate.consecutiveNonMatch = incidentResult.nextCounters.consecutiveNonMatch;
        sessionUpdate.cameraErrorSince = incidentResult.nextCounters.cameraErrorSince;

        postCommitEvents = incidentResult.postCommitEvents;
        touchTriggerId = incidentResult.touchTriggerId;
      }

      const updatedSession = await tx.examSession.update({
        where: { id: session.id },
        data: sessionUpdate,
      });

      // 6. Invoke afterRecord hook
      await this.afterRecord(tx, {
        sessionId: session.id,
        logId: log.id.toString(),
        sequenceNo,
        outcome: input.outcome,
        errorCode,
        similarityPct: input.similarityPct ?? null,
        phase: input.phase,
        settingsSnapshot,
        triggerId: touchTriggerId,
      });

      return {
        logId: log.id.toString(),
        sequenceNo,
        studentUserId: session.studentUserId,
        examId: session.examId,
        preExamConsecutiveMatches: updatedPreExamMatches,
        triggerId: touchTriggerId,
        postCommitEvents,
        totalAttempts: updatedSession.totalAttempts,
        matchCount: updatedSession.matchCount,
        mismatchCount: updatedSession.mismatchCount,
        lastSeenAt: updatedSession.lastSeenAt || new Date(),
      };
    });
  }
}

export const verificationRecorder = new VerificationRecorder();
