'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api-client';
import { useExamTimer } from '../../../../hooks/useExamTimer';
import { useAutosaveAnswers } from '../../../../hooks/useAutosaveAnswers';
import { useWebcam } from '../../../../hooks/useWebcam';
import { useVerificationLoop } from '../../../../hooks/useVerificationLoop';
import { IdentityStatusPanel } from '../../../../components/camera/IdentityStatusPanel';
import { CameraLostOverlay } from '../../../../components/camera/CameraLostOverlay';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { StudentSessionDetail, StudentSessionQuestion } from '@examguard/shared';

export default function ExamRunnerPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const [session, setSession] = useState<StudentSessionDetail | null>(null);
  const [questions, setQuestions] = useState<StudentSessionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Webcam
  const {
    videoRef,
    start: startCamera,
    stop: stopCamera,
    captureFrame,
    status: cameraStatus,
    error: cameraError,
  } = useWebcam();

  // Continuous Face Verification Engine
  const verification = useVerificationLoop({
    sessionId,
    isActive: session?.status === 'IN_PROGRESS',
    initialIntervalMs: session?.settings?.intervalMs ?? 1500,
    captureFrame,
    isCameraReady: cameraStatus === 'ready',
    cameraError,
    onUnauthorized: () => router.push('/login'),
    onSessionTerminated: () => router.push(`/sessions/${sessionId}/summary`),
  });

  // Autosave hook
  const { answers, status: autosaveStatus, lastSavedAt, saveOption, initAnswers } =
    useAutosaveAnswers(sessionId);

  // Auto-submit handler when timer expires
  const handleAutoSubmit = useCallback(async () => {
    try {
      await apiClient.post(`/student/sessions/${sessionId}/submit`);
      router.push(`/sessions/${sessionId}/summary`);
    } catch {
      router.push(`/sessions/${sessionId}/summary`);
    }
  }, [sessionId, router]);

  // Server-authoritative skew-corrected timer
  const { formattedTime, isExpired, isWarning5Min, isUrgent1Min } = useExamTimer({
    expiresAt: session?.expiresAt,
    serverNow: session?.serverNow,
    onExpire: handleAutoSubmit,
  });

  // Camera lifecycle
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Load session & questions
  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const sessionRes = await apiClient.get<StudentSessionDetail>(
          `/student/sessions/${sessionId}`
        );
        if (!active) return;
        setSession(sessionRes.data);

        if (sessionRes.data.status === 'SUBMITTED' || sessionRes.data.status === 'EXPIRED') {
          router.push(`/sessions/${sessionId}/summary`);
          return;
        }

        if (sessionRes.data.status === 'PENDING_VERIFICATION') {
          router.push(`/exams/${sessionRes.data.examId}/verify?sessionId=${sessionId}`);
          return;
        }

        const qRes = await apiClient.get<StudentSessionQuestion[]>(
          `/student/sessions/${sessionId}/questions`
        );
        if (!active) return;
        setQuestions(qRes.data);

        // Pre-populate saved answers
        const initialMap: Record<string, string> = {};
        for (const q of qRes.data) {
          if (q.selectedOptionId) {
            initialMap[q.id] = q.selectedOptionId;
          }
        }
        initAnswers(initialMap);
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to load examination');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [sessionId, router, initAnswers]);

  const handleManualSubmit = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post(`/student/sessions/${sessionId}/submit`);
      router.push(`/sessions/${sessionId}/summary`);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit examination');
      setIsSubmitting(false);
    }
  };

  const currentQ = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center text-slate-500 text-sm">
        Loading examination session...
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-xl mx-auto py-12 p-6 bg-white rounded-xl border border-red-200 text-center space-y-3">
        <p className="text-red-600 font-medium">{error || 'Session not found'}</p>
        <Button onClick={() => router.push('/exams')}>Return to Exams</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              {session.examTitle}
            </h1>
            <Badge variant="default" className="text-xs bg-slate-100 text-slate-700">
              Question {currentIndex + 1} of {questions.length}
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            {/* Autosave Status */}
            <div className="text-xs flex items-center gap-1.5">
              {autosaveStatus === 'saving' && (
                <span className="text-blue-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                  Saving...
                </span>
              )}
              {autosaveStatus === 'saved' && (
                <span className="text-slate-400">
                  Saved {lastSavedAt ? `at ${lastSavedAt}` : ''}
                </span>
              )}
              {autosaveStatus === 'error' && (
                <span className="text-red-500 font-semibold">⚠️ Retrying save...</span>
              )}
            </div>

            {/* Countdown Timer */}
            <div
              className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-sm tracking-wider flex items-center gap-1.5 ${
                isUrgent1Min
                  ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                  : isWarning5Min
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <span>⏱</span>
              <span>{isExpired ? '00:00 (Expired)' : formattedTime}</span>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowSubmitConfirm(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-xs px-3"
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </header>

      {/* Main Runner Content */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Sidebar: Identity Monitor + Question Navigation */}
        <aside className="lg:col-span-1 space-y-6 order-2 lg:order-1">
          {/* Identity Monitor Panel */}
          <IdentityStatusPanel
            videoRef={videoRef}
            isActive={session?.status === 'IN_PROGRESS'}
            statusCode={verification.statusCode}
            studentMessage={verification.studentMessage}
            activeWarning={verification.activeWarning}
            secondsSinceLastCheck={verification.secondsSinceLastCheck}
            isVerifying={verification.isVerifying}
            cameraLost={verification.cameraLost}
          />

          {/* Question Navigation Grid */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
              <span>Question Palette</span>
              <span className="text-slate-400 font-normal">
                {answeredCount}/{questions.length} Answered
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = Boolean(answers[q.id]);
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                      isCurrent
                        ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-600 text-white'
                        : isAnswered
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center: Current Question Card */}
        <div className="lg:col-span-3 space-y-6 order-1 lg:order-2">
          {currentQ ? (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <Badge variant="default" className="text-xs bg-slate-100 text-slate-700">
                  {currentQ.points} {currentQ.points === 1 ? 'Point' : 'Points'}
                </Badge>
              </div>

              <div className="text-base sm:text-lg font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">
                {currentQ.text}
              </div>

              {/* Options Radio List */}
              <div className="space-y-3 pt-2">
                {currentQ.options.map((opt, optIdx) => {
                  const isSelected = answers[currentQ.id] === opt.id;
                  return (
                    <label
                      key={opt.id}
                      onClick={() => saveOption(currentQ.id, opt.id)}
                      className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition select-none ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question_${currentQ.id}`}
                        checked={isSelected}
                        onChange={() => saveOption(currentQ.id, opt.id)}
                        className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-sm text-slate-800">
                        <span className="font-semibold text-slate-500 mr-2">
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        <span>{opt.text}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Bottom Action Bar */}
              <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                >
                  ← Previous
                </Button>

                {currentIndex < questions.length - 1 ? (
                  <Button
                    onClick={() =>
                      setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
                    }
                  >
                    Next Question →
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowSubmitConfirm(true)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Review & Submit
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white rounded-xl text-slate-500 text-sm">
              No questions found in this examination.
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Submit Dialog */}
      <ConfirmDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={handleManualSubmit}
        title="Submit Examination"
        message={
          unansweredCount > 0
            ? `You have ${unansweredCount} unanswered ${
                unansweredCount === 1 ? 'question' : 'questions'
              }. Are you sure you want to finish and submit your exam now?`
            : 'Are you sure you want to finalize and submit your examination? Once submitted, answers cannot be edited.'
        }
        confirmLabel={isSubmitting ? 'Submitting...' : 'Yes, Submit Exam'}
      />

      {/* Blocking Camera Disconnection Overlay */}
      <CameraLostOverlay
        isOpen={verification.cameraLost}
        onRetry={() => {
          startCamera();
          verification.retryVerification();
        }}
      />
    </div>
  );
}
