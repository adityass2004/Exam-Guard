'use client';

import React, { useState } from 'react';
import type { FaceImageDto } from '@examguard/shared';
import { Badge } from '../ui/Badge';

export interface AngleImageProps {
  image?: FaceImageDto | null;
  label?: string;
  onClick?: () => void;
  showQuality?: boolean;
}

/**
 * Renders an authorized enrollment photograph with loading skeleton,
 * fallback on error/tamper/missing file, and strict image attributes.
 *
 * Security note: referrerPolicy="no-referrer" and draggable={false} prevent
 * ambient referrer leakage and casual dragging, though client screenshots
 * remain inherently possible once rendered.
 */
export function AngleImage({
  image,
  label,
  onClick,
  showQuality = true,
}: AngleImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const angleLabel = label || image?.angle || 'Unknown';

  if (!image) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-slate-100 rounded-xl border-2 border-dashed border-slate-200 aspect-[4/3] text-center">
        <span className="text-2xl mb-1 text-slate-400">📷</span>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {angleLabel}
        </span>
        <span className="text-[11px] text-slate-400 mt-0.5">Not captured</span>
      </div>
    );
  }

  const quality = image.quality as any;
  const blurScore = quality?.blurScore !== undefined ? Math.round(quality.blurScore) : null;
  const luminance = quality?.luminance !== undefined ? Math.round(quality.luminance) : null;

  return (
    <div className="group relative flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300">
      {/* Top Header */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 tracking-wider">
          {angleLabel}
        </span>
        <span className="text-[10px] text-slate-400 font-mono">
          {image.width}×{image.height}
        </span>
      </div>

      {/* Image / Fallback Container */}
      <div
        className="relative aspect-[4/3] bg-slate-900 cursor-pointer overflow-hidden flex items-center justify-center"
        onClick={() => {
          if (!error && onClick) onClick();
        }}
        title={!error ? 'Click to inspect full resolution in lightbox' : 'Image unavailable'}
      >
        {/* Loading skeleton */}
        {loading && !error && (
          <div className="absolute inset-0 bg-slate-800 animate-pulse flex items-center justify-center">
            <span className="text-xs text-slate-400">Loading secure photo...</span>
          </div>
        )}

        {/* Error Fallback Placeholder */}
        {error ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400">
            <span className="text-2xl mb-1 text-rose-500">⚠️</span>
            <span className="text-xs font-semibold text-rose-400">Image unavailable</span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-[140px]">
              Access denied or file integrity check failed
            </span>
          </div>
        ) : (
          /* Authorized image stream */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image.authorizedImageUrl}
            alt={`Candidate enrollment capture - ${angleLabel}`}
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
            className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 select-none ${
              loading ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}

        {/* Hover overlay hint */}
        {!error && !loading && (
          <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="px-2.5 py-1 bg-slate-900/80 text-white rounded text-xs font-medium backdrop-blur-sm">
              🔍 Inspect
            </span>
          </div>
        )}
      </div>

      {/* Quality metadata */}
      {showQuality && quality && (
        <div className="p-2.5 bg-white text-[11px] space-y-1 border-t border-slate-100">
          <div className="flex items-center justify-between text-slate-500">
            <span>Sharpness:</span>
            <span className="font-mono font-medium text-slate-700">
              {blurScore !== null ? `${blurScore} Laplacian` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Luminance:</span>
            <span className="font-mono font-medium text-slate-700">
              {luminance !== null ? `${luminance} / 255` : 'N/A'}
            </span>
          </div>
          {quality.reasons && quality.reasons.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-1">
              {quality.reasons.map((r: string) => (
                <Badge key={r} variant="warning" className="text-[9px] py-0">
                  {r}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
