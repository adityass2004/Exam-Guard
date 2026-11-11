'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useWebcam } from '../../../../../hooks/useWebcam';
import { usePreVerification } from '../../../../../hooks/usePreVerification';
import { CameraPreview } from '../../../../../components/camera/CameraPreview';
import { Button } from '../../../../../components/ui/Button';
import { Badge } from '../../../../../components/ui/Badge';
import { apiClient } from '../../../../../lib/api-client';
import { StudentSessionDetail } from '@examguard/shared';

export default function PreVerificationPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedParams = use(params);
  const examId = resolvedParams.examId;

  const [sessionId, setSessionId] = useState<string | null>(searchParams.get('sessionId'));
  const [sessionLoading, setSessionLoading] = useState(!searchParams.get('sessionId'));
  const [examTitle, setExamTitle] = useState('Examination');
  const [starting, setStarting] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const { videoRef, status: camStatus, error: camError, start: startCamera, stop: stopCamera, captureFrame } = useWebcam();

  // Webcam lifecycle independent of session loading
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Load or initialize session if sessionId not in query
  useEffect(() => {
    let active = true;

    async function init() {
      if (sessionId) {
        try {
          const res = await apiClient.get<StudentSessionDetail>(`/student/sessions/${sessionId}`);
          if (active) {
            setExamTitle(res.data.examTitle);
            if (res.data.status === 'IN_PROGRESS') {
              router.push(`/sessions/${sessionId}`);
            }
          }
        } catch {
          // ignore
        }
        return;
      }

      try {
        setSessionLoading(true);
        const res = await apiClient.post<StudentSessionDetail>(`/student/exams/${examId}/sessions`);
        if (active) {
          setSessionId(res.data.id);
          setExamTitle(res.data.examTitle);
          if (res.data.status === 'IN_PROGRESS') {
            router.push(`/sessions/${res.data.id}`);
          }
        }
      } catch (err: any) {
        if (active) setInitError(err?.message || 'Failed to initialize session');
      } finally {
        if (active) setSessionLoading(false);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [examId, sessionId, router]);

  const {
    consecutiveMatches,
    requiredMatches,
    readyToStart,
    lastOutcome,
    statusMessage,
    attemptCount,
    isVerifying,
    errorMessage,
    verifyManual,
  } = usePreVerification({
    sessionId: sessionId || '',
    captureFrame: async () => {
      if (camStatus !== 'ready') return null;
      try {
        return await captureFrame();
      } catch {
        return null;
      }
    },
    intervalMs: 1500,
    autoStart: Boolean(sessionId),
  });

  const handleStartExam = async () => {
    if (!sessionId || !readyToStart) return;
    setStarting(true);
    try {
      await apiClient.post(`/student/sessions/${sessionId}/start`);
      router.push(`/sessions/${sessionId}`);
    } catch (err: any) {
      setInitError(err?.message || 'Failed to start examination');
      setStarting(false);
    }
  };

  const getStatusBadgeVariant = () => {
    if (readyToStart) return 'success';
    if (lastOutcome === 'MATCH') return 'default';
    if (lastOutcome === 'MISMATCH') return 'danger';
    if (lastOutcome === 'NO_FACE') return 'warning';
    return 'default';
  };

  if (sessionLoading) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-slate-500 text-sm">
        Initializing pre-examination verification session...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/exams" className="text-slate-400 hover:text-slate-600 text-sm font-semibold">
          ← Cancel and Return
        </Link>
        <span className="text-xs text-slate-400 font-mono">Pre-Exam Security Gate</span>
      </div>

      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Identity Pre-Verification</h1>
        <p className="text-sm text-slate-500">
          Position your face directly in front of the camera to verify your identity before commencing <strong>{examTitle}</strong>.
        </p>
      </div>

      {(initError || errorMessage) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs text-center font-medium">
          {initError || errorMessage}
        </div>
      )}

      {/* Camera Live Preview */}
      <div className="relative">
        <CameraPreview
          videoRef={videoRef}
          status={camStatus}
          error={camError}
          targetAngle="FRONT"
          acceptable={readyToStart}
          onRetry={startCamera}
        />
      </div>

      {/* Status Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
            <Badge variant={getStatusBadgeVariant()} className="text-xs px-2.5 py-1">
              {statusMessage}
            </Badge>
          </div>
          <div className="text-xs text-slate-400">
            Attempts: <strong>{attemptCount}</strong> {isVerifying && <span className="text-blue-500 animate-pulse ml-1">Analyzing...</span>}
          </div>
        </div>

        {/* Consecutive Matches Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-slate-600">
            <span>Identity Matches Required:</span>
            <span>
              {consecutiveMatches} / {requiredMatches} Consecutive Matches
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                readyToStart ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{
                width: `${Math.min(100, (consecutiveMatches / requiredMatches) * 100)}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {readyToStart
              ? 'Identity confirmed. You are clear to enter the examination.'
              : 'Keep looking straight at the camera. Non-matching frames reset the consecutive count.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-end">
          {!readyToStart && (
            <Button
              variant="outline"
              onClick={verifyManual}
              disabled={isVerifying || camStatus !== 'ready'}
              className="text-xs"
            >
              Verify Me Now
            </Button>
          )}

          <Button
            onClick={handleStartExam}
            disabled={!readyToStart || starting}
            className={`w-full sm:w-auto px-6 py-2.5 font-bold ${
              readyToStart ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md' : 'opacity-50'
            }`}
          >
            {starting ? 'Starting Exam...' : 'Start Examination →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
