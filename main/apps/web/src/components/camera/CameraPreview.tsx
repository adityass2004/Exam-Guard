'use client';

import React from 'react';
import type { FaceAngle } from '@examguard/shared';
import type { CameraProblem, CameraStatus } from '../../hooks/useWebcam';
import { FaceGuideOverlay } from './FaceGuideOverlay';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: CameraProblem | null;
  targetAngle: FaceAngle;
  acceptable: boolean;
  onRetry: () => void;
}

export function CameraPreview({
  videoRef,
  status,
  error,
  targetAngle,
  acceptable,
  onRetry,
}: CameraPreviewProps) {
  return (
    <div className="relative w-full aspect-[4/3] max-w-lg mx-auto bg-slate-900 rounded-2xl overflow-hidden shadow-xl border border-slate-800">
      {/* Video Element: Mirrored only for display */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          status === 'ready' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Face Guide SVG Overlay */}
      <FaceGuideOverlay targetAngle={targetAngle} acceptable={acceptable} status={status} />

      {/* Loading state */}
      {status === 'requesting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-white">
          <Spinner size="lg" className="mb-3 text-blue-500 border-blue-500 border-t-transparent" />
          <p className="text-sm font-semibold">Requesting camera access...</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Please allow webcam permissions in your browser prompt to proceed with identity enrollment.
          </p>
        </div>
      )}

      {/* Stopped / Idle state */}
      {status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-white">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3 text-xl">
            📷
          </div>
          <p className="text-sm font-semibold">Camera is currently paused</p>
          <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
            Activate Camera
          </Button>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-white">
          <div className="w-12 h-12 rounded-full bg-rose-900/60 border border-rose-700 flex items-center justify-center mb-3 text-xl text-rose-300">
            🚫
          </div>
          <p className="text-sm font-bold text-rose-300 mb-1">{error.name}</p>
          <p className="text-xs text-slate-300 max-w-sm mb-4 leading-relaxed">{error.userInstruction}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry Connection
          </Button>
        </div>
      )}
    </div>
  );
}
