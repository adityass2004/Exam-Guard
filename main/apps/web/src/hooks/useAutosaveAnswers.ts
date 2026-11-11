import { useState, useRef, useCallback, useEffect } from 'react';
import { apiClient } from '../lib/api-client';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutosaveAnswers(sessionId: string) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Per-question monotonic sequence to prevent race conditions from delayed network responses
  const questionSeqRef = useRef<Record<string, number>>({});
  const retryTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const saveOption = useCallback(
    async (questionId: string, optionId: string, retryCount = 0) => {
      const currentSeq = (questionSeqRef.current[questionId] || 0) + 1;
      questionSeqRef.current[questionId] = currentSeq;

      // Optimistic local update
      setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
      setStatus('saving');

      try {
        await apiClient.put(`/student/sessions/${sessionId}/answers/${questionId}`, {
          optionId,
        });

        // Only update status if no newer save was initiated for this question
        if (questionSeqRef.current[questionId] === currentSeq) {
          setStatus('saved');
          setLastSavedAt(new Date().toLocaleTimeString());
        }
      } catch (err) {
        // If no newer save was initiated, handle error and retry
        if (questionSeqRef.current[questionId] === currentSeq) {
          setStatus('error');
          if (retryCount < 3) {
            const timeout = setTimeout(() => {
              saveOption(questionId, optionId, retryCount + 1);
            }, 2000 * Math.pow(2, retryCount));
            retryTimeoutsRef.current[questionId] = timeout;
          }
        }
      }
    },
    [sessionId]
  );

  const initAnswers = useCallback((initial: Record<string, string>) => {
    setAnswers(initial);
    setStatus('saved');
  }, []);

  useEffect(() => {
    return () => {
      Object.values(retryTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  return {
    answers,
    status,
    lastSavedAt,
    saveOption,
    initAnswers,
  };
}

