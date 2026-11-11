'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, WsEnvelope } from '@examguard/shared';

export type SocketStatus = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export interface UseAdminSocketOptions {
  url?: string;
  autoConnect?: boolean;
  onEvent?: (envelope: WsEnvelope) => void;
  onReconnect?: () => void;
}

export function useAdminSocket(options: UseAdminSocketOptions = {}) {
  const {
    url,
    autoConnect = true,
    onEvent,
    onReconnect,
  } = options;

  const [status, setStatus] = useState<SocketStatus>('CONNECTING');
  const [reconnectCount, setReconnectCount] = useState(0);
  const [latestEvent, setLatestEvent] = useState<WsEnvelope | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const seenEventIdsRef = useRef<Set<number>>(new Set());
  const isExplicitCloseRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);

  // Keep callback refs fresh
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const getResolvedUrl = useCallback(() => {
    if (url) return url;
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname || 'localhost';
      return `${proto}//${hostname}:4000/ws`;
    }
    return 'ws://localhost:4000/ws';
  }, [url]);

  const send = useCallback((msg: ClientMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    isExplicitCloseRef.current = false;
    setStatus(hasConnectedOnceRef.current ? 'RECONNECTING' : 'CONNECTING');

    const targetUrl = getResolvedUrl();
    const ws = new WebSocket(targetUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('CONNECTED');
      setReconnectCount(0);

      // Subscribe to monitoring channel by default
      send({ action: 'subscribe', channel: 'monitoring' });

      // Start ping heartbeat every 20s
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        send({ action: 'ping' });
      }, 20000);

      if (hasConnectedOnceRef.current) {
        // Trigger reconnect callback to re-fetch fresh snapshot
        onReconnectRef.current?.();
      }
      hasConnectedOnceRef.current = true;
    };

    ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data) as WsEnvelope;

        // Deduplicate events by monotonic eventId
        if (envelope.eventId) {
          if (seenEventIdsRef.current.has(envelope.eventId)) {
            return;
          }
          seenEventIdsRef.current.add(envelope.eventId);
          // Bound seen set to last 10,000 IDs to avoid memory leak
          if (seenEventIdsRef.current.size > 10000) {
            const first = seenEventIdsRef.current.values().next().value;
            if (first !== undefined) seenEventIdsRef.current.delete(first);
          }
        }

        if (envelope.type !== 'pong') {
          setLatestEvent(envelope);
          onEventRef.current?.(envelope);
        }
      } catch {
        // Malformed message ignored
      }
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (isExplicitCloseRef.current) {
        setStatus('OFFLINE');
        return;
      }

      setStatus('RECONNECTING');
      setReconnectCount((prev) => {
        const next = prev + 1;
        // Exponential backoff: 1s, 1.5s, 2.25s ... max 30s with +/-20% jitter
        const baseDelay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(next, 8)));
        const jitter = baseDelay * (0.8 + Math.random() * 0.4);

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, jitter);

        return next;
      });
    };

    ws.onerror = () => {
      // Handled by onclose
    };
  }, [getResolvedUrl, send]);

  const disconnect = useCallback(() => {
    isExplicitCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setStatus('OFFLINE');
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    reconnectCount,
    latestEvent,
    send,
    connect,
    disconnect,
  };
}
