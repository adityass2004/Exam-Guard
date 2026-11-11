'use client';

import React from 'react';
import { Button } from '../ui/Button';

export interface CameraLostOverlayProps {
  isOpen: boolean;
  onRetry: () => void;
  message?: string;
  isRetrying?: boolean;
}

export function CameraLostOverlay({
  isOpen,
  onRetry,
  message = 'Webcam video stream was lost. Continuous identity verification requires an active camera feed during the entire examination.',
  isRetrying = false,
}: CameraLostOverlayProps) {
  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="camera-lost-title"
      aria-describedby="camera-lost-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 text-center space-y-4">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl">
          📷
        </div>

        <div className="space-y-2">
          <h2 id="camera-lost-title" className="text-lg font-bold text-slate-900">
            Camera Feed Interrupted
          </h2>
          <p id="camera-lost-desc" className="text-sm text-slate-600 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 text-left">
          <span className="font-semibold block mb-1">Troubleshooting Tips:</span>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Ensure no other application (Zoom, Teams, etc.) is using the webcam.</li>
            <li>Verify browser camera permissions in your address bar.</li>
            <li>Reconnect your webcam cable or USB port if external.</li>
          </ul>
        </div>

        <div className="pt-2">
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full bg-blue-600 hover:bg-blue-700 py-2.5"
          >
            {isRetrying ? 'Checking Camera Feed...' : 'Retry Camera Connection'}
          </Button>
        </div>
      </div>
    </div>
  );
}

