'use client';

import React from 'react';

interface CaptureFeedbackProps {
  acceptable: boolean;
  hints: string[];
  reasons: string[];
  isLoading: boolean;
}

export function CaptureFeedback({ acceptable, hints, reasons, isLoading }: CaptureFeedbackProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        <span>Evaluating camera positioning...</span>
      </div>
    );
  }

  if (acceptable) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
        </span>
        <span>Position verified! Hold still and click Capture to save this angle.</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
      <div className="font-semibold flex items-center gap-1.5 text-amber-800">
        <span>⚠️</span>
        <span>Adjustment Required</span>
      </div>
      <ul className="list-disc list-inside space-y-0.5 text-amber-800/90 pl-1">
        {hints.length > 0 ? (
          hints.map((hint, idx) => <li key={idx}>{hint}</li>)
        ) : (
          <li>Adjust position until the face guide turns green.</li>
        )}
      </ul>
    </div>
  );
}
