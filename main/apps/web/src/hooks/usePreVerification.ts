import { useState, useRef, useCallback, useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { PreVerificationResult, VerificationOutcome } from '@examguard/shared';

export interface UsePreVerificationOptions {
  sessionId: string;
  captureFrame: () => Promise<Blob | null> | Blob | null;
  intervalMs?: number;
  autoStart?: boolean;
}

export function usePreVerification({
  sessionId,
  captureFrame,
  intervalMs = 1500,
  autoStart = true,
}: UsePreVerificationOptions) {
  const [consecutiveMatches, setConsecutiveMatches] = useState(0);
  const [requiredMatches, setRequiredMatches] = useState(2);
  const [readyToStart, setReadyToStart] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<VerificationOutcome | null>(null);
  const [statusMessage, setStatusMessage] = useState('Position your face within the guide to verify');
  const [attemptCount, setAttemptCount] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const readyToStartRef = useRef(false);

  const verifyAttempt = useCallback(async () => {
    if (!isMountedRef.current || inFlightRef.current || readyToStartRef.current) {
      return;
    }

    let frameBlob: Blob | null = null;
    try {
      frameBlob = await captureFrame();
    } catch {
      // camera frame not ready
    }

    if (!frameBlob) {
      if (!readyToStartRef.current) {
        setStatusMessage('Camera not ready or frame unavailable');
      }
      return;
    }

    inFlightRef.current = true;
    setIsVerifying(true);
    setErrorMessage(null);

    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      formData.append('frame', frameBlob, 'frame.jpg');

      const res = await apiClient.post<PreVerificationResult>(
        `/student/sessions/${sessionId}/pre-verification`,
        formData,
        { signal: abortControllerRef.current.signal }
      );

      if (!isMountedRef.current || readyToStartRef.current) return;

      const result = res.data;
      setLastOutcome(result.outcome);
      setStatusMessage(result.studentMessage);
      setConsecutiveMatches(result.consecutiveMatches);
      setRequiredMatches(result.requiredMatches);
      setAttemptCount((prev) => prev + 1);

      if (result.readyToStart) {
        readyToStartRef.current = true;
        setReadyToStart(true);
        setIsRunning(false);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current || readyToStartRef.current) return;
      if (err.name === 'AbortError') return;

      const msg = err?.message || 'Verification attempt failed';
      setErrorMessage(msg);
      setStatusMessage('Verification service temporarily unavailable');
      setConsecutiveMatches(0);
    } finally {
      inFlightRef.current = false;
      setIsVerifying(false);
    }
  }, [sessionId, captureFrame]);

  // Non-overlapping self-rescheduling timer loop
  useEffect(() => {
    if (!isRunning || readyToStart) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let active = true;

    const runLoop = async () => {
      if (!active || readyToStart) return;
      await verifyAttempt();
      if (active && !readyToStart) {
        timerRef.current = setTimeout(runLoop, intervalMs);
      }
    };

    timerRef.current = setTimeout(runLoop, 500);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, readyToStart, verifyAttempt, intervalMs]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    consecutiveMatches,
    requiredMatches,
    readyToStart,
    lastOutcome,
    statusMessage,
    attemptCount,
    isVerifying,
    isRunning,
    errorMessage,
    setIsRunning,
    verifyManual: verifyAttempt,
  };
}
