'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../lib/api-client';
import {
  VerificationStatusCode,
  ContinuousVerificationResponse,
  CameraErrorCode,
} from '@examguard/shared';
import { useTickWorker } from './useTickWorker';

export type UiVerificationStatusCode =
  | VerificationStatusCode
  | 'CHECKING'
  | 'CAMERA_OFFLINE';

export interface UseVerificationLoopOptions {
  sessionId: string;
  isActive: boolean;
  initialIntervalMs?: number;
  captureFrame: (options?: { maxEdge?: number; quality?: number }) => Promise<Blob>;
  isCameraReady: boolean;
  cameraError?: { name: string; message: string; userInstruction?: string } | null;
  onUnauthorized?: () => void;
  onSessionTerminated?: () => void;
}

export interface VerificationState {
  statusCode: UiVerificationStatusCode;
  studentMessage: string;
  activeWarning: boolean;
  lastVerifiedAt: Date | null;
  secondsSinceLastCheck: number;
  isVerifying: boolean;
  cameraLost: boolean;
  verificationCount: number;
}

export function useVerificationLoop({
  sessionId,
  isActive,
  initialIntervalMs = 1500,
  captureFrame,
  isCameraReady,
  cameraError,
  onUnauthorized,
  onSessionTerminated,
}: UseVerificationLoopOptions) {
  const router = useRouter();

  const [statusCode, setStatusCode] = useState<UiVerificationStatusCode>('CHECKING');
  const [studentMessage, setStudentMessage] = useState('Initializing identity monitor...');
  const [activeWarning, setActiveWarning] = useState(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<Date | null>(null);
  const [secondsSinceLastCheck, setSecondsSinceLastCheck] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cameraLost, setCameraLost] = useState(false);
  const [verificationCount, setVerificationCount] = useState(0);

  const [intervalMs, setIntervalMs] = useState(initialIntervalMs);
  const inFlightRef = useRef(false);
  const consecutiveNetworkErrorsRef = useRef(0);
  const lastCameraEventSentRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Send camera client event with local rate limit to prevent spam
  const reportCameraError = useCallback(
    async (errorCode: CameraErrorCode, detail?: string) => {
      const now = Date.now();
      if (now - lastCameraEventSentRef.current < 2000) return;
      lastCameraEventSentRef.current = now;

      try {
        await apiClient.post(`/student/sessions/${sessionId}/client-events`, {
          type: 'CAMERA_ERROR',
          errorCode,
          detail: detail || 'Webcam disconnected or feed unreadable during exam',
        });
      } catch {
        // Non-fatal if telemetry submission fails
      }
    },
    [sessionId]
  );

  // Handle external cameraError changes
  useEffect(() => {
    if (cameraError && isActive) {
      setCameraLost(true);
      setStatusCode('CAMERA_PROBLEM');
      setStudentMessage(cameraError.userInstruction || 'Webcam feed disconnected');
      setActiveWarning(true);
      reportCameraError('CAMERA_TRACK_ENDED', cameraError.message);
    } else if (!cameraError && isCameraReady && cameraLost) {
      setCameraLost(false);
    }
  }, [cameraError, isActive, isCameraReady, cameraLost, reportCameraError]);

  // Elapsed seconds timer since last successful verification
  useEffect(() => {
    if (!lastVerifiedAt) return;
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - lastVerifiedAt.getTime()) / 1000);
      setSecondsSinceLastCheck(Math.max(0, diff));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastVerifiedAt]);

  // Perform single verification cycle
  const performCycle = useCallback(async () => {
    if (!isActive || inFlightRef.current || !isCameraReady || cameraLost) {
      return;
    }

    inFlightRef.current = true;
    setIsVerifying(true);

    let frameBlob: Blob | null = null;
    try {
      frameBlob = await captureFrame({ maxEdge: 480, quality: 0.75 });
    } catch (err: any) {
      inFlightRef.current = false;
      setIsVerifying(false);
      setCameraLost(true);
      setStatusCode('CAMERA_PROBLEM');
      setStudentMessage('Unable to capture webcam frame. Please verify your camera.');
      setActiveWarning(true);
      reportCameraError('CAMERA_UNKNOWN', err?.message);
      return;
    }

    if (!frameBlob) {
      inFlightRef.current = false;
      setIsVerifying(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), Math.max(8000, intervalMs * 4));

    try {
      const formData = new FormData();
      formData.append('frame', frameBlob, 'frame.jpg');
      formData.append('clientCapturedAt', new Date().toISOString());

      const res = await apiClient.post<ContinuousVerificationResponse>(
        `/student/sessions/${sessionId}/verifications`,
        formData,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      consecutiveNetworkErrorsRef.current = 0;

      const data = res.data;
      setStatusCode(data.statusCode);
      setStudentMessage(data.studentMessage);
      setActiveWarning(data.activeWarning);
      setLastVerifiedAt(new Date());
      setSecondsSinceLastCheck(0);
      setVerificationCount((c) => c + 1);

      if (data.nextIntervalMs && data.nextIntervalMs !== intervalMs) {
        setIntervalMs(data.nextIntervalMs);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);

      const status = err?.statusCode || err?.status || err?.response?.status;
      const code = err?.code || err?.data?.error?.code;

      if (status === 401) {
        if (onUnauthorized) onUnauthorized();
        else router.push('/login');
        return;
      }

      if (
        status === 403 ||
        code === 'SESSION_NOT_ACTIVE' ||
        code === 'SESSION_EXPIRED' ||
        code === 'SESSION_SUSPENDED'
      ) {
        if (onSessionTerminated) onSessionTerminated();
        else router.push(`/sessions/${sessionId}/summary`);
        return;
      }

      if (status === 409 || code === 'VERIFICATION_IN_PROGRESS') {
        // A cycle is already executing on server; ignore and wait for next tick
        return;
      }

      if (err?.name === 'AbortError' || code === 'TIMEOUT') {
        // Mild network stall or timeout, wait for next tick
        return;
      }

      // Network or 5xx degradation
      consecutiveNetworkErrorsRef.current += 1;
      const backoffSec = Math.min(15, Math.pow(2, consecutiveNetworkErrorsRef.current));
      setIntervalMs(backoffSec * 1000);

      if (consecutiveNetworkErrorsRef.current >= 2) {
        setStatusCode('SERVICE_UNAVAILABLE');
        setStudentMessage('Verification service is temporarily slow. Continuing exam...');
        setActiveWarning(true);
      }
    } finally {
      inFlightRef.current = false;
      setIsVerifying(false);
      abortControllerRef.current = null;
    }
  }, [
    isActive,
    isCameraReady,
    cameraLost,
    captureFrame,
    sessionId,
    intervalMs,
    reportCameraError,
    onUnauthorized,
    onSessionTerminated,
    router,
  ]);

  // Hook into tick worker
  useTickWorker({
    intervalMs,
    enabled: isActive && isCameraReady && !cameraLost,
    onTick: performCycle,
  });

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const retryVerification = useCallback(() => {
    setCameraLost(false);
    consecutiveNetworkErrorsRef.current = 0;
    setIntervalMs(initialIntervalMs);
    setStatusCode('CHECKING');
    setStudentMessage('Resuming identity verification...');
    setActiveWarning(false);
  }, [initialIntervalMs]);

  return {
    statusCode,
    studentMessage,
    activeWarning,
    lastVerifiedAt,
    secondsSinceLastCheck,
    isVerifying,
    cameraLost,
    verificationCount,
    retryVerification,
  };
}
