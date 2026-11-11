'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '../../../../../lib/api-client';
import { EvidenceComparison, RegisteredImageItem } from '../../../../../components/admin/EvidenceComparison';
import { AttemptTimeline, TimelineLogItem } from '../../../../../components/admin/AttemptTimeline';
import { ReviewDialog } from '../../../../../components/admin/ReviewDialog';
import type { IncidentStatus, Severity, TriggerType, ReviewDisposition } from '@examguard/shared';

interface IncidentDetailResponse {
  incident: {
    id: string;
    incidentCode: string;
    triggerType: TriggerType;
    severity: Severity;
    status: IncidentStatus;
    disposition: ReviewDisposition | null;
    isOngoing: boolean;
    firstDetectedAt: string;
    lastDetectedAt: string;
    recoveredAt: string | null;
    occurrenceCount: number;
    firstSimilarityPct: number | null;
    worstSimilarityPct: number | null;
    evidenceStatus: string;
    evidenceFailureReason: string | null;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    disclaimer: string;
  };
  student: {
    id: string;
    fullName: string;
    email: string;
    studentId: string;
  };
  exam: {
    id: string;
    title: string;
    durationMinutes: number;
  };
  session: {
    id: string;
    status: string;
    startedAt: string | null;
    totalAttempts: number;
    matchCount: number;
    mismatchCount: number;
  };
  evidence: {
    id: string;
    triggerId: string;
    sha256: string;
    byteSize: number;
    width: number;
    height: number;
    capturedAt: string;
    url: string;
  } | null;
  registeredImages: RegisteredImageItem[];
  timelineLogs: TimelineLogItem[];
  investigationLogs: Array<{
    id: string;
    adminName: string;
    action: string;
    disposition?: ReviewDisposition | null;
    note?: string | null;
    createdAt: string;
  }>;
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params?.id as string;

  const [detail, setDetail] = useState<IncidentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!incidentId) return;
    try {
      setLoading(true);
      const res = await apiClient<{ data: IncidentDetailResponse }>(
        `/api/v1/admin/incidents/${incidentId}`
      );
      setDetail(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load incident detail');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAcknowledge = async () => {
    if (!detail) return;
    try {
      await apiClient(`/api/v1/admin/incidents/${detail.incident.id}/acknowledge`, {
        method: 'POST',
        body: { note: 'Acknowledged for investigation' },
      });
      fetchDetail();
    } catch (err: any) {
      alert(err?.message || 'Failed to acknowledge incident');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !detail) return;

    try {
      setNoteSubmitting(true);
      await apiClient(`/api/v1/admin/incidents/${detail.incident.id}/notes`, {
        method: 'POST',
        body: { note: newNote.trim() },
      });
      setNewNote('');
      fetchDetail();
    } catch (err: any) {
      alert(err?.message || 'Failed to record investigation note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-flex items-center gap-2 text-slate-500 font-medium">
          <span className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></span>
          <span>Loading incident investigation workbench...</span>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
          {error || 'Incident record not found'}
        </div>
        <button
          onClick={() => router.push('/admin/incidents')}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          ← Return to Incidents List
        </button>
      </div>
    );
  }

  const { incident, student, exam, session, evidence, registeredImages, timelineLogs, investigationLogs } = detail;

  return (
    <div className="space-y-6">
      {/* Back Link & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <span>←</span>
          <span>Back to Security Incidents</span>
        </Link>

        {/* Report Exports */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/v1/admin/incidents/${incident.id}/report?format=csv`}
            download
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </a>
          <a
            href={`/api/v1/admin/incidents/${incident.id}/report?format=html`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>📄</span>
            <span>Printable HTML Report</span>
          </a>
        </div>
      </div>

      {/* Main Incident Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 font-mono tracking-tight">
                {incident.incidentCode}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  incident.severity === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : incident.severity === 'HIGH'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                }`}
              >
                {incident.severity}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                {incident.status}
              </span>
              {incident.disposition && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                  {incident.disposition}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 font-medium">
              Trigger Type: <strong className="text-slate-900">{incident.triggerType.replace(/_/g, ' ')}</strong>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {incident.status === 'OPEN' && (
              <button
                type="button"
                onClick={handleAcknowledge}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-colors"
              >
                Acknowledge Incident
              </button>
            )}
            {incident.status !== 'REVIEWED' && (
              <button
                type="button"
                onClick={() => setReviewDialogOpen(true)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
              >
                Submit Review & Disposition
              </button>
            )}
          </div>
        </div>

        {/* Standing Disclaimer */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs leading-relaxed">
          <strong>Official Proctoring Disclaimer:</strong> {incident.disclaimer}
        </div>
      </div>

      {/* Candidate & Exam Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Candidate Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <span>👤</span>
            <span>Candidate Information</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Full Name</span>
              <strong className="text-slate-900 text-sm">{student.fullName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Student ID</span>
              <strong className="text-slate-900 font-mono text-sm">{student.studentId}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Email Address</span>
              <span className="text-slate-700 font-mono">{student.email}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">User UUID</span>
              <span className="text-slate-500 font-mono text-[10px] truncate block">{student.id}</span>
            </div>
          </div>
        </div>

        {/* Exam & Session Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <span>📝</span>
            <span>Exam & Session Details</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Exam Title</span>
              <strong className="text-slate-900 truncate block">{exam.title}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Session Status</span>
              <span className="font-semibold text-slate-800">{session.status}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Verification Tallies</span>
              <span className="text-slate-700">
                {session.totalAttempts} attempts ({session.matchCount} match, {session.mismatchCount} mismatch)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Session UUID</span>
              <span className="text-slate-500 font-mono text-[10px] truncate block">{session.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Biometric Comparison */}
      <EvidenceComparison
        triggerId={incident.id}
        incidentCode={incident.incidentCode}
        evidenceUrl={evidence?.url}
        registeredImages={registeredImages}
        firstSimilarityPct={incident.firstSimilarityPct}
        worstSimilarityPct={incident.worstSimilarityPct}
      />

      {/* Verification Sequence Timeline */}
      <AttemptTimeline logs={timelineLogs} incidentCode={incident.incidentCode} />

      {/* Investigation Notes & Audit Log */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <span>📋</span>
              <span>Investigation Audit Log & Supervisor Notes</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Append-only tamper-evident record of supervisor reviews and case findings
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Add Note Form */}
          <form onSubmit={handleAddNote} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Add Case Note
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter factual supervisor observation..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="flex-1 text-xs sm:text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={noteSubmitting || !newNote.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white transition-colors"
              >
                {noteSubmitting ? 'Saving...' : 'Add Note'}
              </button>
            </div>
          </form>

          {/* History List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">History</h4>
            {investigationLogs.length === 0 ? (
              <p className="text-xs text-slate-400">No supervisor notes logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {investigationLogs.map((log) => (
                  <div key={log.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="font-semibold text-slate-900">
                        {log.adminName} • <strong className="font-mono text-blue-600">{log.action}</strong>
                        {log.disposition && ` (${log.disposition})`}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.note && (
                      <p className="text-slate-700 bg-slate-50 p-2 rounded text-xs border border-slate-100">
                        {log.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Review Dialog */}
      <ReviewDialog
        incidentId={incident.id}
        incidentCode={incident.incidentCode}
        isOpen={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        onSuccess={() => fetchDetail()}
      />
    </div>
  );
}
