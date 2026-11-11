'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Severity } from '@examguard/shared';
import { CancelSessionDialog } from './CancelSessionDialog';

export interface MonitoringSessionItem {
  sessionId: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  examId: string;
  examTitle: string;
  status: string;
  startedAt: string | null;
  expiresAt: string | null;
  lastSeenAt: string | null;
  signalHealth: 'OK' | 'STALE' | 'NO_SIGNAL';
  latestOutcome: string | null;
  latestSimilarityPct: number | null;
  totalAttempts: number;
  successfulMatches: number;
  failedMatches: number;
  unverified: number;
  activeIncidentsCount: number;
  highestActiveSeverity: Severity | null;
}

interface LiveSessionsTableProps {
  sessions: MonitoringSessionItem[];
  onRefresh?: () => void;
}

export function LiveSessionsTable({ sessions, onRefresh }: LiveSessionsTableProps) {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<'ALL' | 'OK' | 'STALE' | 'NO_SIGNAL'>('ALL');
  const [cancellingSession, setCancellingSession] = useState<MonitoringSessionItem | null>(null);

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((s) => {
        if (healthFilter !== 'ALL' && s.signalHealth !== healthFilter) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = s.studentName.toLowerCase().includes(q);
          const matchEmail = s.studentEmail.toLowerCase().includes(q);
          const matchId = s.studentId.toLowerCase().includes(q);
          const matchExam = s.examTitle.toLowerCase().includes(q);
          return matchName || matchEmail || matchId || matchExam;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort highest severity first
        const severityRank = (sev: Severity | null) => {
          if (sev === 'CRITICAL') return 4;
          if (sev === 'HIGH') return 3;
          if (sev === 'MEDIUM') return 2;
          if (sev === 'LOW') return 1;
          return 0;
        };
        const rankDiff = severityRank(b.highestActiveSeverity) - severityRank(a.highestActiveSeverity);
        if (rankDiff !== 0) return rankDiff;
        return (b.activeIncidentsCount || 0) - (a.activeIncidentsCount || 0);
      });
  }, [sessions, search, healthFilter]);

  const getSignalBadge = (health: 'OK' | 'STALE' | 'NO_SIGNAL') => {
    switch (health) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Signal OK
          </span>
        );
      case 'STALE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Stale Signal
          </span>
        );
      case 'NO_SIGNAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            No Signal
          </span>
        );
    }
  };

  const getSeverityBadge = (severity: Severity | null, count: number) => {
    if (count === 0 || !severity) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          None
        </span>
      );
    }

    let colorClasses = 'bg-blue-100 text-blue-800 border-blue-200';
    if (severity === 'CRITICAL') colorClasses = 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse';
    else if (severity === 'HIGH') colorClasses = 'bg-amber-100 text-amber-800 border-amber-300';
    else if (severity === 'MEDIUM') colorClasses = 'bg-yellow-100 text-yellow-800 border-yellow-300';

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${colorClasses}`}>
        <span>⚠️</span>
        <span>{count} ({severity})</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search candidate, ID, or exam..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs sm:text-sm rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64"
          />
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as any)}
            className="text-xs sm:text-sm rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-700"
          >
            <option value="ALL">All Signals</option>
            <option value="OK">Signal OK</option>
            <option value="STALE">Stale Signals</option>
            <option value="NO_SIGNAL">Lost Signals</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-semibold text-slate-900">{filteredSessions.length}</span> active session{filteredSessions.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <th className="py-3 px-4">Candidate</th>
              <th className="py-3 px-4">Exam</th>
              <th className="py-3 px-4">Signal Health</th>
              <th className="py-3 px-4">Latest Outcome</th>
              <th className="py-3 px-4 text-center">Score</th>
              <th className="py-3 px-4 text-center">Active Incidents</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                  No active examination sessions matching criteria.
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.sessionId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 text-sm">{session.studentName}</div>
                    <div className="text-slate-400 text-[11px]">{session.studentId} • {session.studentEmail}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    <div className="font-medium truncate max-w-xs">{session.examTitle}</div>
                    <div className="text-[11px] text-slate-400">
                      Started: {session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : 'N/A'}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {getSignalBadge(session.signalHealth)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {session.latestOutcome || 'PENDING'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {session.latestSimilarityPct !== null ? (
                      <span
                        className={`font-semibold font-mono ${
                          session.latestSimilarityPct >= 75
                            ? 'text-emerald-600'
                            : session.latestSimilarityPct >= 50
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {session.latestSimilarityPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getSeverityBadge(session.highestActiveSeverity, session.activeIncidentsCount)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/incidents?sessionId=${session.sessionId}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline px-2 py-1"
                      >
                        Incidents
                      </Link>
                      <button
                        onClick={() => setCancellingSession(session)}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {cancellingSession && (
        <CancelSessionDialog
          sessionId={cancellingSession.sessionId}
          studentName={cancellingSession.studentName}
          examTitle={cancellingSession.examTitle}
          isOpen={true}
          onClose={() => setCancellingSession(null)}
          onSuccess={() => {
            setCancellingSession(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
