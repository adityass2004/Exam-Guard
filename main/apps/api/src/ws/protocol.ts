import { WebSocket } from 'ws';
import { WsEnvelope, WsEventType } from '@examguard/shared';

let eventCounter = 1;

export function getNextEventId(): number {
  return eventCounter++;
}

export function resetEventIdForTesting(): void {
  eventCounter = 1;
}

export function createWsEnvelope<T>(
  type: WsEventType | 'pong',
  payload: T
): WsEnvelope<T> {
  return {
    type,
    eventId: getNextEventId(),
    emittedAt: new Date().toISOString(),
    payload,
  };
}

export function safeSendJson(ws: WebSocket, envelope: WsEnvelope): boolean {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
