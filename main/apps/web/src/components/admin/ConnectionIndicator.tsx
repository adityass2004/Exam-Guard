'use client';

import React from 'react';
import type { SocketStatus } from '../../hooks/useAdminSocket';

interface ConnectionIndicatorProps {
  status: SocketStatus;
  reconnectCount?: number;
  onReconnect?: () => void;
}

export function ConnectionIndicator({
  status,
  reconnectCount = 0,
  onReconnect,
}: ConnectionIndicatorProps) {
  if (status === 'CONNECTED') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        Live Stream Online
      </div>
    );
  }

  if (status === 'RECONNECTING') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <span>Reconnecting{reconnectCount > 0 ? ` (#${reconnectCount})` : '...'}</span>
        {onReconnect && (
          <button
            onClick={onReconnect}
            className="ml-1 underline font-medium hover:text-amber-950 transition-colors"
          >
            Retry Now
          </button>
        )}
      </div>
    );
  }

  if (status === 'CONNECTING') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
        Connecting...
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
      <span className="h-2 w-2 rounded-full bg-rose-500"></span>
      Disconnected
      {onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-1 underline font-medium hover:text-rose-900 transition-colors"
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
