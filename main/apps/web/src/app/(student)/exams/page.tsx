'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../../lib/api-client';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StudentExamListItem, StudentSessionDetail } from '@examguard/shared';

export default function StudentExamsListPage() {
  const router = useRouter();
  const [exams, setExams] = useState<StudentExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingExamId, setStartingExamId] = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<StudentExamListItem[]>('/student/exams');
      setExams(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load examinations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleStartExam = async (exam: StudentExamListItem) => {
    setStartingExamId(exam.id);
    setError(null);
    try {
      const res = await apiClient.post<StudentSessionDetail>(`/student/exams/${exam.id}/sessions`);
      const session = res.data;

      if (session.status === 'PENDING_VERIFICATION') {
        router.push(`/exams/${exam.id}/verify?sessionId=${session.id}`);
      } else {
        router.push(`/sessions/${session.id}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize examination session');
      setStartingExamId(null);
    }
  };

  const getReasonText = (reason: string | null) => {
    switch (reason) {
      case 'ENROLLMENT_NOT_APPROVED':
        return 'Biometric face enrollment must be approved by an administrator before you can take examinations.';
      case 'ACCOUNT_SUSPENDED':
        return 'Your candidate account has been suspended. Please contact the examination administrator.';
      case 'ANOTHER_SESSION_ACTIVE':
        return 'You have another examination session currently active or in progress.';
      default:
        return 'You are currently not eligible to start this examination.';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Available Examinations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review your scheduled assessments. Face verification is required prior to commencing each exam.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm bg-white rounded-xl border border-slate-200">
          Loading examinations...
        </div>
      ) : exams.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-sm bg-white rounded-xl border border-slate-200">
          No examinations are currently scheduled or active for your profile.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-300 transition"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{exam.title}</h3>
                  {exam.activeSessionId && (
                    <Badge variant="warning" className="text-[10px]">
                      Session Active
                    </Badge>
                  )}
                </div>

                {exam.description && (
                  <p className="text-sm text-slate-600 line-clamp-2">{exam.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                  <span>⏱ Duration: <strong>{exam.durationMinutes} mins</strong></span>
                  <span>📝 Questions: <strong>{exam.questionCount}</strong></span>
                </div>

                {!exam.canStart && exam.reason && (
                  <div className="pt-2">
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      ⚠️ {getReasonText(exam.reason)}
                      {exam.reason === 'ENROLLMENT_NOT_APPROVED' && (
                        <Link href="/enrollment" className="underline font-semibold ml-1">
                          Go to Face Enrollment
                        </Link>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="w-full md:w-auto flex justify-end">
                {exam.canStart ? (
                  <Button
                    onClick={() => handleStartExam(exam)}
                    disabled={startingExamId === exam.id}
                    className="w-full md:w-auto"
                  >
                    {startingExamId === exam.id
                      ? 'Initializing...'
                      : exam.activeSessionId
                      ? 'Resume Examination'
                      : 'Start Verification'}
                  </Button>
                ) : (
                  <Button disabled variant="outline" className="w-full md:w-auto opacity-50 cursor-not-allowed">
                    Unavailable
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

