'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminDashboardData } from '@examguard/shared';
import { apiClient } from '../../../../lib/api-client';
import { StatCard } from '../../../../components/admin/StatCard';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';
import { Spinner } from '../../../../components/ui/Spinner';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<AdminDashboardData>('/admin/dashboard');
      if (res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Administrator Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time biometric health, active examination sessions, and candidate proctoring metrics.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchDashboard}
          disabled={loading}
          className="self-start sm:self-auto"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Data'}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400">
          <Spinner size="lg" className="mb-3" />
          <p className="text-sm">Calculating real-time database aggregates...</p>
        </div>
      ) : data ? (
        <>
          {/* Top 5 Primary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              title="Total Students"
              value={data.metrics.totalStudents}
              description="Registered student accounts"
              icon="🎓"
              color="default"
            />
            <StatCard
              title="Enrolled"
              value={data.metrics.enrolledCandidates}
              description="Approved face profiles"
              icon="✅"
              color="emerald"
            />
            <StatCard
              title="Pending Review"
              value={data.metrics.pendingEnrollmentApprovals}
              description="Enrollments awaiting approval"
              icon="⏳"
              color="amber"
            />
            <StatCard
              title="Active Exams"
              value={data.metrics.activeExams}
              description="Published exam tests"
              icon="📄"
              color="blue"
            />
            <StatCard
              title="Active Sessions"
              value={data.metrics.activeSessions}
              description="Students currently testing"
              icon="💻"
              color="purple"
            />
          </div>

          {/* Verification Aggregates Row */}
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Face Verification Health (Continuous & Pre-Exam)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Attempts"
                value={data.metrics.totalVerificationAttempts}
                description="All verification cycles logged"
                icon="🔍"
              />
              <StatCard
                title="Successful Matches"
                value={data.metrics.successfulVerifications}
                description="Outcome: MATCH"
                icon="🎯"
                color="emerald"
              />
              <StatCard
                title="Failed Matches"
                value={data.metrics.failedVerifications}
                description="Outcome: MISMATCH"
                icon="⚠️"
                color="rose"
              />
              <StatCard
                title="Unverified / Issues"
                value={data.metrics.unverifiedVerifications}
                description="No face, multi-face, camera error"
                icon="ℹ️"
                color="amber"
              />
            </div>
          </div>

          {/* Active Security Incidents Card */}
          <Card className={data.metrics.activeSecurityIncidents > 0 ? 'border-rose-300 bg-rose-50/30' : ''}>
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-3xl">🛡️</span>
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    Active Security Incidents:{' '}
                    <span className={data.metrics.activeSecurityIncidents > 0 ? 'text-rose-600' : 'text-slate-700'}>
                      {data.metrics.activeSecurityIncidents}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Defined as incidents currently OPEN or ACKNOWLEDGED awaiting proctor review.
                  </p>
                </div>
              </div>
              <Badge variant={data.metrics.activeSecurityIncidents > 0 ? 'danger' : 'success'}>
                {data.metrics.activeSecurityIncidents > 0 ? 'Attention Needed' : 'No Open Incidents'}
              </Badge>
            </CardContent>
          </Card>

          {/* Two Lists: Pending Approvals & Recent Admin Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending Approvals */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-bold">
                  Pending Enrollment Approvals
                </CardTitle>
                <Link
                  href="/admin/enrollments"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  View Queue →
                </Link>
              </CardHeader>
              <CardContent>
                {data.pendingApprovals.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No pending enrollments requiring administrative review.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.pendingApprovals.map((p) => (
                      <div key={p.profileId} className="py-3 flex items-center justify-between">
                        <div>
                          <Link
                            href={`/admin/students/${p.studentUserId}`}
                            className="font-semibold text-sm text-slate-900 hover:text-blue-600 transition-colors"
                          >
                            {p.fullName}
                          </Link>
                          <div className="text-xs text-slate-500">
                            ID: <span className="font-mono">{p.studentId}</span> · v{p.version} · {p.sampleCount} angles
                          </div>
                        </div>
                        <Link
                          href={`/admin/students/${p.studentUserId}`}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          Review →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Admin Actions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-bold">
                  Recent Administrator Activity
                </CardTitle>
                <Link
                  href="/admin/audit"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Full Audit Log →
                </Link>
              </CardHeader>
              <CardContent>
                {data.recentActions.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No recent administrative actions recorded yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.recentActions.map((action) => (
                      <div key={action.id} className="py-3 flex items-center justify-between">
                        <div className="min-w-0 pr-4">
                          <span className="font-semibold text-xs text-slate-800 block truncate">
                            {action.action}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate block">
                            {action.actorEmail || 'System'} · {action.entityType}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap font-mono">
                          {new Date(action.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
