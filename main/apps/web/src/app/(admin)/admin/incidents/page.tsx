'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '../../../../lib/api-client';
import { IncidentTable, IncidentListItem } from '../../../../components/admin/IncidentTable';
import type { IncidentStatus, Severity } from '@examguard/shared';

export default function IncidentsPage() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams?.get('sessionId') || '';

  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [sessionId, setSessionId] = useState(initialSessionId);

  const fetchIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      if (sessionId.trim()) params.set('sessionId', sessionId.trim());
      params.set('limit', '50');

      const res = await apiClient<{
        data: IncidentListItem[];
        meta: { nextCursor: string | null };
      }>(`/api/v1/admin/incidents?${params.toString()}`);

      setIncidents(res.data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load security incidents');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, sessionId]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Security Incidents & Flagged Events
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Investigate automated security triggers, physical identity mismatches, and camera anomalies
          </p>
        </div>

        <button
          onClick={fetchIncidents}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
        >
          {loading ? 'Refreshing...' : '↻ Refresh Incidents'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">OPEN (Needs Review)</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="REVIEWED">REVIEWED</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Severity
            </label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="text-xs rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Session Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Session ID
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Filter by session UUID..."
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="text-xs rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800 w-48 font-mono"
              />
              {sessionId && (
                <button
                  onClick={() => setSessionId('')}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1 font-bold"
                  title="Clear session filter"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total Flagged: <strong className="text-slate-900">{incidents.length}</strong>
        </div>
      </div>

      {/* Incidents Table */}
      <IncidentTable incidents={incidents} loading={loading} />
    </div>
  );
}
