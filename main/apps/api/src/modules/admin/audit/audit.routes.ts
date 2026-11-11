import { Router } from 'express';
import { queryAuditLogs } from '../../audit/audit.query.js';
import { formatCsvRow, setCsvHeaders } from '../../../lib/csv-stream.js';
import { auditService } from '../../audit/audit.service.js';

export const auditRouter = Router();

/**
 * GET /admin/audit-logs
 * Keyset-paginated and filterable administrative audit logs.
 */
auditRouter.get('/audit-logs', async (req, res, next) => {
  try {
    const { action, actorId, entityType, entityId, from, to, cursor, limit } = req.query;

    const result = await queryAuditLogs({
      action: action ? String(action) : undefined,
      actorId: actorId ? String(actorId) : undefined,
      entityType: entityType ? String(entityType) : undefined,
      entityId: entityId ? String(entityId) : undefined,
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      cursor: cursor ? String(cursor) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      data: result.items,
      meta: {
        nextCursor: result.nextCursor,
        limit: limit ? Number(limit) : 25,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/audit-logs/evidence-access
 * Filter shortcut specifically for biometric and evidence access history.
 */
auditRouter.get('/audit-logs/evidence-access', async (req, res, next) => {
  try {
    const { actorId, from, to, cursor, limit } = req.query;

    const result = await queryAuditLogs({
      actions: [
        'ENROLLMENT_IMAGE_ACCESSED',
        'ENROLLMENT_IMAGE_INTEGRITY_FAILURE',
        'IMAGE_FILE_MISSING',
        'EVIDENCE_ACCESSED',
        'EVIDENCE_IMAGE_ACCESSED',
        'EVIDENCE_INTEGRITY_FAILURE',
      ],
      actorId: actorId ? String(actorId) : undefined,
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      cursor: cursor ? String(cursor) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      data: result.items,
      meta: {
        nextCursor: result.nextCursor,
        limit: limit ? Number(limit) : 25,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/audit-logs/export.csv
 * Streamed CSV export of audit logs with formula injection defense.
 */
auditRouter.get('/audit-logs/export.csv', async (req, res, next) => {
  try {
    const { action, actorId, entityType, from, to } = req.query;
    const filename = `audit_logs_${Date.now()}.csv`;

    setCsvHeaders(res, filename);

    res.write(
      formatCsvRow([
        'Timestamp (UTC)',
        'ID',
        'Action',
        'Actor Email',
        'Actor Role',
        'Entity Type',
        'Entity ID',
        'IP Hash',
      ])
    );

    let exported = 0;
    let nextCursor: string | undefined = undefined;

    while (exported < 100000) {
      const result = await queryAuditLogs({
        action: action ? String(action) : undefined,
        actorId: actorId ? String(actorId) : undefined,
        entityType: entityType ? String(entityType) : undefined,
        from: from ? String(from) : undefined,
        to: to ? String(to) : undefined,
        cursor: nextCursor,
        limit: 1000,
      });

      if (result.items.length === 0) break;

      for (const item of result.items) {
        res.write(
          formatCsvRow([
            item.createdAt,
            item.id,
            item.action,
            item.actorEmail ?? '',
            item.actorRole,
            item.entityType,
            item.entityId ?? '',
            item.ipHash ?? '',
          ])
        );
      }

      exported += result.items.length;
      if (!result.nextCursor) break;
      nextCursor = result.nextCursor;
    }

    res.end();

    if (req.user) {
      await auditService.recordAudit({
        actorUserId: req.user.id,
        actorRole: 'ADMIN',
        action: 'EXPORT_GENERATED',
        entityType: 'AUDIT_LOGS',
        details: { filename, exportedCount: exported },
      });
    }
  } catch (err) {
    next(err);
  }
});
