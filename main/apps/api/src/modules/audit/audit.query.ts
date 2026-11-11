import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { AuditLogDto } from '@examguard/shared';

export interface AuditQueryFilters {
  action?: string;
  actions?: string[];
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function queryAuditLogs(filters: AuditQueryFilters): Promise<{
  items: AuditLogDto[];
  nextCursor: string | null;
}> {
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
  const where: Prisma.AdminAuditLogWhereInput = {};

  if (filters.action) {
    where.action = filters.action;
  } else if (filters.actions && filters.actions.length > 0) {
    where.action = { in: filters.actions };
  }

  if (filters.actorId) {
    where.actorUserId = filters.actorId;
  }

  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters.entityId) {
    where.entityId = filters.entityId;
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      const fromDate = new Date(filters.from);
      if (!isNaN(fromDate.getTime())) {
        where.createdAt.gte = fromDate;
      }
    }
    if (filters.to) {
      const toDate = new Date(filters.to);
      if (!isNaN(toDate.getTime())) {
        where.createdAt.lte = toDate;
      }
    }
  }

  const cursorClause = filters.cursor
    ? {
        id: BigInt(filters.cursor),
      }
    : undefined;

  const rows = await prisma.adminAuditLog.findMany({
    where,
    take: limit + 1,
    skip: cursorClause ? 1 : 0,
    cursor: cursorClause ? { id: cursorClause.id } : undefined,
    orderBy: { id: 'desc' },
    include: {
      actor: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > limit) {
    const nextItem = rows[limit];
    nextCursor = nextItem.id.toString();
    pageRows = rows.slice(0, limit);
  }

  const items: AuditLogDto[] = pageRows.map((row) => ({
    id: row.id.toString(),
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    actorEmail: row.actor?.email ?? null,
    actorName: row.actor?.fullName ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    requestId: row.requestId,
    ipHash: row.ipHash,
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, nextCursor };
}
