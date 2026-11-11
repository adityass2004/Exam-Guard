'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DataDeletionRequestDto, PendingEnrollmentItemDto, SystemSettingsDto } from '@examguard/shared';
import { apiClient } from '../../../../lib/api-client';
import { AngleImage } from '../../../../components/admin/AngleImage';
import { ApprovalPanel } from '../../../../components/admin/ApprovalPanel';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Modal } from '../../../../components/ui/Modal';
import { Spinner } from '../../../../components/ui/Spinner';
import { Tabs } from '../../../../components/ui/Tabs';

export default function AdminEnrollmentsPage() {
  const [activeTab, setActiveTab] = useState<'approvals' | 'settings' | 'deletions'>('approvals');
  const [pendingList, setPendingList] = useState<PendingEnrollmentItemDto[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DataDeletionRequestDto[]>([]);
  const [settings, setSettings] = useState<SystemSettingsDto | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Deletion fulfillment dialogs
  const [fulfillTarget, setFulfillTarget] = useState<DataDeletionRequestDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DataDeletionRequestDto | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pendingRes, settingsRes, deletionsRes] = await Promise.all([
        apiClient.get<PendingEnrollmentItemDto[]>('/admin/enrollments'),
        apiClient.get<SystemSettingsDto>('/admin/system-settings'),
        apiClient.get<DataDeletionRequestDto[]>('/admin/data-deletion-requests'),
      ]);

      if (pendingRes.data) setPendingList(pendingRes.data);
      if (settingsRes.data) setSettings(settingsRes.data);
      if (deletionsRes.data) setDeletionRequests(deletionsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load enrollment approvals and settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (profileId: string) => {
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/enrollments/${profileId}/approve`, {});
      setSuccess('Enrollment approved successfully');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve enrollment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (profileId: string, reason: string) => {
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/enrollments/${profileId}/reject`, { reason });
      setSuccess('Enrollment rejected');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reject enrollment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRequireApproval = async () => {
    if (!settings) return;
    try {
      setActionLoading(true);
      const newVal = !settings.requireEnrollmentApproval;
      const res = await apiClient.patch<SystemSettingsDto>('/admin/system-settings', {
        requireEnrollmentApproval: newVal,
      });
      if (res.data) setSettings(res.data);
      setSuccess(`Enrollment approval requirement set to: ${newVal ? 'ENABLED' : 'DISABLED'}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update system settings');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFulfillDeletion = async () => {
    if (!fulfillTarget) return;
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/data-deletion-requests/${fulfillTarget.id}/fulfill`, {});
      setFulfillTarget(null);
      setSuccess(`Biometric records purged for candidate ${fulfillTarget.studentFullName}`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to fulfill data deletion request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectDeletion = async () => {
    if (!rejectTarget || !rejectNote.trim()) return;
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/data-deletion-requests/${rejectTarget.id}/reject`, {
        note: rejectNote.trim(),
      });
      setRejectTarget(null);
      setRejectNote('');
      setSuccess('Data deletion request rejected');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reject data deletion request');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Enrollment Review & Biometric Policies
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review pending 5-angle candidate submissions, configure approval gates, and fulfill deletion requests.
        </p>
      </div>

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center justify-between">
          <span>✓ {success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            id: 'approvals',
            label: 'Pending Approvals Queue',
            badge: pendingList.length,
          },
          {
            id: 'deletions',
            label: 'Data Deletion Requests',
            badge: deletionRequests.filter((d) => d.status === 'PENDING').length,
          },
          {
            id: 'settings',
            label: 'Enrollment Approval Gate',
          },
        ]}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as any)}
      />

      {/* TAB 1: PENDING APPROVALS QUEUE */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <Spinner size="lg" className="mb-3" />
              <p className="text-sm">Loading pending enrollments...</p>
            </div>
          ) : pendingList.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <span className="text-3xl block mb-2">🎉</span>
              <h3 className="text-base font-semibold text-slate-800">Review Queue Empty</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                There are currently no candidates awaiting biometric enrollment approval.
              </p>
            </div>
          ) : (
            pendingList.map((item) => (
              <Card key={item.profileId} className="overflow-hidden">
                <CardHeader className="bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/students/${item.student.id}`}
                        className="font-bold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {item.student.fullName}
                      </Link>
                      <Badge variant="warning">Pending Approval</Badge>
                      <span className="text-xs font-mono text-slate-500">
                        ID: {item.student.studentId} · Version {item.version}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.student.email} · Submitted:{' '}
                      {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'N/A'}
                      {item.consistency !== null && (
                        <span> · Inter-sample consistency: <strong className="font-mono text-slate-700">{item.consistency.toFixed(3)}</strong></span>
                      )}
                    </div>
                  </div>

                  <ApprovalPanel
                    profileId={item.profileId}
                    status="PENDING_APPROVAL"
                    onApprove={() => handleApprove(item.profileId)}
                    onReject={(reason) => handleReject(item.profileId, reason)}
                    onRevoke={() => Promise.resolve()}
                    disabled={actionLoading}
                  />
                </CardHeader>

                <CardContent className="p-4">
                  {/* 5-Angle Quick Preview Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'].map((ang) => {
                      const img = item.images.find((i) => i.angle === ang);
                      return (
                        <AngleImage
                          key={ang}
                          image={img}
                          label={ang}
                          showQuality={false}
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB 2: DATA DELETION REQUESTS */}
      {activeTab === 'deletions' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
            <strong>Privacy & Data Subject Rights:</strong> Under institution privacy policy and applicable regulations,
            candidates may request deletion of their biometric templates and captured images. Fulfilling a request permanently
            hard-deletes all encrypted images from disk and database embeddings, marks profile REVOKED, and logs an audit
            record with counts only.
          </div>

          {deletionRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <span className="text-3xl block mb-2">🛡️</span>
              <h3 className="text-base font-semibold text-slate-800">No Deletion Requests</h3>
              <p className="text-xs text-slate-500 mt-1">
                No students have requested biometric data deletion.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {deletionRequests.map((req) => (
                <Card key={req.id}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {req.studentFullName}
                        </span>
                        <Badge
                          variant={
                            req.status === 'FULFILLED'
                              ? 'success'
                              : req.status === 'REJECTED'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {req.status}
                        </Badge>
                        <span className="text-xs font-mono text-slate-500">
                          ID: {req.studentId}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {req.studentEmail} · Requested: {new Date(req.requestedAt).toLocaleString()}
                      </div>
                      {req.reason && (
                        <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded border border-slate-100">
                          Reason given: &quot;{req.reason}&quot;
                        </p>
                      )}
                      {req.handlerNote && (
                        <p className="text-xs text-rose-700 mt-2 bg-rose-50 p-2 rounded border border-rose-100">
                          Rejection note: &quot;{req.handlerNote}&quot; (by {req.handlerEmail})
                        </p>
                      )}
                    </div>

                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setFulfillTarget(req)}
                          disabled={actionLoading}
                          className="text-xs"
                        >
                          Fulfil & Purge Biometrics
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRejectTarget(req)}
                          disabled={actionLoading}
                          className="text-xs"
                        >
                          Reject Request
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Fulfill Confirmation Dialog */}
          <ConfirmDialog
            isOpen={Boolean(fulfillTarget)}
            onClose={() => setFulfillTarget(null)}
            onConfirm={handleFulfillDeletion}
            title="Permanently Purge Candidate Biometric Data"
            message={`Are you sure you want to fulfill the biometric deletion request for ${fulfillTarget?.studentFullName}? This action will permanently hard-delete all five enrollment images from private disk storage, erase all 512-d embeddings, and revoke their biometric profile. This action is completely IRREVERSIBLE.`}
            confirmLabel="Confirm Permanent Purge"
            variant="danger"
            loading={actionLoading}
          />

          {/* Reject Deletion Modal */}
          <Modal
            isOpen={Boolean(rejectTarget)}
            onClose={() => setRejectTarget(null)}
            title="Reject Deletion Request"
            description="Provide an institutional rationale for declining this deletion request (e.g. active disciplinary investigation)."
          >
            <div className="space-y-4">
              <textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Enter formal rejection justification..."
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setRejectTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRejectDeletion}
                  disabled={!rejectNote.trim() || rejectNote.trim().length < 3 || actionLoading}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* TAB 3: SYSTEM SETTINGS */}
      {activeTab === 'settings' && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base font-bold">
              Enrollment Approval Gate Setting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900">
                  Require Administrative Approval for Candidate Enrollments
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  When enabled, candidates completing enrollment transition to <code>PENDING_APPROVAL</code> and must
                  be inspected and approved by an administrator before they are eligible to enter examinations.
                  When disabled, valid enrollments are automatically approved upon finalization.
                </p>
              </div>

              <Button
                variant={settings?.requireEnrollmentApproval ? 'primary' : 'outline'}
                size="sm"
                onClick={handleToggleRequireApproval}
                disabled={actionLoading}
                className="whitespace-nowrap"
              >
                {settings?.requireEnrollmentApproval ? 'Gate: ENABLED' : 'Gate: DISABLED'}
              </Button>
            </div>

            {settings?.updatedAt && (
              <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
                Last modified: {new Date(settings.updatedAt).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
