'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StudentDashboardDto } from '@examguard/shared';
import { apiClient } from '../../../lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';

export default function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboardDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiClient<StudentDashboardDto>('/api/v1/student/dashboard');
        setData(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
        <Spinner size="lg" className="mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading student candidate overview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
        <p className="font-semibold mb-1">Could not load dashboard data</p>
        <p className="text-xs text-rose-700">{error || 'Unknown error occurred'}</p>
      </div>
    );
  }

  const enrollment = data.enrollment;
  const isApproved = enrollment.status === 'APPROVED';

  return (
    <div className="space-y-8">
      {/* Top Banner Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Welcome back, {data.profile.fullName}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Candidate Portal · ID: <strong className="font-mono text-slate-700">{data.profile.studentId}</strong>
        </p>
      </div>

      {/* Biometric Status Hero Banner */}
      <Card className={isApproved ? 'border-emerald-200 bg-emerald-50/30' : 'border-blue-200 bg-blue-50/30'}>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    isApproved
                      ? 'success'
                      : enrollment.status === 'PENDING_APPROVAL'
                      ? 'warning'
                      : 'neutral'
                  }
                >
                  {enrollment.status.replace('_', ' ')}
                </Badge>
                <span className="text-xs text-slate-500 font-mono">Profile Version v{enrollment.version}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">{enrollment.statusMessage}</h2>
              <p className="text-xs text-slate-600 max-w-xl">
                {isApproved
                  ? 'Your facial biometric reference is active. You may begin authorized examinations.'
                  : enrollment.status === 'PENDING_APPROVAL'
                  ? 'Your 5-angle captures have been submitted and are awaiting proctor review.'
                  : 'You must complete guided 5-angle facial enrollment before beginning online examinations.'}
              </p>
            </div>

            <div>
              {isApproved ? (
                <Link href="/enrollment">
                  <Button variant="secondary" size="sm">
                    Re-enroll Biometrics
                  </Button>
                </Link>
              ) : enrollment.status === 'PENDING_APPROVAL' ? (
                <Link href="/enrollment">
                  <Button variant="secondary" size="sm">
                    View Submission
                  </Button>
                </Link>
              ) : (
                <Link href="/enrollment">
                  <Button variant="primary" size="md" className="font-bold">
                    🚀 Start Face Enrollment
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: Exams & Verification History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Available Exams & Recent Sessions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Available Examinations */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Available Examinations</CardTitle>
                <span className="text-xs text-slate-400 font-medium">
                  {data.availableExams.length} Available
                </span>
              </div>
              <CardDescription>Official exams eligible for this candidate profile</CardDescription>
            </CardHeader>
            <CardContent>
              {data.availableExams.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No active examinations scheduled at this time.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.availableExams.map((exam) => (
                    <div key={exam.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">{exam.title}</h3>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>⏱️ {exam.durationMinutes} Minutes</span>
                          <span>•</span>
                          <span>📝 {exam.totalQuestions} Questions</span>
                        </div>
                        {exam.eligibilityReason && (
                          <div className="text-[11px] text-amber-700 font-medium mt-1">
                            ⚠️ {exam.eligibilityReason}
                          </div>
                        )}
                      </div>

                      {exam.canStart ? (
                        <Link href="/exams">
                          <Button variant="primary" size="sm">
                            Start Exam
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="secondary" size="sm" disabled>
                          Locked
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Previous Exam Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Previous Examination Sessions</CardTitle>
              <CardDescription>Your examination submission history</CardDescription>
            </CardHeader>
            <CardContent>
              {data.previousSessions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No previous examination sessions recorded.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {data.previousSessions.map((session) => (
                    <div key={session.id} className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-800">{session.examTitle}</span>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Started: {new Date(session.startedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="neutral">{session.status}</Badge>
                        {session.score !== null && session.score !== undefined && (
                          <div className="font-mono text-slate-700 text-[11px] mt-1 font-bold">
                            Score: {session.score} / {session.maxScore || 100}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Verification Summary & Notices */}
        <div className="space-y-6">
          {/* Verification Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Biometric Verification Summary</CardTitle>
              <CardDescription>Aggregate session verification outcomes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="text-2xl font-bold text-emerald-700">
                    {data.verificationSummary.successfulMatches}
                  </div>
                  <div className="text-[11px] text-emerald-800 font-medium mt-0.5">Successful Matches</div>
                </div>

                <div className="p-3 rounded-lg bg-rose-50 border border-rose-100">
                  <div className="text-2xl font-bold text-rose-700">
                    {data.verificationSummary.failedMatches}
                  </div>
                  <div className="text-[11px] text-rose-800 font-medium mt-0.5">Discrepancies</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Total Verification Cycles</span>
                <span className="font-mono font-bold text-slate-800">
                  {data.verificationSummary.totalAttempts}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Unverified / Occluded</span>
                <span className="font-mono font-medium text-slate-600">
                  {data.verificationSummary.unverified}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Previous Security Notices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security Notices</CardTitle>
              <CardDescription>System notices recorded during sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {data.previousWarnings.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  ✓ No security notices on your candidate record.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.previousWarnings.map((warn) => (
                    <div key={warn.id} className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="font-semibold text-amber-800">{warn.type.replace(/_/g, ' ')}</span>
                        {warn.examTitle && (
                          <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                            {warn.examTitle}
                          </span>
                        )}
                      </div>
                      <div className="text-amber-900/80 leading-relaxed">{warn.description}</div>
                      {warn.note && (
                        <div className="mt-1 text-[11px] text-amber-700/90 italic">{warn.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
