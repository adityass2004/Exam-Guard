import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useExamTimer } from './useExamTimer';

describe('useExamTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats mm:ss correctly for durations under an hour', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    vi.setSystemTime(now);

    const expiresAt = new Date('2026-11-10T12:25:30Z').toISOString();
    const serverNow = now.toISOString();

    const { result } = renderHook(() =>
      useExamTimer({ expiresAt, serverNow })
    );

    expect(result.current.remainingSeconds).toBe(25 * 60 + 30);
    expect(result.current.formattedTime).toBe('25:30');
    expect(result.current.isWarning5Min).toBe(false);
    expect(result.current.isUrgent1Min).toBe(false);
    expect(result.current.isExpired).toBe(false);
  });

  it('formats hh:mm:ss for durations over an hour', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    vi.setSystemTime(now);

    const expiresAt = new Date('2026-11-10T13:15:45Z').toISOString();
    const serverNow = now.toISOString();

    const { result } = renderHook(() =>
      useExamTimer({ expiresAt, serverNow })
    );

    expect(result.current.formattedTime).toBe('01:15:45');
    expect(result.current.isWarning5Min).toBe(false);
    expect(result.current.isUrgent1Min).toBe(false);
  });

  it('marks isWarning5Min when <= 5 minutes and isUrgent1Min when <= 1 minute', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    vi.setSystemTime(now);

    const expiresAt = new Date('2026-11-10T12:04:30Z').toISOString();
    const serverNow = now.toISOString();

    const { result } = renderHook(() =>
      useExamTimer({ expiresAt, serverNow })
    );

    expect(result.current.isWarning5Min).toBe(true);
    expect(result.current.isUrgent1Min).toBe(false);
    expect(result.current.remainingSeconds).toBe(270);

    // Advance to 45 seconds left
    act(() => {
      vi.advanceTimersByTime(225000);
    });

    expect(result.current.isWarning5Min).toBe(false);
    expect(result.current.isUrgent1Min).toBe(true);
  });

  it('corrects for server clock skew', () => {
    // Client is at 12:00:00, but server is at 12:05:00 (+5 min skew)
    const clientNow = new Date('2026-11-10T12:00:00Z');
    vi.setSystemTime(clientNow);

    const serverNow = new Date('2026-11-10T12:05:00Z').toISOString();
    const expiresAt = new Date('2026-11-10T12:15:00Z').toISOString();

    const { result } = renderHook(() =>
      useExamTimer({ expiresAt, serverNow })
    );

    // Remaining should be 10 minutes (600s), not 15 minutes (900s)
    expect(result.current.remainingSeconds).toBe(600);
    expect(result.current.formattedTime).toBe('10:00');
  });

  it('fires onExpire when countdown elapses', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    vi.setSystemTime(now);

    const expiresAt = new Date('2026-11-10T12:00:03Z').toISOString();
    const serverNow = now.toISOString();
    const onExpire = vi.fn();

    const { result } = renderHook(() =>
      useExamTimer({ expiresAt, serverNow, onExpire })
    );

    expect(result.current.remainingSeconds).toBe(3);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isExpired).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
