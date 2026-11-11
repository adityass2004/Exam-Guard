import { prisma } from '../../lib/prisma.js';
import { systemSettingsService } from '../settings/systemSettings.service.js';
import { Clock, SystemClock } from '../../lib/clock.js';
import { deleteStoredFile } from '../../lib/storage.js';
import { auditService } from '../audit/audit.service.js';
import { logger } from '../../lib/logger.js';

export interface RetentionResult {
  dryRun: boolean;
  sessionsPurged: number;
  verificationLogsPurged: number;
  evidencePurged: number;
  profilesPurged: number;
  auditLogsPurged: number;
  timestamp: string;
}

export class RetentionService {
  async runRetention(
    options: { dryRun?: boolean } = {},
    clock: Clock = new SystemClock(),
    adminUserId?: string
  ): Promise<RetentionResult> {
    const dryRun = options.dryRun ?? false;
    const now = clock.now();
    const settings = await systemSettingsService.getSettings();

    const result: RetentionResult = {
      dryRun,
      sessionsPurged: 0,
      verificationLogsPurged: 0,
      evidencePurged: 0,
      profilesPurged: 0,
      auditLogsPurged: 0,
      timestamp: now.toISOString(),
    };

    // 1. Expired Auth Sessions (always purged regardless of retention settings)
    const expiredSessionsCount = await prisma.authSession.count({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { revokedAt: { not: null } },
        ],
      },
    });

    result.sessionsPurged = expiredSessionsCount;
    if (!dryRun && expiredSessionsCount > 0) {
      await prisma.authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { not: null } },
          ],
        },
      });
    }

    // 2. Expired Verification Logs
    if (settings.retentionVerificationLogsDays > 0) {
      const cutoff = new Date(now.getTime() - settings.retentionVerificationLogsDays * 86400000);

      // Find sessions that are either LIVE or have ongoing incidents (protect them)
      const protectedSessions = await prisma.examSession.findMany({
        where: {
          OR: [
            { status: 'IN_PROGRESS' },
            { securityTriggers: { some: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } } },
          ],
        },
        select: { id: true },
      });
      const protectedSessionIds = protectedSessions.map((s) => s.id);

      const logsWhere = {
        createdAt: { lt: cutoff },
        sessionId: { notIn: protectedSessionIds },
      };

      const logsCount = await prisma.verificationLog.count({ where: logsWhere });
      result.verificationLogsPurged = logsCount;

      if (!dryRun && logsCount > 0) {
        // Delete in batches to avoid locking
        let deleted = 0;
        while (deleted < logsCount) {
          const batch = await prisma.verificationLog.findMany({
            where: logsWhere,
            select: { id: true },
            take: 1000,
          });
          if (batch.length === 0) break;

          await prisma.verificationLog.deleteMany({
            where: { id: { in: batch.map((b) => b.id) } },
          });
          deleted += batch.length;
        }
      }
    }

    // 3. Expired Trigger Evidence (files + rows)
    if (settings.retentionEvidenceDays > 0) {
      const cutoff = new Date(now.getTime() - settings.retentionEvidenceDays * 86400000);

      // Non-ongoing incidents only
      const eligibleEvidence = await prisma.triggerEvidence.findMany({
        where: {
          createdAt: { lt: cutoff },
          trigger: {
            status: 'REVIEWED',
          },
        },
        select: {
          id: true,
          triggerId: true,
          storagePath: true,
        },
      });

      result.evidencePurged = eligibleEvidence.length;

      if (!dryRun && eligibleEvidence.length > 0) {
        for (const ev of eligibleEvidence) {
          try {
            await deleteStoredFile(ev.storagePath);
          } catch (err: any) {
            logger.warn({ storagePath: ev.storagePath, err: err.message }, 'Failed to delete evidence file during retention');
          }

          await prisma.$transaction(async (tx) => {
            await tx.triggerEvidence.delete({ where: { id: ev.id } });
            await tx.securityTrigger.update({
              where: { id: ev.triggerId },
              data: {
                evidenceStatus: 'NOT_AVAILABLE',
              },
            });
          });
        }
      }
    }

    // 4. Expired Revoked / Superseded Face Profiles
    if (settings.retentionEnrollmentImagesDays > 0) {
      const cutoff = new Date(now.getTime() - settings.retentionEnrollmentImagesDays * 86400000);

      const staleProfiles = await prisma.faceProfile.findMany({
        where: {
          status: { in: ['REVOKED'] },
          updatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          images: { select: { storagePath: true } },
        },
      });

      result.profilesPurged = staleProfiles.length;

      if (!dryRun && staleProfiles.length > 0) {
        for (const prof of staleProfiles) {
          for (const img of prof.images) {
            try {
              await deleteStoredFile(img.storagePath);
            } catch (err: any) {
              logger.warn({ storagePath: img.storagePath }, 'Failed to delete enrollment image during retention');
            }
          }

          await prisma.faceProfile.delete({ where: { id: prof.id } });
        }
      }
    }

    // 5. Expired Audit Logs
    if (settings.retentionAuditLogsDays > 0) {
      const cutoff = new Date(now.getTime() - settings.retentionAuditLogsDays * 86400000);

      const auditCount = await prisma.adminAuditLog.count({
        where: { createdAt: { lt: cutoff } },
      });

      result.auditLogsPurged = auditCount;

      if (!dryRun && auditCount > 0) {
        await prisma.adminAuditLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
      }
    }

    // Final audit record of the retention operation
    if (!dryRun) {
      await auditService.recordAudit({
        actorUserId: adminUserId ?? null,
        actorRole: 'ADMIN',
        action: 'RETENTION_PURGE_EXECUTED',
        entityType: 'RETENTION_JOB',
        details: {
          ...result,
          dryRun: false,
        },
      });
    }

    return result;
  }
}

export const retentionService = new RetentionService();

