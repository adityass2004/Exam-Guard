'use client';

import React, { useEffect, useState } from 'react';
import { Badge } from '../ui/Badge';
import { VerificationStatusCode } from '@examguard/shared';

export type UiVerificationStatusCode =
  | VerificationStatusCode
  | 'CHECKING'
  | 'CAMERA_OFFLINE';

export interface IdentityStatusPanelProps {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isActive?: boolean;
  statusCode?: UiVerificationStatusCode;
  studentMessage?: string;
  activeWarning?: boolean;
  secondsSinceLastCheck?: number;
  isVerifying?: boolean;
  cameraLost?: boolean;
}

interface StatusConfig {
  badgeLabel: string;
  badgeVariant: 'success' | 'warning' | 'danger' | 'default';
  indicatorColor: string;
  borderColor: string;
}

const STATUS_CONFIGS: Record<UiVerificationStatusCode, StatusConfig> = {
  IDENTITY_VERIFIED: {
    badgeLabel: 'Verified',
    badgeVariant: 'success',
    indicatorColor: 'bg-emerald-500',
    borderColor: 'border-emerald-500/40',
  },
  CHECKING: {
    badgeLabel: 'Checking...',
    badgeVariant: 'default',
    indicatorColor: 'bg-blue-500',
    borderColor: 'border-blue-500/30',
  },
  FACE_NOT_DETECTED: {
    badgeLabel: 'Face Not Detected',
    badgeVariant: 'warning',
    indicatorColor: 'bg-amber-500',
    borderColor: 'border-amber-500/50',
  },
  MULTIPLE_FACES: {
    badgeLabel: 'Multiple Faces',
    badgeVariant: 'warning',
    indicatorColor: 'bg-amber-500',
    borderColor: 'border-amber-500/50',
  },
  IDENTITY_NOT_CONFIRMED: {
    badgeLabel: 'Verification Failed',
    badgeVariant: 'danger',
    indicatorColor: 'bg-rose-500',
    borderColor: 'border-rose-500/50',
  },
  IMAGE_UNCLEAR: {
    badgeLabel: 'Image Unclear',
    badgeVariant: 'warning',
    indicatorColor: 'bg-amber-500',
    borderColor: 'border-amber-500/50',
  },
  CAMERA_PROBLEM: {
    badgeLabel: 'Camera Problem',
    badgeVariant: 'danger',
    indicatorColor: 'bg-rose-500',
    borderColor: 'border-rose-500/50',
  },
  CAMERA_OFFLINE: {
    badgeLabel: 'Camera Offline',
    badgeVariant: 'danger',
    indicatorColor: 'bg-rose-500',
    borderColor: 'border-rose-500/50',
  },
  SERVICE_UNAVAILABLE: {
    badgeLabel: 'Service Degraded',
    badgeVariant: 'warning',
    indicatorColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500/40',
  },
};

export function IdentityStatusPanel({
  videoRef,
  isActive = false,
  statusCode = 'CHECKING',
  studentMessage,
  activeWarning = false,
  secondsSinceLastCheck = 0,
  isVerifying = false,
  cameraLost = false,
}: IdentityStatusPanelProps) {
  // Visual debouncing: prevent transient 1-tick flickering
  const [debouncedStatus, setDebouncedStatus] = useState<UiVerificationStatusCode>(statusCode);
  const [debouncedMessage, setDebouncedMessage] = useState<string>(
    studentMessage || 'Identity Monitor Active'
  );

  useEffect(() => {
    // Immediate update for verified, camera offline, or serious warnings
    if (
      statusCode === 'IDENTITY_VERIFIED' ||
      statusCode === 'CAMERA_OFFLINE' ||
      statusCode === 'CAMERA_PROBLEM' ||
      statusCode === 'IDENTITY_NOT_CONFIRMED' ||
      cameraLost
    ) {
      setDebouncedStatus(statusCode);
      if (studentMessage) setDebouncedMessage(studentMessage);
      return;
    }

    // Debounce short-lived transients (e.g. slight movement)
    const handler = setTimeout(() => {
      setDebouncedStatus(statusCode);
      if (studentMessage) setDebouncedMessage(studentMessage);
    }, 300);

    return () => clearTimeout(handler);
  }, [statusCode, studentMessage, cameraLost]);

  if (!isActive) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-xs font-semibold text-slate-200">Identity Monitor</span>
          </div>
          <Badge variant="default" className="text-[10px] bg-slate-800 text-slate-300 border-slate-700">
            Standby
          </Badge>
        </div>

        <div className="relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
          {videoRef ? (
            <video
              ref={videoRef as any}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover mirror"
            />
          ) : (
            <div className="text-slate-500 text-xs flex flex-col items-center gap-1">
              <span className="text-lg">📷</span>
              <span>Camera Inactive</span>
            </div>
          )}
        </div>

        <div className="mt-2 text-center">
          <p className="text-[11px] text-slate-400 font-medium">
            Continuous identity verification starts in the next phase
          </p>
        </div>
      </div>
    );
  }

  const effectiveStatus = cameraLost ? 'CAMERA_OFFLINE' : debouncedStatus;
  const config = STATUS_CONFIGS[effectiveStatus] || STATUS_CONFIGS.CHECKING;

  return (
    <div
      className={`bg-slate-900 border ${config.borderColor} rounded-xl p-3 shadow-md text-white transition-colors duration-300`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${config.indicatorColor} ${
              isVerifying ? 'animate-ping' : 'animate-pulse'
            }`}
          />
          <span className="text-xs font-semibold text-slate-200">Identity Monitor</span>
        </div>
        <Badge
          variant={config.badgeVariant}
          className="text-[10px] tracking-wide font-medium"
        >
          {config.badgeLabel}
        </Badge>
      </div>

      {/* Video Preview Frame */}
      <div
        className={`relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden border ${
          activeWarning ? 'border-amber-500/60 ring-2 ring-amber-500/20' : 'border-slate-800'
        } transition-all`}
      >
        {videoRef ? (
          <video
            ref={videoRef as any}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover mirror"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
            <span className="text-lg">📷</span>
            <span>Camera Active</span>
          </div>
        )}

        {/* Scan line effect when active cycle is recording */}
        {isVerifying && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400/80 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse" />
        )}

        {/* Corner guide brackets */}
        <div className="absolute inset-2 pointer-events-none border border-white/10 rounded-sm" />
      </div>

      {/* Status & Guidance Area with aria-live */}
      <div className="mt-2.5 space-y-1">
        <div
          role="status"
          aria-live="polite"
          className="text-[11px] font-medium text-center px-1 text-slate-200 min-h-[32px] flex items-center justify-center"
        >
          {debouncedMessage}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
          <span>
            {secondsSinceLastCheck === 0
              ? 'Just verified'
              : `Checked ${secondsSinceLastCheck}s ago`}
          </span>
          {isVerifying && (
            <span className="text-blue-400 font-medium animate-pulse">Syncing...</span>
          )}
        </div>
      </div>
    </div>
  );
}
