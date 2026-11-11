import { WebSocket } from 'ws';
import { logger } from '../lib/logger.js';
import { verificationEventBus } from '../modules/verification/eventBus.js';
import {
  WsEnvelope,
  WsIncidentOpenedPayload,
  WsIncidentUpdatedPayload,
  WsIncidentRecoveredPayload,
  WsIncidentStatusChangedPayload,
  WsSessionStartedPayload,
  WsSessionUpdatedPayload,
  WsSessionEndedPayload,
  WsServiceHealthPayload,
  WsSystemWarningPayload,
} from '@examguard/shared';
import { createWsEnvelope, safeSendJson } from './protocol.js';
import { SessionEventCoalescer } from './coalesce.js';
import { prisma } from '../lib/prisma.js';

export interface AdminClient {
  ws: WebSocket;
  adminUserId: string;
  sessionToken: string;
  isAlive: boolean;
  subscriptions: Set<string>;
  coalescer: SessionEventCoalescer;
}

export class WebSocketBridge {
  private clients: Set<AdminClient> = new Set();
  private isSubscribedToEventBus = false;

  constructor() {
    this.setupEventBusListeners();
  }

  addClient(adminClient: AdminClient): void {
    this.clients.add(adminClient);
    logger.debug(
      { adminUserId: adminClient.adminUserId, totalClients: this.clients.size },
      'Admin client connected to WebSocket bridge'
    );
  }

  removeClient(adminClient: AdminClient): void {
    adminClient.coalescer.destroy();
    this.clients.delete(adminClient);
    logger.debug(
      { adminUserId: adminClient.adminUserId, totalClients: this.clients.size },
      'Admin client removed from WebSocket bridge'
    );
  }

  getClientsCount(): number {
    return this.clients.size;
  }

  getClients(): AdminClient[] {
    return Array.from(this.clients);
  }

  broadcastToChannel(channel: string, envelope: WsEnvelope): void {
    for (const client of this.clients) {
      if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        safeSendJson(client.ws, envelope);
      }
    }
  }

  private setupEventBusListeners(): void {
    if (this.isSubscribedToEventBus) return;
    this.isSubscribedToEventBus = true;

    // 1. incident.opened
    verificationEventBus.on('incident.opened', async (data) => {
      try {
        let studentName: string | undefined;
        let examTitle: string | undefined;

        // Fetch display names for monitoring table/alerts
        const session = await prisma.examSession.findUnique({
          where: { id: data.sessionId },
          select: {
            studentUser: { select: { fullName: true } },
            exam: { select: { title: true } },
          },
        });

        studentName = session?.studentUser?.fullName;
        examTitle = session?.exam?.title;

        const payload: WsIncidentOpenedPayload = {
          sessionId: data.sessionId,
          studentUserId: data.studentUserId,
          studentName,
          examId: data.examId,
          examTitle,
          incidentId: data.incidentId,
          incidentCode: data.incidentCode,
          triggerType: data.triggerType,
          severity: data.severity,
          firstSimilarityPct: data.firstSimilarityPct,
          timestamp: new Date(data.timestamp).toISOString(),
        };

        this.broadcastToChannel('monitoring', createWsEnvelope('incident.opened', payload));
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Error broadcasting incident.opened event');
      }
    });

    // 2. incident.updated
    verificationEventBus.on('incident.updated', (data) => {
      const payload: WsIncidentUpdatedPayload = {
        sessionId: data.sessionId,
        incidentId: data.incidentId,
        incidentCode: data.incidentCode,
        triggerType: data.triggerType,
        occurrenceCount: data.occurrenceCount,
        lastDetectedAt: new Date(data.lastDetectedAt).toISOString(),
        worstSimilarityPct: data.worstSimilarityPct,
      };

      this.broadcastToChannel('monitoring', createWsEnvelope('incident.updated', payload));
    });

    // 3. incident.recovered
    verificationEventBus.on('incident.recovered', (data) => {
      const payload: WsIncidentRecoveredPayload = {
        sessionId: data.sessionId,
        incidentId: data.incidentId,
        incidentCode: data.incidentCode,
        triggerType: data.triggerType,
        recoveredAt: new Date(data.recoveredAt).toISOString(),
      };

      this.broadcastToChannel('monitoring', createWsEnvelope('incident.recovered', payload));
    });

    // 4. incident.status_changed
    verificationEventBus.on('incident.status_changed', (data: WsIncidentStatusChangedPayload) => {
      this.broadcastToChannel('monitoring', createWsEnvelope('incident.status_changed', data));
    });

    // 5. session.updated (coalesced per client connection to max 1/s)
    verificationEventBus.on('session.updated', (data) => {
      const payload: WsSessionUpdatedPayload = {
        sessionId: data.sessionId,
        studentUserId: data.studentUserId,
        examId: data.examId,
        totalAttempts: data.totalAttempts,
        matchCount: data.matchCount,
        mismatchCount: data.mismatchCount,
        lastOutcome: data.lastOutcome,
        lastSimilarityPct: data.lastSimilarityPct,
        lastSeenAt: new Date(data.lastSeenAt).toISOString(),
      };

      for (const client of this.clients) {
        if (client.subscriptions.has('monitoring') && client.ws.readyState === WebSocket.OPEN) {
          client.coalescer.enqueueSessionUpdated(payload);
        }
      }
    });

    // 6. session.started
    verificationEventBus.on('session.started', (data: WsSessionStartedPayload) => {
      this.broadcastToChannel('monitoring', createWsEnvelope('session.started', data));
    });

    // 7. session.ended
    verificationEventBus.on('session.ended', (data: WsSessionEndedPayload) => {
      this.broadcastToChannel('monitoring', createWsEnvelope('session.ended', data));
    });

    // 8. service.health
    verificationEventBus.on('service.health', (data: WsServiceHealthPayload) => {
      this.broadcastToChannel('monitoring', createWsEnvelope('service.health', data));
    });

    // 9. system.warning
    verificationEventBus.on('system.warning', (data: WsSystemWarningPayload) => {
      this.broadcastToChannel('monitoring', createWsEnvelope('system.warning', data));
    });
  }
}

export const webSocketBridge = new WebSocketBridge();
