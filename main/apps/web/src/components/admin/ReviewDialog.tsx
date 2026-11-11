'use client';

import React, { useState } from 'react';
import type { ReviewDisposition } from '@examguard/shared';
import { apiClient } from '../../lib/api-client';

interface ReviewDialogProps {
  incidentId: string;
  incidentCode: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (disposition: ReviewDisposition, note?: string) => void;
}

export function ReviewDialog({
  incidentId,
  incidentCode,
  isOpen,
  onClose,
  onSuccess,
}: ReviewDialogProps) {
  const [disposition, setDisposition] = useState<ReviewDisposition>('CONFIRMED_CONCERN');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const noteMinLength = disposition === 'CONFIRMED_CONCERN' ? 10 : 0;
  const isNoteValid = !noteMinLength || note.trim().length >= noteMinLength;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNoteValid) {
      setError('A note of at least 10 characters is required when confirming concern');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiClient(`/api/v1/admin/incidents/${incidentId}/review`, {
        method: 'POST',
        body: {
          disposition,
          note: note.trim() || undefined,
        },
      });
      onSuccess(disposition, note.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit incident review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Submit Final Incident Disposition
            </h3>
            <p className="text-xs text-slate-500 font-mono">Incident: {incidentCode}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg font-bold"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Neutral language alert per INSTRUCTIONS §20 */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs leading-relaxed">
          <strong>Notice:</strong> Document facts neutrally. Use terms like &quot;facial structure mismatch confirmed&quot; or &quot;lighting anomaly&quot;; never use accusatory language.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Review Disposition
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  disposition === 'CONFIRMED_CONCERN'
                    ? 'bg-rose-50 border-rose-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="disposition"
                  value="CONFIRMED_CONCERN"
                  checked={disposition === 'CONFIRMED_CONCERN'}
                  onChange={() => setDisposition('CONFIRMED_CONCERN')}
                  className="mt-1 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Concern Confirmed After Review
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Visual examination confirms biometric anomaly or unauthorized secondary presence.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  disposition === 'FALSE_POSITIVE'
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="disposition"
                  value="FALSE_POSITIVE"
                  checked={disposition === 'FALSE_POSITIVE'}
                  onChange={() => setDisposition('FALSE_POSITIVE')}
                  className="mt-1 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    False Positive (Candidate Verified)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Trigger was caused by lighting, camera angle, temporary occlusion, or false detection.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  disposition === 'INCONCLUSIVE'
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="disposition"
                  value="INCONCLUSIVE"
                  checked={disposition === 'INCONCLUSIVE'}
                  onChange={() => setDisposition('INCONCLUSIVE')}
                  className="mt-1 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Inconclusive</div>
                  <div className="text-[11px] text-slate-500">
                    Evidence is degraded or insufficient to make a definitive determination.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Investigation Findings / Notes{' '}
                {noteMinLength > 0 && <span className="text-rose-500">*</span>}
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {note.length} / 2000 chars {noteMinLength > 0 && `(min ${noteMinLength})`}
              </span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                disposition === 'CONFIRMED_CONCERN'
                  ? 'Required: Detail specific findings (e.g. Physical jawline and eye spacing differ from registered angles; secondary person confirmed at 14:02:15)'
                  : 'Optional investigator notes regarding decision reasoning...'
              }
              rows={4}
              maxLength={2000}
              className="w-full text-xs sm:text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isNoteValid}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
            >
              {loading ? 'Submitting...' : 'Confirm Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
