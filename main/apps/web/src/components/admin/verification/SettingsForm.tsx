'use client';

import React, { useState } from 'react';
import {
  VerificationSettingsDto,
  CreateVerificationSettingsDto,
  DEFAULT_SEVERITY_RULES,
} from '@examguard/shared';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { SettingsDiff } from './SettingsDiff';

export interface SettingsFormProps {
  currentSettings: VerificationSettingsDto | null;
  onSave: (data: CreateVerificationSettingsDto) => Promise<void>;
  isLoading?: boolean;
}

export function SettingsForm({
  currentSettings,
  onSave,
  isLoading = false,
}: SettingsFormProps) {
  const [formData, setFormData] = useState<CreateVerificationSettingsDto>({
    name: currentSettings?.name ?? '',
    thresholdPct: currentSettings?.thresholdPct ?? 75.0,
    intervalMs: currentSettings?.intervalMs ?? 1500,
    consecutiveMismatchLimit: currentSettings?.consecutiveMismatchLimit ?? 3,
    missingFaceLimit: currentSettings?.missingFaceLimit ?? 3,
    multipleFacesPolicy: (currentSettings?.multipleFacesPolicy as any) ?? 'ALERT_IMMEDIATELY',
    multipleFacesConsecutiveLimit: currentSettings?.multipleFacesConsecutiveLimit ?? 2,
    cameraFailurePolicy: (currentSettings?.cameraFailurePolicy as any) ?? 'ALERT_IMMEDIATELY',
    cameraGraceSeconds: currentSettings?.cameraGraceSeconds ?? 10,
    serviceFailureLimit: currentSettings?.serviceFailureLimit ?? 3,
    repeatedFailureLimit: currentSettings?.repeatedFailureLimit ?? 5,
    recoveryMatchCount: currentSettings?.recoveryMatchCount ?? 3,
    startupGraceSeconds: currentSettings?.startupGraceSeconds ?? 15,
    preExamRequiredMatches: currentSettings?.preExamRequiredMatches ?? 2,
    minFaceQuality: (currentSettings?.minFaceQuality as any) ?? {
      minBlur: 35.0,
      minBrightness: 50.0,
      maxBrightness: 210.0,
      minFaceSizeRatio: 0.05,
      minDetectorScore: 0.65,
    },
    severityRules: (currentSettings?.severityRules as any) ?? DEFAULT_SEVERITY_RULES,
    changeNote: '',
  });

  const [showDiffModal, setShowDiffModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    field: keyof CreateVerificationSettingsDto,
    value: any
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.changeNote || formData.changeNote.trim().length < 5) {
      setError('A descriptive change note (minimum 5 characters) is required for audit compliance.');
      return;
    }

    if (formData.thresholdPct < 60 || formData.thresholdPct > 95) {
      setError('Matching threshold must be between 60.0% and 95.0%.');
      return;
    }

    if (formData.intervalMs < 500 || formData.intervalMs > 10000) {
      setError('Verification interval must be between 500ms and 10,000ms.');
      return;
    }

    setShowDiffModal(true);
  };

  const handleConfirmDeploy = async () => {
    try {
      await onSave(formData);
      setShowDiffModal(false);
      setFormData((prev) => ({ ...prev, changeNote: '' }));
    } catch (err: any) {
      setError(err?.message || 'Failed to deploy new settings version.');
      setShowDiffModal(false);
    }
  };

  return (
    <form onSubmit={handleReview} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Primary Thresholds */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Core Biometric Parameters</h3>
          <p className="text-xs text-slate-500">
            Cosine similarity matching threshold and verification loop frequency.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Configuration Profile Name (Optional)
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Standard Final Exam Profile"
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Matching Threshold Percentage ({formData.thresholdPct.toFixed(1)}%)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="60"
                max="95"
                step="0.5"
                value={formData.thresholdPct}
                onChange={(e) => handleChange('thresholdPct', parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="w-16 font-mono text-xs font-bold text-slate-800 text-right">
                {formData.thresholdPct.toFixed(1)}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Recommended: 70.0% – 80.0% for Buffalo_L</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Verification Tick Interval (ms)
            </label>
            <input
              type="number"
              min="500"
              max="10000"
              step="100"
              value={formData.intervalMs}
              onChange={(e) => handleChange('intervalMs', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
            <p className="text-[11px] text-slate-400 mt-1">Between 500ms and 10,000ms (Default: 1500ms)</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pre-Exam Required Consecutive Matches
            </label>
            <input
              type="number"
              min="1"
              max="5"
              value={formData.preExamRequiredMatches}
              onChange={(e) => handleChange('preExamRequiredMatches', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
            <p className="text-[11px] text-slate-400 mt-1">Consecutive matches required before exam start</p>
          </div>
        </div>
      </div>

      {/* Tolerance Limits & Policies */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Tolerance Limits & Escalation Policies</h3>
          <p className="text-xs text-slate-500">
            Tolerances before flagged warnings or incidents occur.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Consecutive Mismatch Limit
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.consecutiveMismatchLimit}
              onChange={(e) => handleChange('consecutiveMismatchLimit', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Missing Face Limit
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.missingFaceLimit}
              onChange={(e) => handleChange('missingFaceLimit', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Repeated Failure Limit
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.repeatedFailureLimit}
              onChange={(e) => handleChange('repeatedFailureLimit', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Multiple Faces Policy
            </label>
            <select
              value={formData.multipleFacesPolicy}
              onChange={(e) => handleChange('multipleFacesPolicy', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="ALERT_IMMEDIATELY">ALERT_IMMEDIATELY</option>
              <option value="ALERT_AFTER_CONSECUTIVE">ALERT_AFTER_CONSECUTIVE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Multiple Faces Limit
            </label>
            <input
              type="number"
              min="1"
              max="5"
              value={formData.multipleFacesConsecutiveLimit}
              onChange={(e) => handleChange('multipleFacesConsecutiveLimit', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Camera Failure Policy
            </label>
            <select
              value={formData.cameraFailurePolicy}
              onChange={(e) => handleChange('cameraFailurePolicy', e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="ALERT_IMMEDIATELY">ALERT_IMMEDIATELY</option>
              <option value="ALERT_AFTER_GRACE">ALERT_AFTER_GRACE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Camera Grace Period (seconds)
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={formData.cameraGraceSeconds}
              onChange={(e) => handleChange('cameraGraceSeconds', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recovery Match Count
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.recoveryMatchCount}
              onChange={(e) => handleChange('recoveryMatchCount', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Startup Grace Period (seconds)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              value={formData.startupGraceSeconds}
              onChange={(e) => handleChange('startupGraceSeconds', parseInt(e.target.value, 10))}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Mandatory Change Note & Submit */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1">
            Mandatory Change Note <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={formData.changeNote}
            onChange={(e) => handleChange('changeNote', e.target.value)}
            placeholder="Explain the technical or institutional rationale for deploying this configuration version (e.g. tightened threshold for final exam session, or relaxed interval due to bandwidth concerns)..."
            className="w-full text-xs rounded-lg border border-slate-300 p-3 focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Recorded in immutable admin audit log along with your user identity and timestamp.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isLoading || !formData.changeNote || formData.changeNote.trim().length < 5}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2.5 font-medium"
          >
            Review & Deploy Version →
          </Button>
        </div>
      </div>

      {/* Diff Review Modal */}
      <Modal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        title="Review Configuration Changes"
      >
        <div className="space-y-4">
          <SettingsDiff current={currentSettings} proposed={formData} />

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
            <span className="font-semibold text-slate-700 block">Change Note:</span>
            <p className="text-slate-600 italic font-mono bg-white p-2 rounded border border-slate-200">
              "{formData.changeNote}"
            </p>
          </div>

          <p className="text-xs text-amber-700 font-medium">
            Deploying will immediately deactivate version v{currentSettings?.version ?? 0} and activate
            new version v{(currentSettings?.version ?? 0) + 1}. Existing in-progress exam sessions
            will continue using their immutable snapshots.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setShowDiffModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDeploy}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? 'Deploying...' : 'Confirm & Deploy Version'}
            </Button>
          </div>
        </div>
      </Modal>
    </form>
  );
}
