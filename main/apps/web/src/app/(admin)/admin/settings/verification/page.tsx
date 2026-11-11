'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../../../../lib/api-client';
import {
  VerificationSettingsDto,
  VerificationSettingsHistoryDto,
  CreateVerificationSettingsDto,
} from '@examguard/shared';
import { CalibrationBanner } from '../../../../../components/admin/verification/CalibrationBanner';
import { SettingsForm } from '../../../../../components/admin/verification/SettingsForm';
import { SettingsHistory } from '../../../../../components/admin/verification/SettingsHistory';
import { Tabs } from '../../../../../components/ui/Tabs';

export default function AdminVerificationSettingsPage() {
  const [activeSettings, setActiveSettings] = useState<VerificationSettingsDto | null>(null);
  const [history, setHistory] = useState<VerificationSettingsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'configure' | 'history'>('configure');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [activeRes, historyRes] = await Promise.all([
        apiClient.get<VerificationSettingsDto>('/admin/verification-settings'),
        apiClient.get<VerificationSettingsHistoryDto>('/admin/verification-settings/history'),
      ]);
      setActiveSettings(activeRes.data);
      setHistory(historyRes.data.history);
    } catch (err: any) {
      setToast({
        message: err?.message || 'Failed to load verification settings',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (dto: CreateVerificationSettingsDto) => {
    setIsSaving(true);
    try {
      const res = await apiClient.post<VerificationSettingsDto>(
        '/admin/verification-settings',
        dto
      );
      setToast({
        message: `Successfully deployed configuration version v${res.data.version}!`,
        type: 'success',
      });
      await loadData();
    } catch (err: any) {
      setToast({
        message: err?.message || 'Failed to deploy new verification configuration version',
        type: 'error',
      });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-16 text-center text-slate-500 text-sm">
        Loading biometric verification settings...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Verification Settings & Thresholds
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Global facial recognition parameters, verification frequency, and escalation policies.
          </p>
        </div>

        {activeSettings && (
          <div className="flex items-center gap-2 self-start sm:self-auto bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs shadow-2xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600">Active Profile:</span>
            <span className="font-bold text-slate-900">
              v{activeSettings.version} {activeSettings.name ? `(${activeSettings.name})` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Prominent Calibration Notice */}
      <CalibrationBanner thresholdPct={activeSettings?.thresholdPct ?? 75.0} />

      {/* Navigation Tabs */}
      <Tabs
        tabs={[
          { id: 'configure', label: 'Configure Parameters & Deploy Version' },
          { id: 'history', label: `Version History (${history.length})` },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Active Tab Views */}
      {activeTab === 'configure' ? (
        <SettingsForm
          currentSettings={activeSettings}
          onSave={handleSave}
          isLoading={isSaving}
        />
      ) : (
        <SettingsHistory history={history} />
      )}

      {toast && (
        <div
          role="alert"
          className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-3 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
