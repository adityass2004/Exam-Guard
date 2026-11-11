import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAdminSocket } from './useAdminSocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = WebSocket.CONNECTING;
  sentData: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }

  triggerOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('useAdminSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in CONNECTING state and sends subscribe message on open', () => {
    const { result } = renderHook(() => useAdminSocket({ url: 'ws://localhost:4000/ws' }));

    expect(result.current.status).toBe('CONNECTING');
    expect(MockWebSocket.instances.length).toBe(1);

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.triggerOpen();
    });

    expect(result.current.status).toBe('CONNECTED');
    expect(ws.sentData).toContain(JSON.stringify({ action: 'subscribe', channel: 'monitoring' }));
  });

  it('deduplicates incoming events by monotonic eventId', () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useAdminSocket({
        url: 'ws://localhost:4000/ws',
        onEvent,
      })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.triggerOpen();
    });

    const envelope1 = {
      type: 'incident.opened',
      eventId: 101,
      emittedAt: new Date().toISOString(),
      payload: { incidentId: 'inc-1' },
    };

    // Receive first time
    act(() => {
      ws.triggerMessage(envelope1);
    });
    expect(onEvent).toHaveBeenCalledTimes(1);

    // Duplicate event with same eventId
    act(() => {
      ws.triggerMessage(envelope1);
    });
    // Should NOT call onEvent a second time
    expect(onEvent).toHaveBeenCalledTimes(1);

    // Distinct eventId
    act(() => {
      ws.triggerMessage({ ...envelope1, eventId: 102 });
    });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('transitions to RECONNECTING on unexpected close and retries connection', () => {
    const onReconnect = vi.fn();
    const { result } = renderHook(() =>
      useAdminSocket({
        url: 'ws://localhost:4000/ws',
        onReconnect,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    act(() => {
      ws1.triggerOpen();
    });
    expect(result.current.status).toBe('CONNECTED');

    // Simulate connection drop
    act(() => {
      ws1.close();
    });
    expect(result.current.status).toBe('RECONNECTING');

    // Fast-forward past reconnect delay
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Second connection attempt
    expect(MockWebSocket.instances.length).toBe(2);
    const ws2 = MockWebSocket.instances[1];

    act(() => {
      ws2.triggerOpen();
    });

    expect(result.current.status).toBe('CONNECTED');
    // onReconnect should be triggered on reconnection to catch up snapshot
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects cleanly and transitions to OFFLINE', () => {
    const { result } = renderHook(() => useAdminSocket({ url: 'ws://localhost:4000/ws' }));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.triggerOpen();
    });
    expect(result.current.status).toBe('CONNECTED');

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe('OFFLINE');
  });
});
