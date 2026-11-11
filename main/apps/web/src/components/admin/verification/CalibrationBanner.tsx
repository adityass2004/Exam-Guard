'use client';

import React from 'react';

export interface CalibrationBannerProps {
  thresholdPct?: number;
}

export function CalibrationBanner({ thresholdPct = 75.0 }: CalibrationBannerProps) {
  return (
    <aside
      aria-label="Vision Model Calibration and Limitations"
      className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 text-amber-900 space-y-2.5 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">
          ⚠️
        </span>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
            <span>Vision Core Calibration Status:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-200 text-amber-900 uppercase tracking-wider">
              PROVISIONAL
            </span>
          </h3>
          <p className="text-xs text-amber-800 leading-relaxed">
            The face verification engine utilizes the <strong>InsightFace Buffalo_L</strong> model
            (512-dimensional arcface embedding space). A matching threshold of{' '}
            <strong>{thresholdPct.toFixed(1)}%</strong> cosine similarity is currently active.
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-amber-200/80 text-xs text-amber-800 space-y-1 pl-8">
        <p>
          <strong>Notice on Liveness & Spoofing Limitations:</strong> Buffalo_L performs face
          detection, alignment, and representation mapping, but <em>does not</em> include hardware
          depth sensors or passive presentation attack detection (PAD). Printed photographs, digital
          displays, or masks may not be recognized as fraudulent.
        </p>
        <p className="text-[11px] text-amber-700">
          Threshold adjustments take effect only for newly initialized examination sessions.
          Active sessions retain immutable snapshots of their initial configuration.
        </p>
      </div>
    </aside>
  );
}

