'use client';

import React, { useEffect, useState } from 'react';
import type { AuditLogDto } from '@examguard/shared';
import { apiClient } from '../../../../lib/api-client';
import { AuditTable } from '../../../../components/admin/AuditTable';
import { FilterBar } from '../../../../components/admin/FilterBar';
import { Button } from '../../../../components/ui/Button';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async (cursor?: string) => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = evidenceOnly
        ? '/admin/audit-logs/evidence-access'
        : '/admin/audit-logs';

      const params = new URLSearchParams();
      params.set('limit', '25');
      if (cursor) params.set('cursor', cursor);
      if (!evidenceOnly) {
        if (actionFilter) params.set('action', actionFilter);
        if (entityFilter) params.set('entityType', entityFilter);
      }

      const res = await apiClient.get<AuditLogDto[]>(`${endpoint}?${params.toString()}`);
      if (res.data) {
        if (cursor) {
          setLogs((prev) => [...prev, ...(res.data || [])]);
        } else {
          setLogs(res.data);
        }
      }
      setNextCursor(res.meta?.nextCursor || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter, evidenceOnly]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Security & Administration Audit Trail
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Immutable log of all administrative actions, credential changes, approvals, and biometric image accesses.
          </p>
        </div>

        {/* Evidence Access Quick Filter Shortcut */}
        <Button
          variant={evidenceOnly ? 'primary' : 'outline'}
          size="sm"
          onClick={() => {
            setEvidenceOnly(!evidenceOnly);
          }}
          className="self-start sm:self-auto text-xs"
        >
          {evidenceOnly ? '✓ Viewing Biometric/Evidence Access' : '📷 Filter Biometric Access History'}
        </Button>
      </div>

      {/* Filter Bar (when not in evidence-only mode) */}
      {!evidenceOnly && (
        <FilterBar
          searchValue=""
          onSearchChange={() => {}}
          searchPlaceholder="Filters active below..."
          filters={[
            {
              id: 'action',
              label: 'Action Filter',
              value: actionFilter,
              options: [
                { label: 'All Actions', value: '' },
                { label: 'ENROLLMENT_APPROVED', value: 'ENROLLMENT_APPROVED' },
                { label: 'ENROLLMENT_REJECTED', value: 'ENROLLMENT_REJECTED' },
                { label: 'ENROLLMENT_REVOKED', value: 'ENROLLMENT_REVOKED' },
                { label: 'ENROLLMENT_IMAGE_ACCESSED', value: 'ENROLLMENT_IMAGE_ACCESSED' },
                { label: 'ENROLLMENT_IMAGE_INTEGRITY_FAILURE', value: 'ENROLLMENT_IMAGE_INTEGRITY_FAILURE' },
                { label: 'BIOMETRIC_DATA_DELETED', value: 'BIOMETRIC_DATA_DELETED' },
                { label: 'STUDENT_PASSWORD_RESET', value: 'STUDENT_PASSWORD_RESET' },
                { label: 'STUDENT_SUSPENDED', value: 'STUDENT_SUSPENDED' },
                { label: 'STUDENT_REACTIVATED', value: 'STUDENT_REACTIVATED' },
                { label: 'STUDENT_SOFT_DELETED', value: 'STUDENT_SOFT_DELETED' },
                { label: 'SYSTEM_SETTINGS_UPDATED', value: 'SYSTEM_SETTINGS_UPDATED' },
              ],
              onChange: (val) => setActionFilter(val),
            },
            {
              id: 'entity',
              label: 'Entity Type',
              value: entityFilter,
              options: [
                { label: 'All Entities', value: '' },
                { label: 'User', value: 'User' },
                { label: 'FaceProfile', value: 'FaceProfile' },
                { label: 'FaceEnrollmentImage', value: 'FaceEnrollmentImage' },
                { label: 'DataDeletionRequest', value: 'DataDeletionRequest' },
                { label: 'SystemSetting', value: 'SystemSetting' },
              ],
              onChange: (val) => setEntityFilter(val),
            },
          ]}
          onReset={actionFilter || entityFilter ? () => {
            setActionFilter('');
            setEntityFilter('');
          } : undefined}
        />
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Audit Log Table */}
      <AuditTable logs={logs} loading={loading && logs.length === 0} />

      {/* Keyset Cursor Load More */}
      {nextCursor && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(nextCursor)}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load Older Events ↓'}
          </Button>
        </div>
      )}
    </div>
  );
}
