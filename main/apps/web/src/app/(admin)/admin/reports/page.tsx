'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'students' | 'exams' | 'incidents'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [examId, setExamId] = useState('');
  const [studentId, setStudentId] = useState('');

  // Report Data States
  const [overviewData, setOverviewData] = useState<any>(null);
  const [sessionsData, setSessionsData] = useState<any[]>([]);
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [examsData, setExamsData] = useState<any[]>([]);
  const [incidentsData, setIncidentsData] = useState<any>(null);

  const buildQuery = useCallback(
    (format = 'json') => {
      const p = new URLSearchParams();
      if (fromDate) p.set('from', new Date(fromDate).toISOString());
      if (toDate) p.set('to', new Date(toDate).toISOString());
      if (examId.trim()) p.set('examId', examId.trim());
      if (studentId.trim()) p.set('studentId', studentId.trim());
      p.set('format', format);
      return p.toString();
    },
    [fromDate, toDate, examId, studentId]
  );

  const fetchTabReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = buildQuery('json');
    try {
      if (activeTab === 'overview') {
        const res = await api.get<any>(`/admin/reports/overview?${q}`);
        setOverviewData(res.data);
      } else if (activeTab === 'sessions') {
        const res = await api.get<any[]>(`/admin/reports/sessions?${q}`);
        setSessionsData(res.data || []);
      } else if (activeTab === 'students') {
        const res = await api.get<any[]>(`/admin/reports/students?${q}`);
        setStudentsData(res.data || []);
      } else if (activeTab === 'exams') {
        const res = await api.get<any[]>(`/admin/reports/exams?${q}`);
        setExamsData(res.data || []);
      } else if (activeTab === 'incidents') {
        const res = await api.get<any>(`/admin/reports/incidents?${q}`);
        setIncidentsData(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [activeTab, buildQuery]);

  useEffect(() => {
    fetchTabReport();
  }, [fetchTabReport]);

  const handleExportCsv = () => {
    const q = buildQuery('csv');
    window.open(`/api/v1/admin/reports/${activeTab}?${q}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Reports & Analytics
          </h1>
          <p className="text-sm text-slate-500">
            Institutional verification metrics, session aggregations, and incident trends.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv}>
            📥 Download {activeTab.toUpperCase()} CSV
          </Button>
          <Button onClick={fetchTabReport} disabled={loading}>
            🔄 Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        {(['overview', 'sessions', 'students', 'exams', 'incidents'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">From Date</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Exam ID</label>
              <Input
                placeholder="Filter exam..."
                value={examId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExamId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Student ID / User ID</label>
              <Input
                placeholder="Filter student..."
                value={studentId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStudentId(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-200">
          {error}
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && overviewData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Continuous Attempts</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  {overviewData.totalAttempts.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-emerald-600">Match Rate</div>
                <div className="text-3xl font-extrabold text-emerald-700 mt-1">
                  {overviewData.matchPct}%
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {overviewData.matches.toLocaleString()} matches
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-rose-600">Mismatch Rate</div>
                <div className="text-3xl font-extrabold text-rose-700 mt-1">
                  {overviewData.mismatchPct}%
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {overviewData.mismatches.toLocaleString()} mismatches
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-amber-600">Unverified Rate</div>
                <div className="text-3xl font-extrabold text-amber-700 mt-1">
                  {overviewData.unverifiedPct}%
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {overviewData.unverified.toLocaleString()} frames
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Outcome Breakdown Chart / Visuals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Continuous Verification Outcome Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(overviewData.outcomeCounts as Record<string, number>).map(
                ([outcome, count]) => {
                  const pct =
                    overviewData.totalAttempts > 0
                      ? ((count / overviewData.totalAttempts) * 100).toFixed(1)
                      : '0';
                  return (
                    <div key={outcome} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-700">{outcome}</span>
                        <span className="text-slate-500">
                          {count.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full ${
                            outcome === 'MATCH'
                              ? 'bg-emerald-500'
                              : outcome === 'MISMATCH'
                              ? 'bg-rose-500'
                              : outcome === 'NO_FACE'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </CardContent>
          </Card>

          {/* Incidents by Type & Severity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incidents by Trigger Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(overviewData.incidentsByType as Record<string, number>).map(
                  ([type, count]) => (
                    <div key={type} className="flex justify-between py-1.5 border-b border-slate-100 text-xs">
                      <span className="font-medium text-slate-700">{type}</span>
                      <Badge variant="neutral">{count}</Badge>
                    </div>
                  )
                )}
                {Object.keys(overviewData.incidentsByType).length === 0 && (
                  <div className="text-xs text-slate-400 py-4 text-center">No incidents recorded in period</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incidents by Severity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(overviewData.incidentsBySeverity as Record<string, number>).map(
                  ([sev, count]) => (
                    <div key={sev} className="flex justify-between py-1.5 border-b border-slate-100 text-xs">
                      <span className="font-medium text-slate-700">{sev}</span>
                      <Badge
                        variant={
                          sev === 'CRITICAL'
                            ? 'danger'
                            : sev === 'HIGH'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {count}
                      </Badge>
                    </div>
                  )
                )}
                {Object.keys(overviewData.incidentsBySeverity).length === 0 && (
                  <div className="text-xs text-slate-400 py-4 text-center">No incidents recorded in period</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SESSIONS TAB */}
      {activeTab === 'sessions' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Exam</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Match %</TableHead>
                  <TableHead>Incidents</TableHead>
                  <TableHead>Disposition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      Loading sessions...
                    </TableCell>
                  </TableRow>
                ) : sessionsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      No sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessionsData.map((s) => (
                    <TableRow key={s.sessionId}>
                      <TableCell>
                        <div className="font-medium text-sm text-slate-900">{s.studentName}</div>
                        <div className="text-xs text-slate-400">{s.studentEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 max-w-[150px] truncate">{s.examTitle}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{s.durationMinutes} min</TableCell>
                      <TableCell className="text-xs font-mono">{s.totalAttempts}</TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-700">{s.matchPct}%</TableCell>
                      <TableCell>
                        {s.incidentCount > 0 ? (
                          <Badge variant="danger">{s.incidentCount}</Badge>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{s.finalDisposition}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* STUDENTS TAB */}
      {activeTab === 'students' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Match %</TableHead>
                  <TableHead>Mismatch %</TableHead>
                  <TableHead>Incidents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      Loading students report...
                    </TableCell>
                  </TableRow>
                ) : studentsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      No students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  studentsData.map((stu) => (
                    <TableRow key={stu.studentUserId}>
                      <TableCell className="font-mono text-xs">{stu.studentId}</TableCell>
                      <TableCell className="font-medium text-sm">{stu.fullName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{stu.email}</TableCell>
                      <TableCell className="text-xs">{stu.totalSessions}</TableCell>
                      <TableCell className="text-xs font-mono">{stu.totalAttempts}</TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-700">{stu.matchPct}%</TableCell>
                      <TableCell className="text-sm font-semibold text-rose-700">{stu.mismatchPct}%</TableCell>
                      <TableCell>
                        {stu.incidentCount > 0 ? (
                          <Badge variant="danger">{stu.incidentCount}</Badge>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* EXAMS TAB */}
      {activeTab === 'exams' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>Completion Rate</TableHead>
                  <TableHead>Avg Match %</TableHead>
                  <TableHead>Avg Duration</TableHead>
                  <TableHead>Total Incidents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      Loading exams report...
                    </TableCell>
                  </TableRow>
                ) : examsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      No exams found.
                    </TableCell>
                  </TableRow>
                ) : (
                  examsData.map((ex) => (
                    <TableRow key={ex.examId}>
                      <TableCell className="font-medium text-sm">{ex.title}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{ex.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{ex.sessionCount}</TableCell>
                      <TableCell className="text-xs">{ex.participants}</TableCell>
                      <TableCell className="text-xs font-semibold text-blue-700">{ex.completionRatePct}%</TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-700">{ex.avgMatchPct}%</TableCell>
                      <TableCell className="text-xs text-slate-500">{ex.avgDurationMinutes} min</TableCell>
                      <TableCell>
                        {ex.totalIncidents > 0 ? (
                          <Badge variant="danger">{ex.totalIncidents}</Badge>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* INCIDENTS TAB */}
      {activeTab === 'incidents' && incidentsData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Mean Time to Acknowledge</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  {incidentsData.meanTimeToAckMinutes} min
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-slate-500">Mean Time to Review</div>
                <div className="text-3xl font-extrabold text-slate-900 mt-1">
                  {incidentsData.meanTimeToReviewMinutes} min
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-medium text-amber-600">Reviewer False-Alarm Rate</div>
                <div className="text-3xl font-extrabold text-amber-700 mt-1">
                  {incidentsData.reviewerAssignedFalsePositiveRatePct}%
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Based on reviewer disposition (not ground truth)</div>
              </CardContent>
            </Card>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg">
            <strong>Institutional Disclaimer:</strong> {incidentsData.disclaimer}
          </div>
        </div>
      )}
    </div>
  );
}
