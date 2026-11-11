'use client';

import React from 'react';
import { VerificationSettingsDto } from '@examguard/shared';
import { Badge } from '../../ui/Badge';

export interface SettingsHistoryProps {
  history: VerificationSettingsDto[];
  onSelectVersion?: (setting: VerificationSettingsDto) => void;
}

export function SettingsHistory({ history, onSelectVersion }: SettingsHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm bg-white rounded-xl border border-slate-200">
        No verification configuration history found.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Configuration Version History</h3>
          <p className="text-xs text-slate-500">
            Immutable log of all deployed verification thresholds and policies.
          </p>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          {history.length} {history.length === 1 ? 'version' : 'versions'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Threshold</th>
              <th className="py-3 px-4">Interval</th>
              <th className="py-3 px-4">Limits (Mism / Miss)</th>
              <th className="py-3 px-4">Created By</th>
              <th className="py-3 px-4">Change Note</th>
              <th className="py-3 px-4">Deployed At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((ver) => (
              <tr
                key={ver.id}
                onClick={() => onSelectVersion?.(ver)}
                className={`hover:bg-slate-50/80 transition ${
                  onSelectVersion ? 'cursor-pointer' : ''
                } ${ver.isActive ? 'bg-blue-50/30' : ''}`}
              >
                <td className="py-3 px-4 font-bold text-slate-900">v{ver.version}</td>
                <td className="py-3 px-4">
                  {ver.isActive ? (
                    <Badge variant="success" className="text-[10px]">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px] text-slate-500 bg-slate-100">
                      Inactive
                    </Badge>
                  )}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {ver.thresholdPct.toFixed(1)}%
                </td>
                <td className="py-3 px-4 text-slate-600">{ver.intervalMs}ms</td>
                <td className="py-3 px-4 text-slate-600">
                  {ver.consecutiveMismatchLimit} / {ver.missingFaceLimit}
                </td>
                <td className="py-3 px-4 text-slate-600">
                  <span className="font-medium text-slate-900">{ver.createdBy.fullName}</span>
                  <span className="block text-[10px] text-slate-400">{ver.createdBy.email}</span>
                </td>
                <td className="py-3 px-4 max-w-xs truncate text-slate-600" title={ver.changeNote || ''}>
                  {ver.changeNote || '—'}
                </td>
                <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                  {new Date(ver.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

