import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  IncidentFilterQuery,
  IncidentStatus,
  ReviewDisposition,
  SecurityIncidentDto,
} from '@examguard/shared';
import { verificationEventBus } from '../verification/eventBus.js';

export const INCIDENT_STANDING_DISCLAIMER =
  'Automated detection indicates a possible identity discrepancy and is not proof of misconduct. Review evidence and context before any decision.';

export class IncidentsService {
  async listIncidents(query: IncidentFilterQuery): Promise<{
    items: SecurityIncidentDto[];
    nextCursor?: string;
  }> {
    const {
      status,
      severity,
      triggerType,
      examId,
      studentUserId,
      ongoingOnly,
      evidenceFailedOnly,
      cursor,
      limit = 50,
    } = query;

    const where: any = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (triggerType) where.triggerType = triggerType;
    if (examId) where.examId = examId;
    if (studentUserId) where.studentUserId = studentUserId;
    if (ongoingOnly) where.activeDedupeKey = { not: null };
    if (evidenceFailedOnly) where.evidenceStatus = 'FAILED';

    const incidents = await prisma.securityTrigger.findMany({
      where,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { firstDetectedAt: 'desc' },
      include: {
        studentUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentProfile: { select: { studentId: true } },
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
          },
        },
        evidence: true,
      },
    });

    let nextCursor: string | undefined = undefined;
    if (incidents.length > limit) {
      const nextItem = incidents.pop();
      nextCursor = nextItem?.id;
    }

    const items: SecurityIncidentDto[] = incidents.map((inc) => ({
      id: inc.id,
      incidentCode: inc.incidentCode,
      sessionId: inc.sessionId,
      studentUserId: inc.studentUserId,
      studentName: inc.studentUser?.fullName,
      studentEmail: inc.studentUser?.email,
      examId: inc.examId,
      examTitle: inc.exam?.title,
      triggerType: inc.triggerType,
      severity: inc.severity,
      status: inc.status,
      disposition: inc.disposition,
      activeDedupeKey: inc.activeDedupeKey,
      firstDetectedAt: inc.firstDetectedAt.toISOString(),
      lastDetectedAt: inc.lastDetectedAt.toISOString(),
      recoveredAt: inc.recoveredAt?.toISOString() ?? null,
      occurrenceCount: inc.occurrenceCount,
      firstSimilarityPct: inc.firstSimilarityPct,
      worstSimilarityPct: inc.worstSimilarityPct,
      firstVerificationLogId: inc.firstVerificationLogId.toString(),
      lastVerificationLogId: inc.lastVerificationLogId.toString(),
      evidenceStatus: inc.evidenceStatus,
      evidenceFailureReason: inc.evidenceFailureReason,
      acknowledgedBy: inc.acknowledgedBy,
      acknowledgedAt: inc.acknowledgedAt?.toISOString() ?? null,
      reviewedBy: inc.reviewedBy,
      reviewedAt: inc.reviewedAt?.toISOString() ?? null,
      createdAt: inc.createdAt.toISOString(),
      evidence: inc.evidence
        ? {
            id: inc.evidence.id,
            triggerId: inc.evidence.triggerId,
            verificationLogId: inc.evidence.verificationLogId.toString(),
            storagePath: inc.evidence.storagePath,
            sha256: inc.evidence.sha256,
            mime: inc.evidence.mime,
            byteSize: inc.evidence.byteSize,
            width: inc.evidence.width,
            height: inc.evidence.height,
            capturedAt: inc.evidence.capturedAt.toISOString(),
            createdAt: inc.evidence.createdAt.toISOString(),
          }
        : null,
    }));

    return { items, nextCursor };
  }

  async getIncidentDetail(id: string, viewerAdminId: string): Promise<any> {
    const incident = await prisma.securityTrigger.findUnique({
      where: { id },
      include: {
        studentUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentProfile: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            durationMinutes: true,
          },
        },
        session: {
          include: {
            faceProfile: {
              include: {
                images: {
                  select: {
                    id: true,
                    angle: true,
                    width: true,
                    height: true,
                  },
                },
              },
            },
          },
        },
        evidence: true,
        investigationLogs: {
          include: {
            adminUser: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!incident) {
      throw new AppError('NOT_FOUND', 404, 'Security incident not found');
    }

    // Record VIEWED investigation log entry at most once per admin per incident per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentView = await prisma.adminInvestigationLog.findFirst({
      where: {
        triggerId: incident.id,
        adminUserId: viewerAdminId,
        action: 'VIEWED',
        createdAt: { gte: oneHourAgo },
      },
    });

    if (!recentView) {
      await prisma.adminInvestigationLog.create({
        data: {
          triggerId: incident.id,
          adminUserId: viewerAdminId,
          action: 'VIEWED',
        },
      });
    }

    // Query related verification logs in bounded window around firstVerificationLogId & lastVerificationLogId
    const firstLog = await prisma.verificationLog.findUnique({
      where: { id: incident.firstVerificationLogId },
      select: { sequenceNo: true },
    });
    const lastLog = await prisma.verificationLog.findUnique({
      where: { id: incident.lastVerificationLogId },
      select: { sequenceNo: true },
    });

    const startSeq = Math.max(1, (firstLog?.sequenceNo ?? 1) - 20);
    const endSeq = (lastLog?.sequenceNo ?? 1) + 20;

    const relatedLogs = await prisma.verificationLog.findMany({
      where: {
        sessionId: incident.sessionId,
        sequenceNo: { gte: startSeq, lte: endSeq },
      },
      orderBy: { sequenceNo: 'asc' },
      select: {
        id: true,
        sequenceNo: true,
        outcome: true,
        errorCode: true,
        similarityPct: true,
        similarityRaw: true,
        thresholdPct: true,
        createdAt: true,
        triggerId: true,
      },
    });

    // Registered photographs from the approved profile used by the session
    const registeredImages =
      incident.session?.faceProfile?.images.map((img) => ({
        id: img.id,
        angle: img.angle,
        url: `/api/v1/admin/images/enrollment/${img.id}`,
        width: img.width,
        height: img.height,
      })) || [];

    const evidenceData = incident.evidence
      ? {
          id: incident.evidence.id,
          triggerId: incident.evidence.triggerId,
          sha256: incident.evidence.sha256,
          byteSize: incident.evidence.byteSize,
          width: incident.evidence.width,
          height: incident.evidence.height,
          capturedAt: incident.evidence.capturedAt.toISOString(),
          url: `/api/v1/admin/images/evidence/${incident.id}`,
        }
      : null;

    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incidentCode,
        triggerType: incident.triggerType,
        severity: incident.severity,
        status: incident.status,
        disposition: incident.disposition,
        isOngoing: incident.activeDedupeKey !== null,
        firstDetectedAt: incident.firstDetectedAt.toISOString(),
        lastDetectedAt: incident.lastDetectedAt.toISOString(),
        recoveredAt: incident.recoveredAt?.toISOString() ?? null,
        occurrenceCount: incident.occurrenceCount,
        firstSimilarityPct: incident.firstSimilarityPct,
        worstSimilarityPct: incident.worstSimilarityPct,
        evidenceStatus: incident.evidenceStatus,
        evidenceFailureReason: incident.evidenceFailureReason,
        acknowledgedBy: incident.acknowledgedBy,
        acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
        reviewedBy: incident.reviewedBy,
        reviewedAt: incident.reviewedAt?.toISOString() ?? null,
        disclaimer: INCIDENT_STANDING_DISCLAIMER,
      },
      student: {
        id: incident.studentUser.id,
        fullName: incident.studentUser.fullName,
        email: incident.studentUser.email,
        studentId: incident.studentUser.studentProfile?.studentId || 'N/A',
      },
      exam: {
        id: incident.exam.id,
        title: incident.exam.title,
        durationMinutes: incident.exam.durationMinutes,
      },
      session: {
        id: incident.session.id,
        status: incident.session.status,
        startedAt: incident.session.startedAt?.toISOString() ?? null,
        totalAttempts: incident.session.totalAttempts,
        matchCount: incident.session.matchCount,
        mismatchCount: incident.session.mismatchCount,
      },
      evidence: evidenceData,
      registeredImages,
      timelineLogs: relatedLogs.map((l) => ({
        id: l.id.toString(),
        sequenceNo: l.sequenceNo,
        outcome: l.outcome,
        errorCode: l.errorCode,
        similarityPct: l.similarityPct,
        thresholdPct: l.thresholdPct,
        timestamp: l.createdAt.toISOString(),
        isTriggerAttempt: l.triggerId === incident.id,
      })),
      investigationLogs: incident.investigationLogs.map((log) => ({
        id: log.id,
        adminName: log.adminUser.fullName,
        action: log.action,
        disposition: log.disposition,
        note: log.note,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async acknowledgeIncident(id: string, adminUserId: string, note?: string): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      const incident = await tx.securityTrigger.findUnique({
        where: { id },
      });

      if (!incident) {
        throw new AppError('NOT_FOUND', 404, 'Security incident not found');
      }

      if (incident.status === IncidentStatus.REVIEWED) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          'Cannot acknowledge an incident that has already been reviewed'
        );
      }

      const now = new Date();

      // Idempotent re-acknowledge
      if (incident.status === IncidentStatus.ACKNOWLEDGED) {
        return {
          id: incident.id,
          status: incident.status,
          acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
        };
      }

      const updated = await tx.securityTrigger.update({
        where: { id },
        data: {
          status: IncidentStatus.ACKNOWLEDGED,
          acknowledgedBy: adminUserId,
          acknowledgedAt: now,
        },
      });

      await tx.adminInvestigationLog.create({
        data: {
          triggerId: incident.id,
          adminUserId,
          action: 'ACKNOWLEDGED',
          note: note || null,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: 'ADMIN',
          action: 'INCIDENT_ACKNOWLEDGED',
          entityType: 'SECURITY_TRIGGER',
          entityId: incident.id,
          after: {
            status: IncidentStatus.ACKNOWLEDGED,
            acknowledgedAt: now.toISOString(),
            note,
          },
        },
      });

      verificationEventBus.emit('incident.status_changed', {
        incidentId: incident.id,
        incidentCode: incident.incidentCode,
        sessionId: incident.sessionId,
        status: IncidentStatus.ACKNOWLEDGED,
        updatedBy: adminUserId,
        updatedAt: now.toISOString(),
      });

      return {
        id: updated.id,
        status: updated.status,
        acknowledgedAt: now.toISOString(),
      };
    });
  }

  async reviewIncident(
    id: string,
    adminUserId: string,
    disposition: ReviewDisposition,
    note?: string
  ): Promise<any> {
    if (disposition === 'CONFIRMED_CONCERN' && (!note || note.trim().length < 10)) {
      throw new AppError('VALIDATION_ERROR', 400, 'A note of at least 10 characters is required when confirming concern');
    }

    return await prisma.$transaction(async (tx) => {
      const incident = await tx.securityTrigger.findUnique({
        where: { id },
      });

      if (!incident) {
        throw new AppError('NOT_FOUND', 404, 'Security incident not found');
      }

      const now = new Date();

      const updated = await tx.securityTrigger.update({
        where: { id },
        data: {
          status: IncidentStatus.REVIEWED,
          disposition,
          reviewedBy: adminUserId,
          reviewedAt: now,
        },
      });

      await tx.adminInvestigationLog.create({
        data: {
          triggerId: incident.id,
          adminUserId,
          action: 'REVIEWED',
          disposition,
          note: note || null,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: 'ADMIN',
          action: 'INCIDENT_REVIEWED',
          entityType: 'SECURITY_TRIGGER',
          entityId: incident.id,
          after: {
            status: IncidentStatus.REVIEWED,
            disposition,
            reviewedAt: now.toISOString(),
            note,
          },
        },
      });

      verificationEventBus.emit('incident.status_changed', {
        incidentId: incident.id,
        incidentCode: incident.incidentCode,
        sessionId: incident.sessionId,
        status: IncidentStatus.REVIEWED,
        disposition,
        updatedBy: adminUserId,
        updatedAt: now.toISOString(),
      });

      return {
        id: updated.id,
        status: updated.status,
        disposition: updated.disposition,
        reviewedAt: now.toISOString(),
      };
    });
  }

  async addNote(id: string, adminUserId: string, note: string): Promise<any> {
    if (!note || note.trim().length === 0 || note.length > 2000) {
      throw new AppError('VALIDATION_ERROR', 400, 'Note must be between 1 and 2000 characters');
    }

    return await prisma.$transaction(async (tx) => {
      const incident = await tx.securityTrigger.findUnique({
        where: { id },
      });

      if (!incident) {
        throw new AppError('NOT_FOUND', 404, 'Security incident not found');
      }

      const log = await tx.adminInvestigationLog.create({
        data: {
          triggerId: incident.id,
          adminUserId,
          action: 'NOTE',
          note: note.trim(),
        },
        include: {
          adminUser: { select: { fullName: true } },
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: 'ADMIN',
          action: 'INCIDENT_NOTE_ADDED',
          entityType: 'SECURITY_TRIGGER',
          entityId: incident.id,
          after: {
            note: note.trim(),
          },
        },
      });

      return {
        id: log.id,
        adminName: log.adminUser.fullName,
        action: log.action,
        note: log.note,
        createdAt: log.createdAt.toISOString(),
      };
    });
  }
}

export const incidentsService = new IncidentsService();
