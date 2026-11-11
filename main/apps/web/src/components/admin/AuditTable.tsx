'use client';

import React, { useState } from 'react';
import type { AuditLogDto } from '@examguard/shared';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';

export interface AuditTableProps {
  logs: AuditLogDto[];
  loading?: boolean;
}

export function AuditTable({ logs, loading = false }: AuditTableProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLogDto | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 animate-pulse">
        Loading audit entries...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
        <span className="text-3xl mb-2 block">📋</span>
        <h3 className="text-base font-semibold text-slate-800">No audit records found</h3>
        <p className="text-xs text-slate-500 mt-1">
          No events match the selected filters or timeframe.
        </p>
      </div>
    );
  }

  const formatActionBadge = (action: string) => {
    if (action.includes('REJECT') || action.includes('REVOKE') || action.includes('FAILURE')) {
      return <Badge variant="danger">{action}</Badge>;
    }
    if (action.includes('APPROVE') || action.includes('REACTIVATE')) {
      return <Badge variant="success">{action}</Badge>;
    }
    if (action.includes('ACCESSED') || action.includes('LOGIN')) {
      return <Badge variant="default">{action}</Badge>;
    }
    return <Badge variant="default">{action}</Badge>;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Request ID</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>{formatActionBadge(log.action)}</TableCell>
              <TableCell>
                <div>
                  <span className="font-medium text-slate-800 text-xs">
                    {log.actorName || log.actorRole}
                  </span>
                  {log.actorEmail && (
                    <div className="text-[11px] text-slate-400">{log.actorEmail}</div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-mono text-xs text-slate-700">
                  <span className="font-semibold">{log.entityType}</span>
                  {log.entityId && (
                    <span className="text-slate-400 block text-[10px] truncate max-w-[150px]">
                      {log.entityId}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-[11px] text-slate-400 truncate max-w-[120px]">
                {log.requestId || '—'}
              </TableCell>
              <TableCell className="text-right">
                <button
                  onClick={() => setSelectedLog(log)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded hover:bg-blue-50"
                >
                  View JSON
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* JSON Payload Inspection Modal */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Audit Event: ${selectedLog?.action}`}
        description={`Logged at ${selectedLog ? new Date(selectedLog.createdAt).toISOString() : ''}`}
        maxWidth="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div>
                <span className="text-slate-400">Actor:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {selectedLog.actorEmail || selectedLog.actorRole}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Entity:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {selectedLog.entityType} {selectedLog.entityId ? `(${selectedLog.entityId})` : ''}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {selectedLog.before && (
                <div>
                  <h5 className="text-xs font-bold text-slate-700 mb-1">State Before:</h5>
                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.before, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.after && (
                <div>
                  <h5 className="text-xs font-bold text-slate-700 mb-1">State After:</h5>
                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
