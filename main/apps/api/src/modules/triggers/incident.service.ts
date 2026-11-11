import { Prisma } from '@prisma/client';
import { Severity, TriggerType, VerificationOutcome, VerificationPhase } from '@examguard/shared';
import { logger } from '../../lib/logger.js';
import { evaluateTriggers } from './evaluateTriggers.js';
import { generateIncidentCode } from './incidentCode.js';
import { evidenceWriter, StoredImageRecord } from './evidence.writer.js';
import { recoverActiveIncidents } from './recovery.js';
import { verificationEventBus } from '../verification/eventBus.js';
import { SessionCounters } from './triggers.types.js';

export interface ProcessIncidentsInput {
  tx: Prisma.TransactionClient;
  sessionId: string;
  studentUserId: string;
  examId: string;
  logId: bigint;
  sequenceNo: number;
  outcome: VerificationOutcome;
  errorCode: string;
  similarityPct: number | null;
  phase: VerificationPhase;
  frameBuffer?: Buffer | null;
  snapshot: Record<string, any>;
  sessionStartedAt?: Date | null;
  now?: Date;
  onEvidenceCreated?: (record: StoredImageRecord) => void;
}

export interface PostCommitEvent {
  kind: 'OPENED' | 'UPDATED' | 'RECOVERED';
  data: any;
}

export interface ProcessIncidentsResult {
  nextCounters: SessionCounters;
  touchTriggerId?: string;
  postCommitEvents: PostCommitEvent[];
}

export class IncidentService {
  /**
   * Processes trigger evaluation, incident lifecycle (OPEN, UPDATE, RECOVER),
   * evidence persistence, and deduplication within the single verification transaction.
   */
  async processVerificationAttempt(
    input: ProcessIncidentsInput
  ): Promise<ProcessIncidentsResult> {
    const {
      tx,
      sessionId,
      studentUserId,
      examId,
      logId,
      outcome,
      errorCode,
      similarityPct,
      phase,
      frameBuffer,
      snapshot,
      sessionStartedAt,
      now = new Date(),
      onEvidenceCreated,
    } = input;

    // 1. Fetch current session state to get latest counters
    const session = await tx.examSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const prevCounters: SessionCounters = {
      consecutiveMatch: session.consecutiveMatch,
      consecutiveMismatch: session.consecutiveMismatch,
      consecutiveNoFace: session.consecutiveNoFace,
      consecutiveMultiFace: session.consecutiveMultiFace,
      consecutiveServiceError: session.consecutiveServiceError,
      consecutiveNonMatch: session.consecutiveNonMatch,
      cameraErrorSince: session.cameraErrorSince,
    };

    // 2. Query currently active incidents for this session
    const activeIncidents = await tx.securityTrigger.findMany({
      where: {
        sessionId,
        activeDedupeKey: { not: null },
      },
    });

    const activeMap = new Map<TriggerType, (typeof activeIncidents)[0]>();
    for (const inc of activeIncidents) {
      activeMap.set(inc.triggerType as TriggerType, inc);
    }

    // 3. Evaluate pure trigger rules
    const evaluation = evaluateTriggers({
      prevState: prevCounters,
      attempt: {
        phase,
        outcome,
        errorCode,
        similarityPct,
        frameBuffer,
      },
      snapshot,
      now,
      startedAt: sessionStartedAt ?? session.startedAt,
      activeIncidents: Array.from(activeMap.keys()),
    });

    const postCommitEvents: PostCommitEvent[] = [];

    // 4. Handle recovery if recovery condition met
    if (evaluation.shouldRecover && activeIncidents.length > 0) {
      const recovered = await recoverActiveIncidents(tx, sessionId, now);
      for (const rec of recovered) {
        postCommitEvents.push({
          kind: 'RECOVERED',
          data: {
            sessionId,
            incidentId: rec.id,
            incidentCode: rec.incidentCode,
            triggerType: rec.triggerType as TriggerType,
            recoveredAt: now,
          },
        });
      }
    }

    // 5. Process trigger actions (OPEN / UPDATE)
    let touchTriggerId: string | undefined = undefined;

    for (const act of evaluation.actions) {
      if (act.action === 'OPEN') {
        const dedupeKey = `${sessionId}:${act.type}`;
        const incidentCode = generateIncidentCode(now);

        // Capture evidence frame strictly for OPEN action
        let writeResult = { status: 'NOT_AVAILABLE' } as any;
        if (act.type !== 'CAMERA_DISCONNECTED' && frameBuffer && frameBuffer.length > 0) {
          writeResult = await evidenceWriter.writeEvidence(frameBuffer);
          if (writeResult.record && onEvidenceCreated) {
            onEvidenceCreated(writeResult.record);
          }
        }

        try {
          const created = await tx.securityTrigger.create({
            data: {
              incidentCode,
              sessionId,
              studentUserId,
              examId,
              triggerType: act.type,
              severity: act.severity,
              status: 'OPEN',
              activeDedupeKey: dedupeKey,
              firstDetectedAt: now,
              lastDetectedAt: now,
              occurrenceCount: 1,
              firstSimilarityPct: act.similarityPct ?? null,
              worstSimilarityPct: act.similarityPct ?? null,
              firstVerificationLogId: logId,
              lastVerificationLogId: logId,
              evidenceStatus: writeResult.status,
              evidenceFailureReason: writeResult.failureReason ?? null,
            },
          });

          // Insert TriggerEvidence row if an encrypted file was created
          if (writeResult.status === 'CAPTURED' && writeResult.record) {
            await tx.triggerEvidence.create({
              data: {
                triggerId: created.id,
                verificationLogId: logId,
                storagePath: writeResult.record.relativePath,
                sha256: writeResult.record.sha256,
                mime: writeResult.record.mime,
                byteSize: writeResult.record.byteSize,
                width: writeResult.record.width,
                height: writeResult.record.height,
                encIv: writeResult.record.iv,
                encTag: writeResult.record.tag,
                encKeyVersion: writeResult.record.keyVersion,
                capturedAt: now,
              },
            });
          }

          // System audit log for incident opening
          await tx.adminAuditLog.create({
            data: {
              actorRole: 'ADMIN',
              action: 'INCIDENT_OPENED',
              entityType: 'SECURITY_TRIGGER',
              entityId: created.id,
              after: {
                incidentCode: created.incidentCode,
                triggerType: created.triggerType,
                severity: created.severity,
                evidenceStatus: created.evidenceStatus,
              },
            },
          });

          if (writeResult.status === 'FAILED') {
            await tx.adminAuditLog.create({
              data: {
                actorRole: 'ADMIN',
                action: 'EVIDENCE_CAPTURE_FAILED',
                entityType: 'SECURITY_TRIGGER',
                entityId: created.id,
                after: {
                  failureReason: writeResult.failureReason,
                },
              },
            });
          }

          postCommitEvents.push({
            kind: 'OPENED',
            data: {
              sessionId,
              studentUserId,
              examId,
              incidentId: created.id,
              incidentCode: created.incidentCode,
              triggerType: created.triggerType as TriggerType,
              severity: created.severity as Severity,
              timestamp: now,
            },
          });

          if (!touchTriggerId || act.type !== 'REPEATED_VERIFICATION_FAILURE') {
            touchTriggerId = created.id;
          }
        } catch (err: any) {
          // Unique violation on activeDedupeKey (P2002) - concurrent insert race safety
          if (err?.code === 'P2002') {
            logger.info(
              { dedupeKey },
              'Concurrent incident insert encountered P2002; rolling back file and updating existing incident'
            );
            if (writeResult.record) {
              await evidenceWriter.rollbackEvidence(writeResult.record);
            }

            // Fallback to UPDATE on existing incident
            const existing = await tx.securityTrigger.findUnique({
              where: { activeDedupeKey: dedupeKey },
            });

            if (existing) {
              const worst =
                similarityPct !== null && similarityPct !== undefined
                  ? Math.min(existing.worstSimilarityPct ?? similarityPct, similarityPct)
                  : existing.worstSimilarityPct;

              await tx.securityTrigger.update({
                where: { id: existing.id },
                data: {
                  lastDetectedAt: now,
                  occurrenceCount: { increment: 1 },
                  lastVerificationLogId: logId,
                  worstSimilarityPct: worst,
                },
              });

              postCommitEvents.push({
                kind: 'UPDATED',
                data: {
                  sessionId,
                  incidentId: existing.id,
                  incidentCode: existing.incidentCode,
                  triggerType: existing.triggerType as TriggerType,
                  occurrenceCount: existing.occurrenceCount + 1,
                  lastDetectedAt: now,
                  worstSimilarityPct: worst,
                },
              });

              if (!touchTriggerId || act.type !== 'REPEATED_VERIFICATION_FAILURE') {
                touchTriggerId = existing.id;
              }
            }
          } else {
            // Re-throw other errors after rolling back evidence file
            if (writeResult.record) {
              await evidenceWriter.rollbackEvidence(writeResult.record);
            }
            throw err;
          }
        }
      } else if (act.action === 'UPDATE') {
        const existing = activeMap.get(act.type);
        if (existing) {
          const worst =
            similarityPct !== null && similarityPct !== undefined
              ? Math.min(existing.worstSimilarityPct ?? similarityPct, similarityPct)
              : existing.worstSimilarityPct;

          const updated = await tx.securityTrigger.update({
            where: { id: existing.id },
            data: {
              lastDetectedAt: now,
              occurrenceCount: { increment: 1 },
              lastVerificationLogId: logId,
              worstSimilarityPct: worst,
            },
          });

          postCommitEvents.push({
            kind: 'UPDATED',
            data: {
              sessionId,
              incidentId: updated.id,
              incidentCode: updated.incidentCode,
              triggerType: updated.triggerType as TriggerType,
              occurrenceCount: updated.occurrenceCount,
              lastDetectedAt: now,
              worstSimilarityPct: worst,
            },
          });

          if (!touchTriggerId || act.type !== 'REPEATED_VERIFICATION_FAILURE') {
            touchTriggerId = existing.id;
          }
        }
      }
    }

    // 6. Associate verification_log with touched incident (if any)
    if (touchTriggerId) {
      await tx.verificationLog.update({
        where: { id: logId },
        data: { triggerId: touchTriggerId },
      });
    }

    return {
      nextCounters: evaluation.nextCounters,
      touchTriggerId,
      postCommitEvents,
    };
  }

  /**
   * Dispatches events on the in-process verificationEventBus after the database
   * transaction has committed successfully.
   */
  dispatchPostCommitEvents(events: PostCommitEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'OPENED') {
        verificationEventBus.emitIncidentOpened(ev.data);
      } else if (ev.kind === 'UPDATED') {
        verificationEventBus.emitIncidentUpdated(ev.data);
      } else if (ev.kind === 'RECOVERED') {
        verificationEventBus.emitIncidentRecovered(ev.data);
      }
    }
  }
}

export const incidentService = new IncidentService();
