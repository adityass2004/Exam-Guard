'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { CandidateFaceGalleryDto, FaceImageDto, ResetPasswordResponse, StudentDetailDto } from '@examguard/shared';
import { apiClient } from '../../../../../lib/api-client';
import { AngleImage } from '../../../../../components/admin/AngleImage';
import { ApprovalPanel } from '../../../../../components/admin/ApprovalPanel';
import { Lightbox } from '../../../../../components/admin/Lightbox';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../../components/ui/ConfirmDialog';
import { Modal } from '../../../../../components/ui/Modal';
import { Spinner } from '../../../../../components/ui/Spinner';
import { Tabs } from '../../../../../components/ui/Tabs';

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  const [student, setStudent] = useState<StudentDetailDto | null>(null);
  const [gallery, setGallery] = useState<CandidateFaceGalleryDto | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'gallery'>('overview');
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [compareVersionIndex, setCompareVersionIndex] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<FaceImageDto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Account Management Dialogs
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tempPasswordModal, setTempPasswordModal] = useState<ResetPasswordResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [studentRes, galleryRes] = await Promise.all([
        apiClient.get<StudentDetailDto>(`/admin/students/${studentId}`),
        apiClient.get<CandidateFaceGalleryDto>(`/admin/students/${studentId}/face-gallery`),
      ]);

      if (studentRes.data) setStudent(studentRes.data);
      if (galleryRes.data) {
        setGallery(galleryRes.data);
        if (galleryRes.data.profiles.length > 0) {
          setSelectedVersionIndex(0);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load candidate profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [studentId]);

  // Account Actions
  const handleToggleStatus = async () => {
    if (!student) return;
    try {
      setActionLoading(true);
      const newStatus = student.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await apiClient.patch(`/admin/students/${studentId}`, { status: newStatus });
      setShowSuspendDialog(false);
      setSuccessMessage(`Account successfully ${newStatus.toLowerCase()}`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update account status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      setActionLoading(true);
      const res = await apiClient.post<ResetPasswordResponse>(
        `/admin/students/${studentId}/reset-password`,
        {},
      );
      setShowResetDialog(false);
      if (res.data) {
        setTempPasswordModal(res.data);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    try {
      setActionLoading(true);
      await apiClient.delete(`/admin/students/${studentId}`);
      setShowDeleteDialog(false);
      router.push('/admin/students');
    } catch (err: any) {
      setError(err.message || 'Failed to soft delete student');
    } finally {
      setActionLoading(false);
    }
  };

  // Face Profile Actions
  const handleApprove = async (profileId: string) => {
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/enrollments/${profileId}/approve`, {});
      setSuccessMessage('Face enrollment approved successfully');
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
      setSuccessMessage('Face enrollment rejected');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to reject enrollment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (profileId: string) => {
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/enrollments/${profileId}/revoke`, {});
      setSuccessMessage('Face enrollment revoked');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke enrollment');
    } finally {
      setActionLoading(false);
    }
  };

  const openLightbox = (images: FaceImageDto[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  if (loading && !student) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400">
        <Spinner size="lg" className="mb-3" />
        <p className="text-sm">Loading candidate details and biometric photographs...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <h3 className="text-base font-bold text-slate-800">Candidate Not Found</h3>
        <p className="text-xs text-slate-500 mt-1">This candidate account may have been removed.</p>
        <Link href="/admin/students" className="mt-4 inline-block text-xs font-semibold text-blue-600">
          ← Back to Students
        </Link>
      </div>
    );
  }

  const selectedProfile = gallery?.profiles[selectedVersionIndex] || null;
  const compareProfile = compareVersionIndex !== null ? gallery?.profiles[compareVersionIndex] || null : null;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/admin/students" className="hover:text-blue-600">
          Students
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800">{student.fullName}</span>
      </div>

      {/* Header Profile Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{student.fullName}</h1>
            <Badge variant={student.status === 'ACTIVE' ? 'success' : 'danger'}>
              {student.status}
            </Badge>
            <Badge variant="default" className="font-mono text-xs">
              ID: {student.studentId}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {student.email} · Registered: {new Date(student.createdAt).toLocaleDateString()}
            {student.lastLoginAt ? ` · Last Active: ${new Date(student.lastLoginAt).toLocaleString()}` : ''}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            disabled={actionLoading}
            className="text-xs"
          >
            🔑 Reset Password
          </Button>
          <Button
            variant={student.status === 'ACTIVE' ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setShowSuspendDialog(true)}
            disabled={actionLoading}
            className={student.status === 'ACTIVE' ? 'text-rose-600 border-rose-200 hover:bg-rose-50 text-xs' : 'text-xs'}
          >
            {student.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={actionLoading}
            className="text-rose-600 hover:bg-rose-50 text-xs"
          >
            🗑️ Delete
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center justify-between">
          <span>✓ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 font-bold">
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
          { id: 'overview', label: 'Candidate Overview' },
          {
            id: 'gallery',
            label: 'Face Gallery & Biometrics',
            badge: gallery?.profiles.length || 0,
          },
        ]}
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as any)}
      />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Enrollment Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Biometric Enrollment Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">Current Status</span>
                <Badge
                  variant={
                    student.enrollmentStatus === 'APPROVED'
                      ? 'success'
                      : student.enrollmentStatus === 'PENDING_APPROVAL'
                      ? 'warning'
                      : 'default'
                  }
                >
                  {student.enrollmentStatus}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">Total Versions Submitted</span>
                <span className="text-xs font-semibold text-slate-800">
                  {student.enrollmentSummary.totalVersions} version(s)
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500">Inter-Sample Consistency</span>
                <span className="text-xs font-mono font-semibold text-slate-800">
                  {student.enrollmentSummary.consistency !== null
                    ? `${student.enrollmentSummary.consistency.toFixed(3)} cosine`
                    : 'N/A'}
                </span>
              </div>

              {student.enrollmentSummary.rejectedReason && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <span className="text-xs font-bold text-rose-800 block mb-1">
                    Previous Rejection Reason:
                  </span>
                  <p className="text-xs text-rose-700">
                    {student.enrollmentSummary.rejectedReason}
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('gallery')}
                className="w-full justify-center text-xs"
              >
                Inspect 5-Angle Face Gallery →
              </Button>
            </CardContent>
          </Card>

          {/* Exam Sessions Card (Phase 5) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Proctored Exam Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-slate-400 text-xs">
                <span className="text-2xl block mb-2">⏱️</span>
                No proctored exam sessions found.
                <p className="text-[11px] text-slate-400 mt-1">
                  Examination management and session proctoring arrive in Phase 5.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: FACE GALLERY */}
      {activeTab === 'gallery' && (
        <div className="space-y-6">
          {(!gallery || gallery.profiles.length === 0) ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <span className="text-3xl block mb-2">📷</span>
              <h4 className="text-sm font-semibold text-slate-800">No Face Profiles Enrolled</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Candidate has not yet completed biometric face enrollment.
              </p>
            </div>
          ) : (
            <>
              {/* Version Selector Bar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                    Profile Version:
                  </span>
                  <div className="flex items-center gap-1">
                    {gallery.profiles.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedVersionIndex(idx);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          idx === selectedVersionIndex
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        v{p.version} ({p.status})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compare Mode Toggle */}
                {gallery.profiles.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant={compareMode ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setCompareMode(!compareMode);
                        if (!compareMode && compareVersionIndex === null) {
                          setCompareVersionIndex(selectedVersionIndex === 0 ? 1 : 0);
                        }
                      }}
                      className="text-xs"
                    >
                      {compareMode ? 'Exit Compare' : '↔ Compare Versions'}
                    </Button>

                    {compareMode && (
                      <select
                        value={compareVersionIndex ?? 0}
                        onChange={(e) => setCompareVersionIndex(Number(e.target.value))}
                        className="text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                      >
                        {gallery.profiles.map((p, idx) => (
                          <option key={p.id} value={idx}>
                            Compare with v{p.version} ({p.status})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Version Details & Approval Controls */}
              {selectedProfile && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        Version {selectedProfile.version}
                      </span>
                      <Badge
                        variant={
                          selectedProfile.status === 'APPROVED'
                            ? 'success'
                            : selectedProfile.status === 'PENDING_APPROVAL'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {selectedProfile.status}
                      </Badge>
                      <span className="text-xs text-slate-400 font-mono">
                        Model: {selectedProfile.modelName} (dim: {selectedProfile.embeddingDim})
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {selectedProfile.submittedAt && `Submitted: ${new Date(selectedProfile.submittedAt).toLocaleString()}`}
                      {selectedProfile.approvedAt && ` · Approved: ${new Date(selectedProfile.approvedAt).toLocaleString()}`}
                      {selectedProfile.approverName && ` by ${selectedProfile.approverName}`}
                      {selectedProfile.consistencyMinObserved !== null && (
                        <span> · Inter-sample consistency: <strong className="font-mono text-slate-700">{selectedProfile.consistencyMinObserved.toFixed(3)}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Actions (Approve / Reject / Revoke) */}
                  <ApprovalPanel
                    profileId={selectedProfile.id}
                    status={selectedProfile.status}
                    onApprove={() => handleApprove(selectedProfile.id)}
                    onReject={(reason) => handleReject(selectedProfile.id, reason)}
                    onRevoke={() => handleRevoke(selectedProfile.id)}
                    disabled={actionLoading}
                  />
                </div>
              )}

              {/* Rejection Reason Notice if Present */}
              {selectedProfile?.rejectedReason && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                  <h5 className="text-xs font-bold text-rose-800 mb-0.5">Rejection Reason:</h5>
                  <p className="text-xs text-rose-700">{selectedProfile.rejectedReason}</p>
                </div>
              )}

              {/* Primary 5-Angle Grid View */}
              {selectedProfile && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Five-Angle Enrollment Photographs (Version {selectedProfile.version})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'].map((ang) => {
                      const img = selectedProfile.images.find((i) => i.angle === ang);
                      const imgIndex = selectedProfile.images.findIndex((i) => i.angle === ang);
                      return (
                        <AngleImage
                          key={ang}
                          image={img}
                          label={ang}
                          onClick={() => {
                            if (img && imgIndex >= 0) {
                              openLightbox(selectedProfile.images, imgIndex);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Side-by-Side Comparison Layout if compareMode is active */}
              {compareMode && compareProfile && (
                <div className="pt-6 border-t border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                    Comparison: Version {compareProfile.version} ({compareProfile.status})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'].map((ang) => {
                      const img = compareProfile.images.find((i) => i.angle === ang);
                      const imgIndex = compareProfile.images.findIndex((i) => i.angle === ang);
                      return (
                        <AngleImage
                          key={`compare-${ang}`}
                          image={img}
                          label={`${ang} (v${compareProfile.version})`}
                          onClick={() => {
                            if (img && imgIndex >= 0) {
                              openLightbox(compareProfile.images, imgIndex);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      <Lightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={(idx) => setLightboxIndex(idx)}
      />

      {/* Suspend Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showSuspendDialog}
        onClose={() => setShowSuspendDialog(false)}
        onConfirm={handleToggleStatus}
        title={student.status === 'ACTIVE' ? 'Suspend Student Account' : 'Reactivate Student Account'}
        message={
          student.status === 'ACTIVE'
            ? 'Are you sure you want to suspend this account? All active student login sessions will be immediately revoked.'
            : 'Are you sure you want to reactivate this student account? They will be able to log in again.'
        }
        confirmLabel={student.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate'}
        variant={student.status === 'ACTIVE' ? 'danger' : 'primary'}
        loading={actionLoading}
      />

      {/* Reset Password Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        onConfirm={handleResetPassword}
        title="Reset Candidate Password"
        message="A cryptographically secure temporary password will be generated and displayed ONCE. All existing active authentication sessions for this candidate will be revoked, and they will be required to change their password on their next login."
        confirmLabel="Generate Temporary Password"
        variant="warning"
        loading={actionLoading}
      />

      {/* Temporary Password Modal (Shown ONCE) */}
      <Modal
        isOpen={Boolean(tempPasswordModal)}
        onClose={() => {
          setTempPasswordModal(null);
          setCopied(false);
        }}
        title="Temporary Password Generated"
        description="Share this temporary password securely with the candidate. It will not be shown again."
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 rounded-lg text-center">
            <span className="font-mono text-lg font-bold text-amber-400 select-all tracking-wider">
              {tempPasswordModal?.temporaryPassword}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              The candidate will be forced to change this password immediately upon logging in.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (tempPasswordModal?.temporaryPassword) {
                  navigator.clipboard.writeText(tempPasswordModal.temporaryPassword);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </Button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setTempPasswordModal(null);
                setCopied(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Soft Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleSoftDelete}
        title="Soft Delete Student Account"
        message="This action soft-deletes the student record and revokes all active login sessions. IMPORTANT: To comply with privacy and data protection policies, biometric image and embedding files are NOT automatically deleted by this action; biometric data removal must be requested and fulfilled via the Data Deletion Requests workflow."
        confirmLabel="Soft Delete Candidate"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
