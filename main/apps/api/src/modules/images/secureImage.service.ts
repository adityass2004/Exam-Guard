import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { EvidenceIntegrityError, readDecryptedImage } from '../../lib/storage.js';
import { auditService } from '../audit/audit.service.js';

export interface ServeProtectedImageOptions {
  kind: 'ENROLLMENT' | 'EVIDENCE';
  imageId: string;
  actorUserId: string;
  actorRole: UserRole;
  requestId?: string;
  reqIp?: string;
  res: Response;
}

/**
 * Reusable protected image delivery service.
 * Used for candidate face enrollment images (P04) and incident trigger evidence images (P08).
 *
 * Guarantees:
 * 1. Role verification (must be ADMIN)
 * 2. Record lookup & hard-delete checks
 * 3. AES-256-GCM decryption & SHA-256 integrity validation
 * 4. Audit-before-serve: every access is audited; if audit fails, image is NOT served
 * 5. Strict security headers: Cache-Control: no-store, private, X-Content-Type-Options: nosniff
 */
export async function serveProtectedImage(options: ServeProtectedImageOptions): Promise<void> {
  const { kind, imageId, actorUserId, actorRole, requestId, reqIp, res } = options;

  if (actorRole !== UserRole.ADMIN) {
    throw new AppError('FORBIDDEN', 403, 'Administrator access required to view protected images');
  }

  let studentUserId: string;
  let storagePath: string;
  let sha256: string;
  let mime: string;
  let encIv: Buffer;
  let encTag: Buffer;
  let encKeyVersion: number;

  if (kind === 'ENROLLMENT') {
    const enrollmentImage = await prisma.faceEnrollmentImage.findUnique({
      where: { id: imageId },
      include: {
        faceProfile: {
          include: {
            studentUser: true,
          },
        },
      },
    });

    if (!enrollmentImage || !enrollmentImage.faceProfile?.studentUser) {
      throw new AppError('NOT_FOUND', 404, 'Enrollment image not found');
    }

    if (enrollmentImage.faceProfile.studentUser.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Associated student account has been removed');
    }

    studentUserId = enrollmentImage.faceProfile.studentUserId;
    storagePath = enrollmentImage.storagePath;
    sha256 = enrollmentImage.sha256;
    mime = enrollmentImage.mime;
    encIv = Buffer.from(enrollmentImage.encIv);
    encTag = Buffer.from(enrollmentImage.encTag);
    encKeyVersion = enrollmentImage.encKeyVersion;
  } else {
    // EVIDENCE (P08 trigger evidence)
    const evidence = await prisma.triggerEvidence.findUnique({
      where: { id: imageId },
      include: {
        trigger: {
          include: {
            studentUser: true,
          },
        },
      },
    });

    if (!evidence || !evidence.trigger?.studentUser) {
      throw new AppError('NOT_FOUND', 404, 'Evidence image not found');
    }

    if (evidence.trigger.studentUser.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Associated student account has been removed');
    }

    studentUserId = evidence.trigger.studentUserId;
    storagePath = evidence.storagePath;
    sha256 = evidence.sha256;
    mime = evidence.mime;
    encIv = Buffer.from(evidence.encIv);
    encTag = Buffer.from(evidence.encTag);
    encKeyVersion = evidence.encKeyVersion;
  }

  // Decrypt and verify integrity
  let decryptedBytes: Buffer;
  try {
    decryptedBytes = await readDecryptedImage({
      relativePath: storagePath,
      iv: encIv,
      tag: encTag,
      expectedSha256: sha256,
      keyVersion: encKeyVersion,
    });
  } catch (err: unknown) {
    if (err instanceof EvidenceIntegrityError) {
      // Tampered image or checksum mismatch
      await auditService.record({
        actorUserId,
        actorRole,
        action: kind === 'ENROLLMENT' ? 'ENROLLMENT_IMAGE_INTEGRITY_FAILURE' : 'EVIDENCE_INTEGRITY_FAILURE',
        entityType: kind === 'ENROLLMENT' ? 'FaceEnrollmentImage' : 'TriggerEvidence',
        entityId: imageId,
        after: {
          studentUserId,
          storagePath,
          error: (err as Error).message,
        },
        requestId,
        ip: reqIp,
      });

      throw new AppError('IMAGE_INTEGRITY_FAILED', 409, 'Image integrity check failed: file has been tampered with or corrupted');
    }

    if (err instanceof AppError && err.code === 'NOT_FOUND') {
      // File missing on disk
      await auditService.record({
        actorUserId,
        actorRole,
        action: 'IMAGE_FILE_MISSING',
        entityType: kind === 'ENROLLMENT' ? 'FaceEnrollmentImage' : 'TriggerEvidence',
        entityId: imageId,
        after: {
          studentUserId,
          storagePath,
          error: 'File does not exist on disk',
        },
        requestId,
        ip: reqIp,
      });

      throw new AppError('IMAGE_FILE_MISSING', 500, 'Image file is missing from private storage');
    }

    throw err;
  }

  // Audit BEFORE serving: every access must be recorded; fail closed if audit fails
  const auditAction = kind === 'ENROLLMENT' ? 'ENROLLMENT_IMAGE_ACCESSED' : 'EVIDENCE_IMAGE_ACCESSED';
  try {
    await auditService.recordStrict({
      actorUserId,
      actorRole,
      action: auditAction,
      entityType: kind === 'ENROLLMENT' ? 'FaceEnrollmentImage' : 'TriggerEvidence',
      entityId: imageId,
      after: {
        studentUserId,
        byteSize: decryptedBytes.length,
      },
      requestId,
      ip: reqIp,
    });
  } catch (auditErr: unknown) {
    logger.error({ auditErr, imageId, actorUserId }, 'Failed to record image access audit log - refusing to serve image');
    throw new AppError('INTERNAL_ERROR', 500, 'Security audit check failed: access denied');
  }

  // Send protected bytes with strict caching prevention
  res.setHeader('Content-Type', mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.status(200).send(decryptedBytes);
}
