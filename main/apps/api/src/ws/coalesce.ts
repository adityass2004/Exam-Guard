import { WebSocket } from 'ws';
import { WsSessionUpdatedPayload } from '@examguard/shared';
import { createWsEnvelope, safeSendJson } from './protocol.js';

export class SessionEventCoalescer {
  private lastSentTimeMap: Map<string, number> = new Map();
  private pendingPayloadMap: Map<string, WsSessionUpdatedPayload> = new Map();
  private timerMap: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private ws: WebSocket,
    private minIntervalMs: number = 1000
  ) {}

  enqueueSessionUpdated(payload: WsSessionUpdatedPayload): void {
    const sessionId = payload.sessionId;
    const now = Date.now();
    const lastSent = this.lastSentTimeMap.get(sessionId) ?? 0;
    const elapsed = now - lastSent;

    if (elapsed >= this.minIntervalMs && !this.timerMap.has(sessionId)) {
      // Send immediately
      this.lastSentTimeMap.set(sessionId, now);
      safeSendJson(this.ws, createWsEnvelope('session.updated', payload));
    } else {
      // Coalesce / hold latest payload
      this.pendingPayloadMap.set(sessionId, payload);

      if (!this.timerMap.has(sessionId)) {
        const remainingDelay = Math.max(50, this.minIntervalMs - elapsed);
        const timer = setTimeout(() => {
          this.flush(sessionId);
        }, remainingDelay);
        this.timerMap.set(sessionId, timer);
      }
    }
  }

  private flush(sessionId: string): void {
    this.timerMap.delete(sessionId);
    const payload = this.pendingPayloadMap.get(sessionId);
    if (!payload) return;

    this.pendingPayloadMap.delete(sessionId);
    this.lastSentTimeMap.set(sessionId, Date.now());
    safeSendJson(this.ws, createWsEnvelope('session.updated', payload));
  }

  destroy(): void {
    for (const timer of this.timerMap.values()) {
      clearTimeout(timer);
    }
    this.timerMap.clear();
    this.pendingPayloadMap.clear();
    this.lastSentTimeMap.clear();
  }
}
