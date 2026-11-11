'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { WsEnvelope } from '@examguard/shared';

export interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  incidentId?: string;
  timestamp: string;
}

interface AlertFeedProps {
  latestEnvelope: WsEnvelope | null;
  maxItems?: number;
}

export function AlertFeed({ latestEnvelope, maxItems = 10 }: AlertFeedProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play short subtle beep on critical alert if enabled
  const playAlertSound = (severity?: string) => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = severity === 'CRITICAL' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(severity === 'CRITICAL' ? 880 : 520, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio autoplay policy or device error ignored
    }
  };

  useEffect(() => {
    if (!latestEnvelope) return;

    let newAlert: AlertItem | null = null;
    const nowStr = new Date().toLocaleTimeString();

    if (latestEnvelope.type === 'incident.opened') {
      const p = latestEnvelope.payload;
      newAlert = {
        id: `open-${p.incidentId}-${latestEnvelope.eventId}`,
        type: 'incident.opened',
        title: `🚨 Incident Detected: ${p.triggerType.replace(/_/g, ' ')}`,
        message: `${p.studentName || 'Candidate'} (${p.examTitle || 'Exam'}) • Severity: ${p.severity}`,
        severity: p.severity,
        incidentId: p.incidentId,
        timestamp: nowStr,
      };
      playAlertSound(p.severity);
    } else if (latestEnvelope.type === 'incident.recovered') {
      const p = latestEnvelope.payload;
      newAlert = {
        id: `rec-${p.incidentId}-${latestEnvelope.eventId}`,
        type: 'incident.recovered',
        title: `✅ Incident Recovered: ${p.incidentCode}`,
        message: `${p.triggerType.replace(/_/g, ' ')} condition returned to normal`,
        incidentId: p.incidentId,
        timestamp: nowStr,
      };
    } else if (latestEnvelope.type === 'system.warning') {
      const p = latestEnvelope.payload;
      newAlert = {
        id: `warn-${latestEnvelope.eventId}`,
        type: 'system.warning',
        title: `⚠️ System Warning: ${p.code}`,
        message: p.message,
        severity: 'HIGH',
        timestamp: nowStr,
      };
      playAlertSound('HIGH');
    }

    if (newAlert) {
      setAlerts((prev) => [newAlert!, ...prev.slice(0, maxItems - 1)]);
    }
  }, [latestEnvelope, maxItems]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAll = () => {
    setAlerts([]);
  };

  const getSeverityBadgeClass = (severity?: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'HIGH':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <h3 className="font-semibold text-slate-800 text-sm">Real-Time Alert Feed</h3>
          {alerts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
              {alerts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 font-medium ${
              soundEnabled
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
            title={soundEnabled ? 'Audio alerts enabled' : 'Audio alerts muted'}
          >
            <span>{soundEnabled ? '🔊 Sound On' : '🔇 Muted'}</span>
          </button>
          {alerts.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No live alerts received. Monitoring stream is active.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="px-5 py-3 hover:bg-slate-50 transition-colors flex items-start justify-between gap-4"
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {alert.title}
                  </span>
                  {alert.severity && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getSeverityBadgeClass(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">{alert.timestamp}</span>
                </div>
                <p className="text-xs text-slate-600 truncate">{alert.message}</p>
                {alert.incidentId && (
                  <Link
                    href={`/admin/incidents/${alert.incidentId}`}
                    className="inline-block text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline pt-0.5"
                  >
                    Investigate Incident →
                  </Link>
                )}
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-slate-400 hover:text-slate-600 text-sm px-1 font-bold"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
