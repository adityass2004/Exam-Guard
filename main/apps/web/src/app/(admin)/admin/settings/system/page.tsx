'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface SystemSettings {
  requireEnrollmentApproval: boolean;
  retentionEnrollmentImagesDays: number;
  retentionEvidenceDays: number;
  retentionVerificationLogsDays: number;
  retentionAuditLogsDays: number;
  consentPolicyVersion: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

interface RetentionRunResult {
  dryRun: boolean;
  sessionsPurged: number;
  verificationLogsPurged: number;
  evidencePurged: number;
  profilesPurged: number;
  auditLogsPurged: number;
  timestamp: string;
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningRetention, setRunningRetention] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retentionResult, setRetentionResult] = useState<RetentionRunResult | null>(null);

  // Form state
  const [requireApproval, setRequireApproval] = useState(true);
  const [enrollmentDays, setEnrollmentDays] = useState(365);
  const [evidenceDays, setEvidenceDays] = useState(90);
  const [verificationDays, setVerificationDays] = useState(180);
  const [auditDays, setAuditDays] = useState(730);
  const [consentVersion, setConsentVersion] = useState('1.0');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await api.get<SystemSettings>('/admin/system-settings');
        setSettings(res.data);
        setRequireApproval(res.data.requireEnrollmentApproval);
        setEnrollmentDays(res.data.retentionEnrollmentImagesDays ?? 365);
        setEvidenceDays(res.data.retentionEvidenceDays ?? 90);
        setVerificationDays(res.data.retentionVerificationLogsDays ?? 180);
        setAuditDays(res.data.retentionAuditLogsDays ?? 730);
        setConsentVersion(res.data.consentPolicyVersion ?? '1.0');
      } catch (err: any) {
        setError(err.message || 'Failed to load system settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.put<SystemSettings>('/admin/system-settings', {
        requireEnrollmentApproval: requireApproval,
        retentionEnrollmentImagesDays: Number(enrollmentDays),
        retentionEvidenceDays: Number(evidenceDays),
        retentionVerificationLogsDays: Number(verificationDays),
        retentionAuditLogsDays: Number(auditDays),
        consentPolicyVersion: consentVersion,
      });
      setSettings(res.data);
      setSuccess('System and retention settings updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRunRetention = async (dryRun: boolean) => {
    if (!dryRun) {
      const ok = window.confirm(
        'Are you sure you want to permanently purge expired retention data? This action cannot be undone.'
      );
      if (!ok) return;
    }

    setRunningRetention(true);
    setError(null);
    try {
      const res = await api.post<RetentionRunResult>('/admin/retention/run', {
        dryRun,
      });
      setRetentionResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Retention operation failed');
    } finally {
      setRunningRetention(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading system settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          System & Retention Settings
        </h1>
        <p className="text-sm text-slate-500">
          Configure institutional enrollment gates, data retention horizons, and execute purge cycles.
        </p>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg">
        <strong>Institutional Notice:</strong> Retention period settings and consent policy versions are default
        placeholders. The institution is responsible for setting retention policies in compliance with relevant
        data protection and privacy regulations. Setting a period to <code>0</code> keeps data indefinitely.
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-200">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200">
          {success}
        </div>
      )}

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enrollment & Governance Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <label className="text-sm font-semibold text-slate-800 block">
                  Mandatory Face Enrollment Approval
                </label>
                <span className="text-xs text-slate-500">
                  When enabled, student candidate face templates must be reviewed and approved by an administrator before examination access is permitted.
                </span>
              </div>
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRequireApproval(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Active Consent Policy Version
              </label>
              <Input
                value={consentVersion}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConsentVersion(e.target.value)}
                placeholder="e.g. 1.0"
                className="max-w-xs"
              />
              <span className="text-xs text-slate-400 block mt-1">
                Incrementing this version prompts students to re-consent before taking examinations.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Data Retention Horizons (Days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Incident Evidence Images
                </label>
                <Input
                  type="number"
                  min="0"
                  max="3650"
                  value={evidenceDays}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEvidenceDays(Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-400">
                  Days before resolved incident images are deleted from disk. (0 = keep indefinitely)
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Revoked Profile Biometrics
                </label>
                <Input
                  type="number"
                  min="0"
                  max="3650"
                  value={enrollmentDays}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnrollmentDays(Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-400">
                  Days before revoked/superseded face images and embeddings are deleted.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Verification Logs
                </label>
                <Input
                  type="number"
                  min="0"
                  max="3650"
                  value={verificationDays}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVerificationDays(Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-400">
                  Days before detailed verification log rows are deleted. Live sessions protected.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Administrator Audit Logs
                </label>
                <Input
                  type="number"
                  min="0"
                  max="3650"
                  value={auditDays}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuditDays(Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-400">
                  Days before audit log rows are purged. A summary audit entry is preserved.
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Manual Retention Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Retention Execution & Dry Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Execute the retention evaluation against current database records and storage files. Active exam sessions and ongoing open security incidents are always protected from deletion.
          </p>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={runningRetention}
              onClick={() => handleRunRetention(true)}
            >
              🔍 Run Dry Run (Preview Only)
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={runningRetention}
              onClick={() => handleRunRetention(false)}
            >
              🗑️ Execute Permanent Purge
            </Button>
          </div>

          {retentionResult && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">
                  Retention Result: {retentionResult.dryRun ? 'Dry Run Preview' : 'Purge Completed'}
                </span>
                <Badge variant={retentionResult.dryRun ? 'neutral' : 'default'}>
                  {retentionResult.dryRun ? 'SIMULATED' : 'EXECUTED'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Expired Sessions</div>
                  <div className="font-bold text-base text-slate-900">{retentionResult.sessionsPurged}</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Verification Logs</div>
                  <div className="font-bold text-base text-slate-900">{retentionResult.verificationLogsPurged}</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Evidence Files</div>
                  <div className="font-bold text-base text-slate-900">{retentionResult.evidencePurged}</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Audit Logs</div>
                  <div className="font-bold text-base text-slate-900">{retentionResult.auditLogsPurged}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
