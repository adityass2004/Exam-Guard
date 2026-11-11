'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

interface VerificationRow {
  id: string;
  sessionId: string;
  studentUserId: string;
  studentName?: string;
  studentEmail?: string;
  examId: string;
  examTitle?: string;
  sequenceNo: number;
  phase: string;
  outcome: string;
  errorCode: string;
  similarityRaw: number | null;
  similarityPct: number | null;
  thresholdPct: number;
  faceCount: number | null;
  visionMs: number | null;
  processingMs: number;
  clientCapturedAt: string | null;
  linkedIncidentCode: string | null;
  linkedTriggerType: string | null;
  createdAt: string;
}

interface SummaryData {
  totalAttempts: number;
  outcomeCounts: Record<string, number>;
  avgProcessingMs: number;
  p95ProcessingMs: number;
}

export default function VerificationHistoryPage() {
  const [items, setItems] = useState<VerificationRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<VerificationRow | null>(null);

  // Filters
  const [studentId, setStudentId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [outcome, setOutcome] = useState('ALL');
  const [phase, setPhase] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const buildQuery = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
      if (studentId.trim()) p.set('studentId', studentId.trim());
      if (sessionId.trim()) p.set('sessionId', sessionId.trim());
      if (outcome !== 'ALL') p.set('outcome', outcome);
      if (phase !== 'ALL') p.set('phase', phase);
      if (fromDate) p.set('from', new Date(fromDate).toISOString());
      if (toDate) p.set('to', new Date(toDate).toISOString());
      p.set('limit', '40');
      if (cursor) p.set('cursor', cursor);
      return p.toString();
    },
    [studentId, sessionId, outcome, phase, fromDate, toDate]
  );

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery();
      const [historyRes, summaryRes] = await Promise.all([
        api.get<VerificationRow[]>(`/admin/verifications?${q}`),
        api.get<SummaryData>(`/admin/verifications/summary?${q}`),
      ]);

      setItems(historyRes.data || []);
      setNextCursor(historyRes.meta?.nextCursor || null);
      setSummary(summaryRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load verification history');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = buildQuery(nextCursor);
      const res = await api.get<VerificationRow[]>(`/admin/verifications?${q}`);
      setItems((prev) => [...prev, ...(res.data || [])]);
      setNextCursor(res.meta?.nextCursor || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load more attempts');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExportCsv = () => {
    const q = buildQuery();
    window.open(`/api/v1/admin/verifications/export.csv?${q}`, '_blank');
  };

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'MATCH':
        return <Badge className="bg-emerald-600 text-white">MATCH</Badge>;
      case 'MISMATCH':
        return <Badge className="bg-rose-600 text-white">MISMATCH</Badge>;
      case 'NO_FACE':
        return <Badge className="bg-amber-600 text-white">NO FACE</Badge>;
      case 'MULTIPLE_FACES':
        return <Badge className="bg-purple-600 text-white">MULTI FACE</Badge>;
      default:
        return <Badge className="bg-slate-600 text-white">{outcome}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Verification History
          </h1>
          <p className="text-sm text-slate-500">
            Immutable log of continuous and pre-exam face verification attempts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv}>
            📥 Export CSV
          </Button>
          <Button onClick={fetchHistory} disabled={loading}>
            🔄 Refresh
          </Button>
        </div>
      </div>

      {/* Summary Strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500">Total Attempts</div>
              <div className="text-2xl font-bold text-slate-900">{summary.totalAttempts.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-emerald-600">Matches</div>
              <div className="text-2xl font-bold text-emerald-700">
                {(summary.outcomeCounts['MATCH'] || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-rose-600">Mismatches</div>
              <div className="text-2xl font-bold text-rose-700">
                {(summary.outcomeCounts['MISMATCH'] || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-amber-600">Unverified / Dropped</div>
              <div className="text-2xl font-bold text-amber-700">
                {(
                  summary.totalAttempts -
                  (summary.outcomeCounts['MATCH'] || 0) -
                  (summary.outcomeCounts['MISMATCH'] || 0)
                ).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500">Avg / P95 Latency</div>
              <div className="text-xl font-bold text-slate-900">
                {summary.avgProcessingMs}ms <span className="text-xs font-normal text-slate-400">/ {summary.p95ProcessingMs}ms</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Outcome</label>
              <Select value={outcome} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOutcome(e.target.value)}>
                <option value="ALL">All Outcomes</option>
                <option value="MATCH">MATCH</option>
                <option value="MISMATCH">MISMATCH</option>
                <option value="NO_FACE">NO_FACE</option>
                <option value="MULTIPLE_FACES">MULTIPLE_FACES</option>
                <option value="LOW_QUALITY_FRAME">LOW_QUALITY_FRAME</option>
                <option value="CAMERA_ERROR">CAMERA_ERROR</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Phase</label>
              <Select value={phase} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPhase(e.target.value)}>
                <option value="ALL">All Phases</option>
                <option value="CONTINUOUS">CONTINUOUS</option>
                <option value="PRE_EXAM">PRE_EXAM</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Session ID</label>
              <Input
                placeholder="Filter session..."
                value={sessionId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSessionId(e.target.value)}
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
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {error && (
            <div className="p-4 bg-rose-50 text-rose-700 text-sm border-b border-rose-200">
              {error}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time (UTC)</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Seq</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Similarity</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Incident</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                    Loading verification logs...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                    No verification attempts match current criteria.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedAttempt(row)}
                  >
                    <TableCell className="text-xs font-mono text-slate-500 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      <div>{row.studentName || 'Student'}</div>
                      <div className="text-xs text-slate-400">{row.studentEmail}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-[140px] truncate">
                      {row.examTitle || row.examId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">#{row.sequenceNo}</TableCell>
                    <TableCell className="text-xs text-slate-500">{row.phase}</TableCell>
                    <TableCell>{getOutcomeBadge(row.outcome)}</TableCell>
                    <TableCell className="text-sm font-semibold">
                      {row.similarityPct !== null ? `${row.similarityPct.toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{row.thresholdPct}%</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">
                      {row.processingMs}ms
                      {row.visionMs ? <span className="text-[10px] text-slate-400"> ({row.visionMs}ms cv)</span> : ''}
                    </TableCell>
                    <TableCell>
                      {row.linkedIncidentCode ? (
                        <Badge variant="danger" className="font-mono text-[10px]">
                          {row.linkedIncidentCode}
                        </Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {nextCursor && (
            <div className="p-4 border-t border-slate-100 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full sm:w-auto"
              >
                {loadingMore ? 'Loading...' : 'Load More Attempts'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attempt Detail Modal / Side Panel */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-xl w-full bg-white shadow-2xl animate-in fade-in-50">
            <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">
                Verification Attempt #{selectedAttempt.sequenceNo}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAttempt(null)}
              >
                ✕
              </Button>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">Outcome</span>
                  {getOutcomeBadge(selectedAttempt.outcome)}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Timestamp</span>
                  <span className="font-mono text-xs text-slate-700">
                    {new Date(selectedAttempt.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Similarity Score</span>
                  <span className="font-bold text-slate-900">
                    {selectedAttempt.similarityPct !== null
                      ? `${selectedAttempt.similarityPct.toFixed(1)}%`
                      : 'N/A'}{' '}
                    (Raw: {selectedAttempt.similarityRaw?.toFixed(3) ?? 'N/A'})
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Threshold Enforced</span>
                  <span className="font-semibold text-slate-700">
                    {selectedAttempt.thresholdPct}%
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Student</span>
                  <span className="font-medium text-slate-900">{selectedAttempt.studentName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Email</span>
                  <span className="text-slate-700">{selectedAttempt.studentEmail}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Exam Title</span>
                  <span className="text-slate-700">{selectedAttempt.examTitle}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Session ID</span>
                  <span className="font-mono text-xs text-slate-600">{selectedAttempt.sessionId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Detected Faces</span>
                  <span className="text-slate-900">{selectedAttempt.faceCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Vision Latency</span>
                  <span className="font-mono text-slate-900">{selectedAttempt.visionMs ?? 0} ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Total API Processing</span>
                  <span className="font-mono text-slate-900">{selectedAttempt.processingMs} ms</span>
                </div>
                {selectedAttempt.linkedIncidentCode && (
                  <div className="flex justify-between py-1 border-b border-slate-100 bg-rose-50 px-2 rounded">
                    <span className="text-rose-700 font-semibold">Incident Created</span>
                    <span className="font-mono font-bold text-rose-800">
                      {selectedAttempt.linkedIncidentCode} ({selectedAttempt.linkedTriggerType})
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setSelectedAttempt(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
