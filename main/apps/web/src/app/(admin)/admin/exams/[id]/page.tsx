'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../../lib/api-client';
import { Button } from '../../../../../components/ui/Button';
import { Badge } from '../../../../../components/ui/Badge';
import { Tabs } from '../../../../../components/ui/Tabs';
import { ExamForm } from '../../../../../components/admin/ExamForm';
import { QuestionEditor, QuestionViewItem } from '../../../../../components/admin/QuestionEditor';
import { ConfirmDialog } from '../../../../../components/ui/ConfirmDialog';
import { CreateExamInput, CreateQuestionInput } from '@examguard/shared';

interface ExamDetails {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  shuffleQuestions: boolean;
  showScoreAfterSubmit: boolean;
  totalSessionsCount: number;
  activeSessionsCount: number;
  questions: QuestionViewItem[];
  createdAt: string;
  updatedAt: string;
}

interface ParticipantItem {
  sessionId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  attemptsCount: number;
  preExamAttempts: number;
}

export default function AdminExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const examId = resolvedParams.id;

  const [exam, setExam] = useState<ExamDetails | null>(null);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('questions');
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const fetchExam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ExamDetails>(`/admin/exams/${examId}`);
      setExam(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch examination details');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await apiClient.get<ParticipantItem[]>(`/admin/exams/${examId}/participants`);
      setParticipants(res.data);
    } catch {
      // ignore
    }
  }, [examId]);

  useEffect(() => {
    fetchExam();
  }, [fetchExam]);

  useEffect(() => {
    if (activeTab === 'participants') {
      fetchParticipants();
    }
  }, [activeTab, fetchParticipants]);

  const handleUpdateExam = async (values: CreateExamInput) => {
    try {
      await apiClient.patch(`/admin/exams/${examId}`, values);
      await fetchExam();
    } catch (err: any) {
      setError(err?.message || 'Failed to update exam');
    }
  };

  const handleActivate = async () => {
    try {
      await apiClient.post(`/admin/exams/${examId}/activate`);
      setConfirmActivate(false);
      await fetchExam();
    } catch (err: any) {
      setError(err?.message || 'Failed to activate exam');
    }
  };

  const handleDeactivate = async () => {
    try {
      await apiClient.post(`/admin/exams/${examId}/deactivate`);
      setConfirmDeactivate(false);
      await fetchExam();
    } catch (err: any) {
      setError(err?.message || 'Failed to deactivate exam');
    }
  };

  const handleAddQuestion = async (q: CreateQuestionInput) => {
    await apiClient.post(`/admin/exams/${examId}/questions`, q);
    await fetchExam();
  };

  const handleUpdateQuestion = async (questionId: string, q: CreateQuestionInput) => {
    await apiClient.patch(`/admin/exams/${examId}/questions/${questionId}`, q);
    await fetchExam();
  };

  const handleDeleteQuestion = async (questionId: string) => {
    await apiClient.delete(`/admin/exams/${examId}/questions/${questionId}`);
    await fetchExam();
  };

  const handleReorderQuestions = async (questionIds: string[]) => {
    await apiClient.put(`/admin/exams/${examId}/questions/order`, { questionIds });
    await fetchExam();
  };

  if (loading && !exam) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading examination...</div>;
  }

  if (!exam) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-red-500 font-medium">Exam not found</p>
        <Link href="/admin/exams" className="text-blue-600 text-sm underline mt-2 inline-block">
          Return to Exams
        </Link>
      </div>
    );
  }

  const hasSessions = exam.totalSessionsCount > 0;

  const tabs = [
    { id: 'questions', label: `Questions (${exam.questions.length})` },
    { id: 'participants', label: `Participants (${exam.totalSessionsCount})` },
    { id: 'settings', label: 'Settings & Details' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/exams" className="text-slate-400 hover:text-slate-600 text-sm font-semibold">
          ← Back to Exams
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{exam.title}</h1>
            {exam.status === 'ACTIVE' && <Badge variant="success">Active</Badge>}
            {exam.status === 'DRAFT' && <Badge variant="warning">Draft</Badge>}
            {exam.status === 'INACTIVE' && <Badge variant="default">Inactive</Badge>}
          </div>
          <p className="text-xs text-slate-500">
            Duration: <strong>{exam.durationMinutes} mins</strong> · {exam.questions.length} Questions · {exam.totalSessionsCount} Candidate Sessions ({exam.activeSessionsCount} active)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {exam.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
              onClick={() => setConfirmDeactivate(true)}
            >
              Deactivate Exam
            </Button>
          ) : (
            <Button onClick={() => setConfirmActivate(true)}>
              Activate Exam
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'questions' && (
        <QuestionEditor
          examId={examId}
          questions={exam.questions}
          hasSessions={hasSessions}
          onAddQuestion={handleAddQuestion}
          onUpdateQuestion={handleUpdateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onReorderQuestions={handleReorderQuestions}
        />
      )}

      {activeTab === 'participants' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {participants.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No candidates have started a session for this exam yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">Candidate</th>
                    <th className="px-4 py-3.5">Student ID</th>
                    <th className="px-4 py-3.5">Session Status</th>
                    <th className="px-4 py-3.5">Score</th>
                    <th className="px-4 py-3.5">Pre-Exam Attempts</th>
                    <th className="px-6 py-3.5">Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participants.map((p) => (
                    <tr key={p.sessionId} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5">
                        <span className="font-semibold text-slate-900 block">{p.studentName}</span>
                        <span className="text-xs text-slate-400">{p.studentEmail}</span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">{p.studentId}</td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={
                            p.status === 'SUBMITTED'
                              ? 'success'
                              : p.status === 'IN_PROGRESS'
                              ? 'warning'
                              : p.status === 'EXPIRED'
                              ? 'danger'
                              : 'default'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-800">
                        {p.score != null && p.maxScore ? `${p.score} / ${p.maxScore}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{p.preExamAttempts}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-400">
                        {p.submittedAt ? new Date(p.submittedAt).toLocaleString() : 'In Progress'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <ExamForm
          initialValues={{
            title: exam.title,
            description: exam.description,
            durationMinutes: exam.durationMinutes,
            shuffleQuestions: exam.shuffleQuestions,
            showScoreAfterSubmit: exam.showScoreAfterSubmit,
          }}
          onSubmit={handleUpdateExam}
          submitLabel="Update Examination Details"
        />
      )}

      {/* Activate Dialog */}
      <ConfirmDialog
        isOpen={confirmActivate}
        onClose={() => setConfirmActivate(false)}
        onConfirm={handleActivate}
        title="Activate Examination"
        message="Are you sure you want to activate this exam? Candidates will be able to start taking it immediately."
        confirmLabel="Activate Exam"
      />

      {/* Deactivate Dialog */}
      <ConfirmDialog
        isOpen={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivate}
        title="Deactivate Examination"
        message="Deactivating this exam will prevent new sessions from starting. In-progress sessions can finish normally."
        confirmLabel="Deactivate Exam"
      />
    </div>
  );
}
