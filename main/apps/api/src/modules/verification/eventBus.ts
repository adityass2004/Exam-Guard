import { EventEmitter } from 'node:events';
import { logger } from '../../lib/logger.js';
import { Severity, TriggerType } from '@examguard/shared';

export interface VerificationRecordedEvent {
  sessionId: string;
  studentUserId: string;
  examId: string;
  logId: string;
  sequenceNo: number;
  outcome: string;
  similarityPct: number | null;
  phase: string;
  timestamp: Date;
}

export interface ClientEventRecordedEvent {
  sessionId: string;
  studentUserId: string;
  examId: string;
  logId: string;
  sequenceNo: number;
  eventType: string;
  errorCode: string;
  timestamp: Date;
}

export interface IncidentOpenedEvent {
  sessionId: string;
  studentUserId: string;
  examId: string;
  incidentId: string;
  incidentCode: string;
  triggerType: TriggerType;
  severity: Severity;
  firstSimilarityPct?: number | null;
  timestamp: Date;
}

export interface IncidentUpdatedEvent {
  sessionId: string;
  incidentId: string;
  incidentCode: string;
  triggerType: TriggerType;
  occurrenceCount: number;
  lastDetectedAt: Date;
  worstSimilarityPct: number | null;
}

export interface IncidentRecoveredEvent {
  sessionId: string;
  incidentId: string;
  incidentCode: string;
  triggerType: TriggerType;
  recoveredAt: Date;
}

export interface SessionUpdatedEvent {
  sessionId: string;
  studentUserId: string;
  examId: string;
  totalAttempts: number;
  matchCount: number;
  mismatchCount: number;
  lastOutcome?: string | null;
  lastSimilarityPct?: number | null;
  lastSeenAt: Date;
}

export interface SystemWarningEvent {
  message: string;
  code: string;
  details?: Record<string, any>;
  timestamp: Date;
}

class VerificationEventBus extends EventEmitter {
  emitVerificationRecorded(event: VerificationRecordedEvent): void {
    logger.debug({ event }, 'verification.recorded event emitted');
    this.emit('verification.recorded', event);
  }

  emitClientEventRecorded(event: ClientEventRecordedEvent): void {
    logger.debug({ event }, 'clientEvent.recorded event emitted');
    this.emit('clientEvent.recorded', event);
  }

  emitIncidentOpened(event: IncidentOpenedEvent): void {
    logger.info({ event }, 'incident.opened event emitted');
    this.emit('incident.opened', event);
  }

  emitIncidentUpdated(event: IncidentUpdatedEvent): void {
    logger.debug({ event }, 'incident.updated event emitted');
    this.emit('incident.updated', event);
  }

  emitIncidentRecovered(event: IncidentRecoveredEvent): void {
    logger.info({ event }, 'incident.recovered event emitted');
    this.emit('incident.recovered', event);
  }

  emitSessionUpdated(event: SessionUpdatedEvent): void {
    logger.debug({ event }, 'session.updated event emitted');
    this.emit('session.updated', event);
  }

  emitSystemWarning(event: SystemWarningEvent): void {
    logger.warn({ event }, 'system.warning event emitted');
    this.emit('system.warning', event);
  }
}

export const verificationEventBus = new VerificationEventBus();
