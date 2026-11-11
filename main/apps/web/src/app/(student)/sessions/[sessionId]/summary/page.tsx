'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../../lib/api-client';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { SessionSummary } from '@examguard/shared';

export default function SessionSummaryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<SessionSummary>(`/student/sessions/${sessionId}/summary`);
        if (active) setSummary(res.data);
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to load examination summary');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSummary();

    return () => {
      active = false;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center text-slate-500 text-sm">
        Loading examination summary...
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-md mx-auto py-12 p-6 bg-white rounded-xl border border-red-200 text-center space-y-3">
        <p className="text-red-600 font-medium">{error || 'Summary not found'}</p>
        <Link href="/dashboard">
          <Button>Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2">
          {summary.status === 'SUBMITTED' ? (
            <Badge variant="success" className="text-sm px-3 py-1">
              Examination Completed
            </Badge>
          ) : summary.status === 'EXPIRED' ? (
            <Badge variant="danger" className="text-sm px-3 py-1">
              Examination Time Expired
            </Badge>
          ) : (
            <Badge variant="default" className="text-sm px-3 py-1">
              {summary.status}
            </Badge>
          )}
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          {summary.examTitle}
        </h1>
        <p className="text-sm text-slate-500">
          Your examination answers have been securely logged and evaluated on the server.
        </p>
      </div>

      {/* Score Card (If allowed by exam policy) */}
      {summary.score != null && summary.maxScore ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Your Final Score
          </span>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-5xl font-black text-slate-900">{summary.score}</span>
            <span className="text-xl font-bold text-slate-400">/ {summary.maxScore}</span>
          </div>
          {summary.percentage != null && (
            <div className="text-sm font-semibold text-blue-600">
              {summary.percentage}% Overall Score
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center text-slate-500 text-sm">
          <span>ℹ️ Score publication for this assessment will be released after administrative review.</span>
        </div>
      )}

      {/* Session Details & Verification Summary */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          Verification & Proctoring Log
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-xs text-slate-400">Total Checks</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{summary.totalAttempts}</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl">
            <div className="text-xs text-emerald-600">Verified</div>
            <div className="text-xl font-bold text-emerald-800 mt-1">{summary.successfulMatches}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-xs text-slate-400">Unverified</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{summary.unverified}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-xs text-slate-400">Security Triggers</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{summary.securityTriggersCount}</div>
          </div>
        </div>

        <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100">
          <div className="flex justify-between">
            <span>Session ID:</span>
            <span className="font-mono text-slate-700">{summary.sessionId}</span>
          </div>
          {summary.submittedAt && (
            <div className="flex justify-between">
              <span>Submitted At:</span>
              <span className="text-slate-700">{new Date(summary.submittedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-3 pt-2">
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
        <Link href="/exams">
          <Button>View Available Exams</Button>
        </Link>
      </div>
    </div>
  );
}

