'use client';

import React, { useState } from 'react';
import { apiClient } from '../../lib/api-client';

interface CancelSessionDialogProps {
  sessionId: string;
  studentName: string;
  examTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelSessionDialog({
  sessionId,
  studentName,
  examTitle,
  isOpen,
  onClose,
  onSuccess,
}: CancelSessionDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a specific cancellation reason');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient(`/api/v1/admin/sessions/${sessionId}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
        <div className="flex items-center gap-3 text-rose-600 mb-4">
          <div className="p-2 bg-rose-100 rounded-lg">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">Cancel Active Exam Session</h3>
        </div>

        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          You are about to cancel the exam session for{' '}
          <strong className="text-slate-900">{studentName}</strong> taking{' '}
          <strong className="text-slate-900">{examTitle}</strong>.
          This will immediately revoke exam access and log the reason in the official audit record.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Cancellation Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Unresolved physical identity mismatch confirmed by supervisor; unauthorized secondary screen detected..."
              rows={3}
              required
              className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 placeholder-slate-400"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Use factual, neutral terminology (e.g., &quot;Unverified candidate present&quot;, not &quot;cheater&quot;).
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Go Back
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
            >
              {loading ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
