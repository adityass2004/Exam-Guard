'use client';

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';

export interface ApprovalPanelProps {
  profileId: string;
  status: string;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRevoke: () => Promise<void>;
  disabled?: boolean;
}

export function ApprovalPanel({
  profileId,
  status,
  onApprove,
  onReject,
  onRevoke,
  disabled = false,
}: ApprovalPanelProps) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    try {
      setLoading(true);
      await onApprove();
      setShowApproveConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 3) {
      setRejectError('Please enter at least 3 characters explaining why this enrollment is rejected.');
      return;
    }
    try {
      setLoading(true);
      await onReject(rejectReason.trim());
      setShowRejectModal(false);
      setRejectReason('');
      setRejectError('');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    try {
      setLoading(true);
      await onRevoke();
      setShowRevokeConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {status === 'PENDING_APPROVAL' && (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowApproveConfirm(true)}
            disabled={disabled || loading}
          >
            ✓ Approve Enrollment
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowRejectModal(true)}
            disabled={disabled || loading}
          >
            ✕ Reject
          </Button>
        </>
      )}

      {status === 'APPROVED' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRevokeConfirm(true)}
          disabled={disabled || loading}
          className="text-rose-600 border-rose-200 hover:bg-rose-50"
        >
          Revoke Approval
        </Button>
      )}

      {/* Approve Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        onConfirm={handleApprove}
        title="Approve Candidate Biometric Enrollment"
        message="Are you sure you want to approve this biometric profile? Once approved, the candidate will be eligible to enter proctored examinations. Any previously approved enrollment for this candidate will be marked SUPERSEDED."
        confirmLabel="Approve Candidate"
        variant="primary"
        loading={loading}
      />

      {/* Reject Reason Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectError('');
        }}
        title="Reject Face Enrollment"
        description="Explain to the student why their enrollment photograph or pose validation was unacceptable so they can re-enroll successfully."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rejection Reason (Visible to Student)
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError('');
              }}
              placeholder="E.g., Down angle capture had heavy glare from eyeglasses; please remove glasses or adjust lighting and re-enroll."
              className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {rejectError && (
              <p className="text-xs text-rose-600 mt-1 font-medium">{rejectError}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowRejectModal(false);
                setRejectError('');
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              disabled={loading || rejectReason.trim().length < 3}
            >
              {loading ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRevokeConfirm}
        onClose={() => setShowRevokeConfirm(false)}
        onConfirm={handleRevoke}
        title="Revoke Biometric Approval"
        message="Are you sure you want to revoke this candidate's biometric profile? They will no longer be eligible to enter examinations until they complete a new 5-angle enrollment."
        confirmLabel="Revoke Approval"
        variant="danger"
        loading={loading}
      />
    </div>
  );
}
