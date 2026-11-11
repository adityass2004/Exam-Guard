'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { useAdminSocket } from '../../../../hooks/useAdminSocket';
import { ConnectionIndicator } from '../../../../components/admin/ConnectionIndicator';
import { AlertFeed } from '../../../../components/admin/AlertFeed';
import { LiveSessionsTable, MonitoringSessionItem } from '../../../../components/admin/LiveSessionsTable';
import { StatCard } from '../../../../components/admin/StatCard';
import type { WsEnvelope } from '@examguard/shared';

export default function LiveMonitoringPage() {
  const [sessions, setSessions] = useState<MonitoringSessionItem[]>([]);
  const [counts, setCounts] = useState({
    totalActive: 0,
    inProgress: 0,
    pendingVerification: 0,
    criticalIncidents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch REST snapshot
  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await apiClient<{
        data: {
          inProgress: MonitoringSessionItem[];
          pendingVerification: MonitoringSessionItem[];
          counts: {
            totalActive: number;
            inProgress: number;
            pendingVerification: number;
            criticalIncidents: number;
          };
          serverNow: string;
        };
      }>('/api/v1/admin/monitoring/sessions');

      setSessions(res.data.inProgress || []);
      setCounts(res.data.counts);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch live monitoring snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Handle incoming WebSocket live events
  const handleWsEvent = useCallback((envelope: WsEnvelope) => {
    if (envelope.type === 'session.updated') {
      const p = envelope.payload;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId === p.sessionId) {
            return {
              ...s,
              totalAttempts: p.totalAttempts,
              successfulMatches: p.matchCount,
              failedMatches: p.mismatchCount,
              latestOutcome: p.lastOutcome,
              latestSimilarityPct: p.lastSimilarityPct,
              lastSeenAt: p.lastSeenAt,
              signalHealth: 'OK',
            };
          }
          return s;
        })
      );
    } else if (envelope.type === 'session.started') {
      // Re-fetch snapshot to get full joined metadata
      fetchSnapshot();
    } else if (envelope.type === 'session.ended') {
      const p = envelope.payload;
      setSessions((prev) => prev.filter((s) => s.sessionId !== p.sessionId));
      setCounts((prev) => ({
        ...prev,
        totalActive: Math.max(0, prev.totalActive - 1),
        inProgress: Math.max(0, prev.inProgress - 1),
      }));
    } else if (envelope.type === 'incident.opened') {
      const p = envelope.payload;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId === p.sessionId) {
            return {
              ...s,
              activeIncidentsCount: (s.activeIncidentsCount || 0) + 1,
              highestActiveSeverity:
                s.highestActiveSeverity === 'CRITICAL' || p.severity === 'CRITICAL'
                  ? 'CRITICAL'
                  : p.severity,
            };
          }
          return s;
        })
      );
      if (p.severity === 'CRITICAL') {
        setCounts((prev) => ({
          ...prev,
          criticalIncidents: prev.criticalIncidents + 1,
        }));
      }
    } else if (envelope.type === 'incident.recovered') {
      const p = envelope.payload;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId === p.sessionId) {
            const nextCount = Math.max(0, (s.activeIncidentsCount || 1) - 1);
            return {
              ...s,
              activeIncidentsCount: nextCount,
              highestActiveSeverity: nextCount === 0 ? null : s.highestActiveSeverity,
            };
          }
          return s;
        })
      );
    }
  }, [fetchSnapshot]);

  // 3. Connect WebSocket with auto-reconnect
  const { status, reconnectCount, latestEvent, connect } = useAdminSocket({
    autoConnect: true,
    onEvent: handleWsEvent,
    onReconnect: fetchSnapshot, // Catch-up snapshot on reconnect
  });

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const healthyCount = sessions.filter((s) => s.signalHealth === 'OK').length;
  const staleOrLostCount = sessions.filter((s) => s.signalHealth !== 'OK').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Live Proctoring & Monitoring
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time biometric telemetry, candidate signals, and incident detection stream
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionIndicator
            status={status}
            reconnectCount={reconnectCount}
            onReconnect={connect}
          />
          <button
            onClick={fetchSnapshot}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Sessions"
          value={counts.totalActive}
          icon="👥"
          description={`${counts.inProgress} in exam, ${counts.pendingVerification} in verification`}
          color="blue"
        />
        <StatCard
          title="Critical Incidents"
          value={counts.criticalIncidents}
          icon="🚨"
          description={counts.criticalIncidents > 0 ? 'Requires immediate supervisor review' : 'No open critical alerts'}
          color={counts.criticalIncidents > 0 ? 'rose' : 'default'}
        />
        <StatCard
          title="Healthy Camera Signals"
          value={healthyCount}
          icon="🟢"
          description="Continuous video ping received within 15s"
          color="emerald"
        />
        <StatCard
          title="Stale / Lost Signals"
          value={staleOrLostCount}
          icon="⚠️"
          description={staleOrLostCount > 0 ? 'Possible network or camera interruption' : 'All camera feeds streaming'}
          color={staleOrLostCount > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* Real-time Alerts Feed */}
      <AlertFeed latestEnvelope={latestEvent} />

      {/* Live Proctoring Session Grid/Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">Active Examination Telemetry</h2>
          <span className="text-xs text-slate-500 font-mono">
            Auto-refreshed via WebSocket
          </span>
        </div>
        <LiveSessionsTable sessions={sessions} onRefresh={fetchSnapshot} />
      </div>
    </div>
  );
}
