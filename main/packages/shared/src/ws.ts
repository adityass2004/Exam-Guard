import { z } from 'zod';
import { Severity, TriggerType, IncidentStatus, ReviewDisposition } from './enums.js';

export const WS_CHANNELS = ['monitoring'] as const;
export type WsChannel = (typeof WS_CHANNELS)[number];

export const WS_CLIENT_ACTIONS = ['subscribe', 'ping'] as const;
export type WsClientAction = (typeof WS_CLIENT_ACTIONS)[number];

export const clientMessageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('subscribe'),
    channel: z.enum(WS_CHANNELS),
  }),
  z.object({
    action: z.literal('ping'),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const WS_EVENT_TYPES = [
  'session.started',
  'session.updated',
  'session.ended',
  'incident.opened',
  'incident.updated',
  'incident.recovered',
  'incident.status_changed',
  'service.health',
  'system.warning',
] as const;

export type WsEventType = (typeof WS_EVENT_TYPES)[number];

export interface WsEnvelope<T = any> {
  type: WsEventType | 'pong';
  eventId: number;
  emittedAt: string;
  payload: T;
}

export interface WsSessionStartedPayload {
  sessionId: string;
  studentUserId: string;
  studentName?: string;
  examId: string;
  examTitle?: string;
  startedAt: string;
  expiresAt: string;
}

export interface WsSessionUpdatedPayload {
  sessionId: string;
  studentUserId: string;
  examId: string;
  totalAttempts: number;
  matchCount: number;
  mismatchCount: number;
  unverifiedCount?: number;
  lastOutcome?: string | null;
  lastSimilarityPct?: number | null;
  lastSeenAt: string;
  signalHealth?: 'OK' | 'STALE' | 'NO_SIGNAL';
}

export interface WsSessionEndedPayload {
  sessionId: string;
  studentUserId: string;
  examId: string;
  status: 'SUBMITTED' | 'EXPIRED' | 'CANCELLED';
  endedAt: string;
  reason?: string | null;
}

export interface WsIncidentOpenedPayload {
  sessionId: string;
  studentUserId: string;
  studentName?: string;
  examId: string;
  examTitle?: string;
  incidentId: string;
  incidentCode: string;
  triggerType: TriggerType;
  severity: Severity;
  firstSimilarityPct?: number | null;
  timestamp: string;
}

export interface WsIncidentUpdatedPayload {
  sessionId: string;
  incidentId: string;
  incidentCode: string;
  triggerType: TriggerType;
  occurrenceCount: number;
  lastDetectedAt: string;
  worstSimilarityPct?: number | null;
}

export interface WsIncidentRecoveredPayload {
  sessionId: string;
  incidentId: string;
  incidentCode: string;
  triggerType: TriggerType;
  recoveredAt: string;
}

export interface WsIncidentStatusChangedPayload {
  incidentId: string;
  incidentCode: string;
  sessionId: string;
  status: IncidentStatus;
  disposition?: ReviewDisposition | null;
  updatedBy: string;
  updatedAt: string;
}

export interface WsServiceHealthPayload {
  service: 'vision';
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  modelLoaded: boolean;
  latencyMs?: number;
  timestamp: string;
}

export interface WsSystemWarningPayload {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}
