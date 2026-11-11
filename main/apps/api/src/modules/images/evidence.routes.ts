import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { EvidenceIntegrityError, readDecryptedImage } from '../../lib/storage.js';
import { verificationEventBus } from '../verification/eventBus.js';

export const evidenceImageRouter = Router();

evidenceImageRouter.use(requireAuth, requireRole('ADMIN'));

evidenceImageRouter.get('/:triggerId', async (req, res, next) => {
  const { triggerId } = req.params;
  const adminUserId = req.user!.id;

  try {
    const evidence = await prisma.triggerEvidence.findUnique({
      where: { triggerId },
      include: {
        trigger: {
          select: {
            id: true,
            incidentCode: true,
            studentUserId: true,
            sessionId: true,
          },
        },
      },
    });

    if (!evidence) {
      throw new AppError('NOT_FOUND', 404, 'Evidence image record not found');
    }

    let plaintextBuffer: Buffer;

    try {
      plaintextBuffer = await readDecryptedImage({
        relativePath: evidence.storagePath,
        iv: Buffer.from(evidence.encIv),
        tag: Buffer.from(evidence.encTag),
        expectedSha256: evidence.sha256,
      });
    } catch (err: any) {
      if (err instanceof EvidenceIntegrityError) {
        // Log tamper / integrity failure to audit trail
        await prisma.adminAuditLog.create({
          data: {
            actorUserId: adminUserId,
            actorRole: 'ADMIN',
            action: 'EVIDENCE_INTEGRITY_FAILURE',
            entityType: 'TRIGGER_EVIDENCE',
            entityId: evidence.id,
            after: {
              triggerId: evidence.triggerId,
              expectedSha256: evidence.sha256,
              error: err.message,
            },
          },
        });

        await prisma.adminInvestigationLog.create({
          data: {
            triggerId: evidence.triggerId,
            adminUserId,
            action: 'EVIDENCE_INTEGRITY_FAILED',
            note: err.message,
          },
        });

        verificationEventBus.emitSystemWarning({
          code: 'EVIDENCE_INTEGRITY_FAILURE',
          message: `Evidence checksum/decryption failure for incident ${evidence.trigger?.incidentCode || triggerId}`,
          details: { triggerId, evidenceId: evidence.id },
          timestamp: new Date(),
        });

        res.status(409).json({
          success: false,
          error: {
            code: 'EVIDENCE_INTEGRITY_FAILED',
            message: 'Evidence image integrity verification failed: file may have been modified or corrupted',
          },
        });
        return;
      }
      throw err;
    }

    // Fail-Closed: Record audit and investigation log entry before serving bytes
    try {
      await prisma.$transaction(async (tx) => {
        await tx.adminAuditLog.create({
          data: {
            actorUserId: adminUserId,
            actorRole: 'ADMIN',
            action: 'EVIDENCE_ACCESSED',
            entityType: 'TRIGGER_EVIDENCE',
            entityId: evidence.id,
            after: {
              triggerId: evidence.triggerId,
              studentUserId: evidence.trigger?.studentUserId,
              sessionId: evidence.trigger?.sessionId,
            },
          },
        });

        await tx.adminInvestigationLog.create({
          data: {
            triggerId: evidence.triggerId,
            adminUserId,
            action: 'EVIDENCE_VIEWED',
          },
        });
      });
    } catch (err: any) {
      throw new AppError(
        'INTERNAL_ERROR',
        500,
        'Failed to record evidence access audit trail; image delivery refused'
      );
    }

    // Set secure delivery headers
    res.setHeader('Content-Type', evidence.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');

    res.send(plaintextBuffer);
  } catch (err) {
    next(err);
  }
});
