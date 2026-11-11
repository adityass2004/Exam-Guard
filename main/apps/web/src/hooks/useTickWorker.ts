'use client';

import { useEffect, useRef } from 'react';

export interface UseTickWorkerOptions {
  intervalMs: number;
  enabled: boolean;
  onTick: () => void;
}

export function useTickWorker({ intervalMs, enabled, onTick }: UseTickWorkerOptions) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const workerRef = useRef<Worker | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' });
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (fallbackIntervalRef.current !== null) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      return;
    }

    let useFallback = false;

    if (typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('../workers/tick.worker.ts', import.meta.url));
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent) => {
          if (e.data?.type === 'TICK') {
            onTickRef.current();
          }
        };

        worker.onerror = () => {
          // Fall back to window timer on worker error
          worker.terminate();
          workerRef.current = null;
          fallbackIntervalRef.current = setInterval(() => {
            onTickRef.current();
          }, intervalMs);
        };

        worker.postMessage({ type: 'START', intervalMs });
      } catch {
        useFallback = true;
      }
    } else {
      useFallback = true;
    }

    if (useFallback) {
      fallbackIntervalRef.current = setInterval(() => {
        onTickRef.current();
      }, intervalMs);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' });
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (fallbackIntervalRef.current !== null) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [enabled, intervalMs]);
}

