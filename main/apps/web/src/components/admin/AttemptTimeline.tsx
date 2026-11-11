'use client';

import React from 'react';

export interface TimelineLogItem {
  id: string;
  sequenceNo: number;
  outcome: string;
  errorCode: string;
  similarityPct: number | null;
  thresholdPct: number;
  timestamp: string;
  isTriggerAttempt?: boolean;
}

interface AttemptTimelineProps {
  logs: TimelineLogItem[];
  incidentCode: string;
}

export function AttemptTimeline({ logs, incidentCode }: AttemptTimelineProps) {
  const getOutcomeBadge = (outcome: string, isTrigger?: boolean) => {
    let classes = 'bg-slate-100 text-slate-700';
    if (outcome === 'MATCH') classes = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    else if (outcome === 'MISMATCH') classes = 'bg-rose-100 text-rose-800 border-rose-300';
    else if (outcome === 'NO_FACE') classes = 'bg-amber-100 text-amber-800 border-amber-300';
    else if (outcome === 'MULTIPLE_FACES') classes = 'bg-purple-100 text-purple-800 border-purple-300';
    else if (outcome === 'CAMERA_ERROR') classes = 'bg-orange-100 text-orange-800 border-orange-300';

    return (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${classes} ${
          isTrigger ? 'ring-2 ring-rose-500 ring-offset-1' : ''
        }`}
      >
        {outcome}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <span>⏱️</span>
            <span>Verification Sequence Timeline</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Temporal window of verification attempts surrounding incident {incidentCode}
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {logs.length} logged attempt{logs.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <th className="py-2.5 px-4 w-16">Seq #</th>
              <th className="py-2.5 px-4">Time</th>
              <th className="py-2.5 px-4">Outcome</th>
              <th className="py-2.5 px-4">Similarity Score</th>
              <th className="py-2.5 px-4">Threshold</th>
              <th className="py-2.5 px-4 text-right">Event Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No timeline verification logs recorded for this window.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isTrigger = !!log.isTriggerAttempt;
                return (
                  <tr
                    key={log.id}
                    className={`transition-colors ${
                      isTrigger
                        ? 'bg-rose-50/70 font-semibold'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                      #{log.sequenceNo}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-4">
                      {getOutcomeBadge(log.outcome, isTrigger)}
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      {log.similarityPct !== null ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              log.similarityPct >= log.thresholdPct
                                ? 'text-emerald-600 font-bold'
                                : 'text-rose-600 font-bold'
                            }
                          >
                            {log.similarityPct.toFixed(1)}%
                          </span>
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                log.similarityPct >= log.thresholdPct
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, log.similarityPct))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      {log.thresholdPct}%
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {isTrigger ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full">
                          <span>🚨</span>
                          <span>TRIGGER ATTEMPT</span>
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px] font-mono">--</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
