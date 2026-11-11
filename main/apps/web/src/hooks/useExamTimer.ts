import { useState, useEffect, useRef, useMemo } from 'react';

export interface UseExamTimerOptions {
  expiresAt: string | null | undefined;
  serverNow: string | null | undefined;
  onExpire?: () => void;
}

export function useExamTimer({ expiresAt, serverNow, onExpire }: UseExamTimerOptions) {
  // Compute initial clock skew: serverNow - clientNow
  const skewMs = useMemo(() => {
    if (!serverNow) return 0;
    const serverTime = new Date(serverNow).getTime();
    const clientTime = Date.now();
    return serverTime - clientTime;
  }, [serverNow]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!expiresAt) return 0;
    const expiry = new Date(expiresAt).getTime();
    const now = Date.now() + skewMs;
    return Math.max(0, Math.floor((expiry - now) / 1000));
  });

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }

    const expiryTime = new Date(expiresAt).getTime();

    const tick = () => {
      const now = Date.now() + skewMs;
      const rem = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setRemainingSeconds(rem);

      if (rem <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        if (onExpireRef.current) {
          onExpireRef.current();
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, skewMs]);

  const formattedTime = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [remainingSeconds]);

  const isExpired = remainingSeconds <= 0;
  const isUrgent1Min = remainingSeconds > 0 && remainingSeconds <= 60;
  const isWarning5Min = remainingSeconds > 60 && remainingSeconds <= 300;

  return {
    remainingSeconds,
    formattedTime,
    isExpired,
    isWarning5Min,
    isUrgent1Min,
  };
}

