'use client';

import React from 'react';
import { VerificationSettingsDto, CreateVerificationSettingsDto } from '@examguard/shared';

export interface SettingsDiffProps {
  current: VerificationSettingsDto | null;
  proposed: CreateVerificationSettingsDto;
}

interface DiffRow {
  label: string;
  key: string;
  oldVal: any;
  newVal: any;
  isChanged: boolean;
}

export function SettingsDiff({ current, proposed }: SettingsDiffProps) {
  if (!current) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        Creating the initial verification configuration profile version.
      </div>
    );
  }

  const rows: DiffRow[] = [
    {
      label: 'Configuration Name',
      key: 'name',
      oldVal: current.name || '(Default)',
      newVal: proposed.name || '(Default)',
      isChanged: (current.name || '') !== (proposed.name || ''),
    },
    {
      label: 'Matching Threshold',
      key: 'thresholdPct',
      oldVal: `${current.thresholdPct.toFixed(1)}%`,
      newVal: `${proposed.thresholdPct.toFixed(1)}%`,
      isChanged: Math.abs(current.thresholdPct - proposed.thresholdPct) > 0.001,
    },
    {
      label: 'Verification Interval',
      key: 'intervalMs',
      oldVal: `${current.intervalMs} ms`,
      newVal: `${proposed.intervalMs} ms`,
      isChanged: current.intervalMs !== proposed.intervalMs,
    },
    {
      label: 'Consecutive Mismatch Limit',
      key: 'consecutiveMismatchLimit',
      oldVal: current.consecutiveMismatchLimit,
      newVal: proposed.consecutiveMismatchLimit,
      isChanged: current.consecutiveMismatchLimit !== proposed.consecutiveMismatchLimit,
    },
    {
      label: 'Missing Face Limit',
      key: 'missingFaceLimit',
      oldVal: current.missingFaceLimit,
      newVal: proposed.missingFaceLimit,
      isChanged: current.missingFaceLimit !== proposed.missingFaceLimit,
    },
    {
      label: 'Multiple Faces Policy',
      key: 'multipleFacesPolicy',
      oldVal: current.multipleFacesPolicy,
      newVal: proposed.multipleFacesPolicy,
      isChanged: current.multipleFacesPolicy !== proposed.multipleFacesPolicy,
    },
    {
      label: 'Multiple Faces Limit',
      key: 'multipleFacesConsecutiveLimit',
      oldVal: current.multipleFacesConsecutiveLimit,
      newVal: proposed.multipleFacesConsecutiveLimit,
      isChanged: current.multipleFacesConsecutiveLimit !== proposed.multipleFacesConsecutiveLimit,
    },
    {
      label: 'Camera Failure Policy',
      key: 'cameraFailurePolicy',
      oldVal: current.cameraFailurePolicy,
      newVal: proposed.cameraFailurePolicy,
      isChanged: current.cameraFailurePolicy !== proposed.cameraFailurePolicy,
    },
    {
      label: 'Camera Grace Period',
      key: 'cameraGraceSeconds',
      oldVal: `${current.cameraGraceSeconds}s`,
      newVal: `${proposed.cameraGraceSeconds}s`,
      isChanged: current.cameraGraceSeconds !== proposed.cameraGraceSeconds,
    },
    {
      label: 'Service Failure Limit',
      key: 'serviceFailureLimit',
      oldVal: current.serviceFailureLimit,
      newVal: proposed.serviceFailureLimit,
      isChanged: current.serviceFailureLimit !== proposed.serviceFailureLimit,
    },
    {
      label: 'Repeated Failure Limit',
      key: 'repeatedFailureLimit',
      oldVal: current.repeatedFailureLimit,
      newVal: proposed.repeatedFailureLimit,
      isChanged: current.repeatedFailureLimit !== proposed.repeatedFailureLimit,
    },
    {
      label: 'Pre-Exam Required Matches',
      key: 'preExamRequiredMatches',
      oldVal: current.preExamRequiredMatches,
      newVal: proposed.preExamRequiredMatches,
      isChanged: current.preExamRequiredMatches !== proposed.preExamRequiredMatches,
    },
    {
      label: 'Recovery Match Count',
      key: 'recoveryMatchCount',
      oldVal: current.recoveryMatchCount,
      newVal: proposed.recoveryMatchCount,
      isChanged: current.recoveryMatchCount !== proposed.recoveryMatchCount,
    },
    {
      label: 'Startup Grace Period',
      key: 'startupGraceSeconds',
      oldVal: `${current.startupGraceSeconds}s`,
      newVal: `${proposed.startupGraceSeconds}s`,
      isChanged: current.startupGraceSeconds !== proposed.startupGraceSeconds,
    },
  ];

  const changedRows = rows.filter((r) => r.isChanged);

  if (changedRows.length === 0) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 text-center">
        No parameter modifications detected compared to the currently active version (v{current.version}).
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
        <span className="text-xs font-bold text-slate-700">
          Parameter Differences Preview (v{current.version} → v{current.version + 1})
        </span>
        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
          {changedRows.length} {changedRows.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {changedRows.map((row) => (
          <div key={row.key} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
            <span className="font-medium text-slate-700">{row.label}</span>
            <div className="flex items-center gap-3 font-mono">
              <span className="text-rose-600 line-through bg-rose-50 px-1.5 py-0.5 rounded">
                {String(row.oldVal)}
              </span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                {String(row.newVal)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

