'use client';

import React from 'react';
import type { FaceAngle } from '@examguard/shared';

interface FaceGuideOverlayProps {
  targetAngle: FaceAngle;
  acceptable: boolean;
  status: 'idle' | 'requesting' | 'ready' | 'error';
}

export function FaceGuideOverlay({ targetAngle, acceptable, status }: FaceGuideOverlayProps) {
  if (status !== 'ready') return null;

  const strokeColor = acceptable ? '#10B981' : '#F59E0B'; // green-500 if acceptable, amber-500 if adjusting
  const fillColor = acceptable ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)';

  const angleInstructions: Record<FaceAngle, { label: string; icon: string }> = {
    FRONT: { label: 'Look directly at camera center', icon: '🎯' },
    LEFT: { label: 'Turn head slightly to your left', icon: '👈' },
    RIGHT: { label: 'Turn head slightly to your right', icon: '👉' },
    UP: { label: 'Tilt head slightly upward', icon: '👆' },
    DOWN: { label: 'Tilt head slightly downward', icon: '👇' },
  };

  const current = angleInstructions[targetAngle];

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
      {/* SVG Oval Guide */}
      <svg className="w-full h-full max-w-[320px] max-h-[400px]" viewBox="0 0 320 400">
        <defs>
          <mask id="oval-cutout">
            <rect width="100%" height="100%" fill="white" />
            <ellipse cx="160" cy="190" rx="95" ry="135" fill="black" />
          </mask>
        </defs>

        {/* Semi-transparent dark vignette outside oval */}
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.45)"
          mask="url(#oval-cutout)"
        />

        {/* Oval Boundary */}
        <ellipse
          cx="160"
          cy="190"
          rx="95"
          ry="135"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={acceptable ? '4' : '3'}
          strokeDasharray={acceptable ? 'none' : '6 4'}
          className="transition-colors duration-200"
        />
      </svg>

      {/* Target Angle Badge */}
      <div className="absolute bottom-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-sm border border-slate-700 text-white text-xs font-medium shadow-md">
        <span>{current.icon}</span>
        <span>{current.label}</span>
      </div>
    </div>
  );
}
