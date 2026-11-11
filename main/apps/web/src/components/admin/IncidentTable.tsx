'use client';

import React from 'react';
import Link from 'next/link';
import type { IncidentStatus, Severity, TriggerType, ReviewDisposition } from '@examguard/shared';

export interface IncidentListItem {
  id: string;
  incidentCode: string;
  sessionId: string;
  studentUserId: string;
  studentName?: string;
  studentEmail?: string;
  examId: string;
  examTitle?: string;
  triggerType: TriggerType;
  severity: Severity;
  status: IncidentStatus;
  disposition: ReviewDisposition | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  firstSimilarityPct: number | null;
  worstSimilarityPct: number | null;
  evidenceStatus: string;
  createdAt: string;
}

interface IncidentTableProps {
  incidents: IncidentListItem[];
  loading?: boolean;
}

export function IncidentTable({ incidents, loading }: IncidentTableProps) {
  const getSeverityBadge = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">MEDIUM</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">LOW</span>;
    }
  };

  const getStatusBadge = (status: IncidentStatus, disposition: ReviewDisposition | null) => {
    if (status === 'REVIEWED') {
      let dispColor = 'bg-slate-100 text-slate-700';
      if (disposition === 'CONFIRMED_CONCERN') dispColor = 'bg-rose-100 text-rose-800 border-rose-300';
      else if (disposition === 'FALSE_POSITIVE') dispColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      else if (disposition === 'INCONCLUSIVE') dispColor = 'bg-amber-100 text-amber-800 border-amber-300';

      return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${dispColor}`}>
          REVIEWED ({disposition || 'RESOLVED'})
        </span>
      );
    }

    if (status === 'ACKNOWLEDGED') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          ACKNOWLEDGED
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
        OPEN
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <th className="py-3 px-4">Incident Code</th>
              <th className="py-3 px-4">Detected At</th>
              <th className="py-3 px-4">Candidate</th>
              <th className="py-3 px-4">Trigger Condition</th>
              <th className="py-3 px-4 text-center">Severity</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></span>
                    <span>Loading security incidents...</span>
                  </div>
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  No security incidents matching current filters.
                </td>
              </tr>
            ) : (
              incidents.map((incident) => (
                <tr key={incident.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                    <Link
                      href={`/admin/incidents/${incident.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {incident.incidentCode}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{new Date(incident.firstDetectedAt).toLocaleDateString()}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {new Date(incident.firstDetectedAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{incident.studentName || 'Unknown Student'}</div>
                    <div className="text-slate-400 text-[11px] truncate max-w-xs">{incident.examTitle || 'Exam'}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800">{incident.triggerType.replace(/_/g, ' ')}</div>
                    <div className="text-[11px] text-slate-400">
                      Occurrences: {incident.occurrenceCount}
                      {incident.worstSimilarityPct !== null && ` • Worst: ${incident.worstSimilarityPct.toFixed(1)}%`}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getSeverityBadge(incident.severity)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getStatusBadge(incident.status, incident.disposition)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/admin/incidents/${incident.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-transparent rounded-lg transition-colors"
                    >
                      <span>Investigate</span>
                      <span>→</span>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
