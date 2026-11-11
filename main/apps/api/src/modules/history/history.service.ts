import { Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { buildVerificationWhere } from '../../lib/filters.js';
import { VerificationHistoryQuery } from './history.schemas.js';
import { formatCsvRow, setCsvHeaders } from '../../lib/csv-stream.js';
import { auditService } from '../audit/audit.service.js';

export interface VerificationHistoryItem {
  id: string;
  sessionId: string;
  studentUserId: string;
  studentName?: string;
  studentEmail?: string;
  examId: string;
  examTitle?: string;
  sequenceNo: number;
  phase: string;
  outcome: string;
  errorCode: string;
  similarityRaw: number | null;
  similarityPct: number | null;
  thresholdPct: number;
  faceCount: number | null;
  visionMs: number | null;
  processingMs: number;
  clientCapturedAt: string | null;
  linkedIncidentCode: string | null;
  linkedTriggerType: string | null;
  createdAt: string;
}

export class HistoryService {
  async listVerifications(query: VerificationHistoryQuery): Promise<{
    items: VerificationHistoryItem[];
    nextCursor: string | null;
  }> {
    const where = buildVerificationWhere(query);
    const limit = query.limit || 50;
    const sort = query.sort || 'desc';

    if (query.cursor) {
      try {
        const decoded = Buffer.from(query.cursor, 'base64').toString('utf8');
        const [cDateStr, cIdStr] = decoded.split('_');
        const cDate = new Date(cDateStr);
        const cId = BigInt(cIdStr);

        if (sort === 'desc') {
          where.OR = [
            { createdAt: { lt: cDate } },
            {
              createdAt: cDate,
              id: { lt: cId },
            },
          ];
        } else {
          where.OR = [
            { createdAt: { gt: cDate } },
            {
              createdAt: cDate,
              id: { gt: cId },
            },
          ];
        }
      } catch {
        // Invalid cursor ignored
      }
    }

    const rows = await prisma.verificationLog.findMany({
      where,
      take: limit + 1,
      orderBy: [
        { createdAt: sort },
        { id: sort },
      ],
      include: {
        studentUser: {
          select: {
            fullName: true,
            email: true,
          },
        },
        exam: {
          select: {
            title: true,
          },
        },
        trigger: {
          select: {
            incidentCode: true,
            triggerType: true,
          },
        },
      },
    });

    const hasNext = rows.length > limit;
    const itemsToReturn = hasNext ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasNext && itemsToReturn.length > 0) {
      const last = itemsToReturn[itemsToReturn.length - 1];
      const cursorPayload = `${last.createdAt.toISOString()}_${last.id.toString()}`;
      nextCursor = Buffer.from(cursorPayload).toString('base64');
    }

    const items: VerificationHistoryItem[] = itemsToReturn.map((r) => ({
      id: r.id.toString(),
      sessionId: r.sessionId,
      studentUserId: r.studentUserId,
      studentName: r.studentUser?.fullName,
      studentEmail: r.studentUser?.email,
      examId: r.examId,
      examTitle: r.exam?.title,
      sequenceNo: r.sequenceNo,
      phase: r.phase,
      outcome: r.outcome,
      errorCode: r.errorCode,
      similarityRaw: r.similarityRaw,
      similarityPct: r.similarityPct,
      thresholdPct: r.thresholdPct,
      faceCount: r.faceCount,
      visionMs: r.visionMs,
      processingMs: r.processingMs,
      clientCapturedAt: r.clientCapturedAt ? r.clientCapturedAt.toISOString() : null,
      linkedIncidentCode: r.trigger?.incidentCode ?? null,
      linkedTriggerType: r.trigger?.triggerType ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      nextCursor,
    };
  }

  async getSummary(query: VerificationHistoryQuery): Promise<{
    totalAttempts: number;
    outcomeCounts: Record<string, number>;
    avgProcessingMs: number;
    p95ProcessingMs: number;
  }> {
    const where = buildVerificationWhere(query);

    const [totalAttempts, outcomeGroups, avgResult] = await Promise.all([
      prisma.verificationLog.count({ where }),
      prisma.verificationLog.groupBy({
        by: ['outcome'],
        where,
        _count: {
          _all: true,
        },
      }),
      prisma.verificationLog.aggregate({
        where,
        _avg: {
          processingMs: true,
        },
      }),
    ]);

    const outcomeCounts: Record<string, number> = {};
    for (const g of outcomeGroups) {
      outcomeCounts[g.outcome] = g._count._all;
    }

    const avgProcessingMs = Math.round(avgResult._avg.processingMs || 0);

    // Estimate p95 processing time from top 5% limit
    let p95ProcessingMs = avgProcessingMs;
    if (totalAttempts > 0) {
      const offset = Math.max(0, Math.floor(totalAttempts * 0.05) - 1);
      const topRows = await prisma.verificationLog.findMany({
        where,
        select: { processingMs: true },
        orderBy: { processingMs: 'desc' },
        skip: Math.min(offset, 1000), // Bound offset
        take: 1,
      });
      if (topRows.length > 0) {
        p95ProcessingMs = topRows[0].processingMs;
      }
    }

    return {
      totalAttempts,
      outcomeCounts,
      avgProcessingMs,
      p95ProcessingMs,
    };
  }

  async streamExport(
    res: Response,
    query: VerificationHistoryQuery,
    adminUserId: string,
    maxRows = 1000000
  ): Promise<void> {
    const where = buildVerificationWhere(query);
    const filename = `verification_history_${Date.now()}.csv`;

    setCsvHeaders(res, filename);

    const headers = [
      'Timestamp (UTC)',
      'Attempt ID',
      'Session ID',
      'Student Name',
      'Student Email',
      'Exam Title',
      'Sequence No',
      'Phase',
      'Outcome',
      'Error Code',
      'Similarity %',
      'Similarity Raw',
      'Threshold %',
      'Face Count',
      'Vision (ms)',
      'Processing (ms)',
      'Linked Incident Code',
      'Linked Trigger Type',
    ];
    res.write(formatCsvRow(headers));

    let exportedCount = 0;
    let lastCreatedAt: Date | null = null;
    let lastId: bigint | null = null;
    const batchSize = 1000;

    while (exportedCount < maxRows) {
      const batchWhere = { ...where };
      if (lastCreatedAt && lastId !== null) {
        batchWhere.OR = [
          { createdAt: { lt: lastCreatedAt } },
          { createdAt: lastCreatedAt, id: { lt: lastId } },
        ];
      }

      const rows = await prisma.verificationLog.findMany({
        where: batchWhere,
        take: Math.min(batchSize, maxRows - exportedCount),
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        include: {
          studentUser: { select: { fullName: true, email: true } },
          exam: { select: { title: true } },
          trigger: { select: { incidentCode: true, triggerType: true } },
        },
      });

      if (rows.length === 0) {
        break;
      }

      for (const r of rows) {
        const line = formatCsvRow([
          r.createdAt.toISOString(),
          r.id.toString(),
          r.sessionId,
          r.studentUser?.fullName ?? '',
          r.studentUser?.email ?? '',
          r.exam?.title ?? '',
          r.sequenceNo,
          r.phase,
          r.outcome,
          r.errorCode,
          r.similarityPct ?? '',
          r.similarityRaw ?? '',
          r.thresholdPct,
          r.faceCount ?? '',
          r.visionMs ?? '',
          r.processingMs,
          r.trigger?.incidentCode ?? '',
          r.trigger?.triggerType ?? '',
        ]);
        res.write(line);
      }

      exportedCount += rows.length;
      const last = rows[rows.length - 1];
      lastCreatedAt = last.createdAt;
      lastId = last.id;

      if (rows.length < batchSize) {
        break;
      }
    }

    if (exportedCount >= maxRows) {
      res.write(formatCsvRow(['[TRUNCATED: Maximum export limit reached]']));
    }

    res.end();

    // Audit log generation
    await auditService.recordAudit({
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'EXPORT_GENERATED',
      entityType: 'VERIFICATION_HISTORY',
      details: {
        filename,
        exportedCount,
        filters: query,
      },
    });
  }
}

export const historyService = new HistoryService();

