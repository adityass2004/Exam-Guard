import { DeletionRequestStatus, EnrollmentStatus, UserRole } from '@prisma/client';
import { AppError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { deleteStoredFile } from '../../../lib/storage.js';
import { referenceService } from '../../../lib/reference.service.js';
import { auditService } from '../../audit/audit.service.js';
import type { DataDeletionRequestDto } from '@examguard/shared';

export class AdminDeletionService {
  /**
   * List data deletion requests, optionally filtered by status.
   */
  async listRequests(query: {
    status?: DeletionRequestStatus;
    page?: number;
    limit?: number;
  }): Promise<{
    data: DataDeletionRequestDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [total, requests] = await Promise.all([
      prisma.dataDeletionRequest.count({ where }),
      prisma.dataDeletionRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { requestedAt: 'desc' },
        include: {
          studentUser: {
            include: {
              studentProfile: true,
            },
          },
          handler: {
            select: {
              email: true,
              fullName: true,
            },
          },
        },
      }),
    ]);

    const data: DataDeletionRequestDto[] = requests.map((req) => ({
      id: req.id,
      studentUserId: req.studentUserId,
      studentFullName: req.studentUser.fullName,
      studentId: req.studentUser.studentProfile?.studentId || 'N/A',
      studentEmail: req.studentUser.email,
      status: req.status,
      reason: req.reason,
      requestedAt: req.requestedAt.toISOString(),
      handledAt: req.handledAt ? req.handledAt.toISOString() : null,
      handlerEmail: req.handler?.email ?? null,
      handlerNote: req.handlerNote,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Fulfill a pending biometric data deletion request.
   * Atomically deletes all face embeddings and face enrollment image DB records,
   * revokes face profiles and enrollment cache, and audits with COUNTS ONLY.
   * After commit, securely unlinks encrypted image files from disk.
   */
  async fulfillRequest(
    requestId: string,
    adminUserId: string,
    reqIp?: string,
    reqId?: string,
  ): Promise<{
    deletedImagesCount: number;
    deletedEmbeddingsCount: number;
    profilesRevokedCount: number;
  }> {
    const request = await prisma.dataDeletionRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new AppError('NOT_FOUND', 404, 'Data deletion request not found');
    }

    if (request.status !== DeletionRequestStatus.PENDING) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        409,
        `Cannot fulfill data deletion request in status ${request.status}: must be PENDING`,
      );
    }

    const studentUserId = request.studentUserId;

    // Collect storage paths of files to delete after commit
    const imagesToPurge = await prisma.faceEnrollmentImage.findMany({
      where: {
        faceProfile: {
          studentUserId,
        },
      },
      select: {
        storagePath: true,
      },
    });

    const storagePaths = imagesToPurge.map((img) => img.storagePath);

    // Evict any in-memory decrypted references for this student
    const studentProfiles = await prisma.faceProfile.findMany({
      where: { studentUserId },
      select: { id: true },
    });
    for (const p of studentProfiles) {
      referenceService.invalidate(p.id);
    }

    const now = new Date();

    // Execute atomic hard-deletion of biometric DB rows and profile revocation
    const counts = await prisma.$transaction(async (tx) => {
      // 1. Delete all face embeddings
      const deletedEmbeddings = await tx.faceEmbedding.deleteMany({
        where: {
          faceProfile: {
            studentUserId,
          },
        },
      });

      // 2. Delete all face enrollment images
      const deletedImages = await tx.faceEnrollmentImage.deleteMany({
        where: {
          faceProfile: {
            studentUserId,
          },
        },
      });

      // 3. Mark all face profiles REVOKED
      const revokedProfiles = await tx.faceProfile.updateMany({
        where: {
          studentUserId,
        },
        data: {
          status: EnrollmentStatus.REVOKED,
          revokedAt: now,
        },
      });

      // 4. Update student profile enrollment cache to REVOKED
      await tx.studentProfile.update({
        where: { userId: studentUserId },
        data: {
          enrollmentStatusCache: EnrollmentStatus.REVOKED,
        },
      });

      // 5. Update request status to FULFILLED
      await tx.dataDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: DeletionRequestStatus.FULFILLED,
          handledBy: adminUserId,
          handledAt: now,
        },
      });

      // 6. Audit action with COUNTS ONLY (strictly zero biometric data)
      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          action: 'BIOMETRIC_DATA_DELETED',
          entityType: 'DataDeletionRequest',
          entityId: requestId,
          after: {
            studentUserId,
            deletedImagesCount: deletedImages.count,
            deletedEmbeddingsCount: deletedEmbeddings.count,
            profilesRevokedCount: revokedProfiles.count,
            filesScheduledForUnlink: storagePaths.length,
          },
          requestId: reqId || null,
          ipHash: null,
        },
      });

      return {
        deletedImagesCount: deletedImages.count,
        deletedEmbeddingsCount: deletedEmbeddings.count,
        profilesRevokedCount: revokedProfiles.count,
      };
    });

    // Post-commit: delete encrypted image files from disk
    for (const relPath of storagePaths) {
      try {
        await deleteStoredFile(relPath);
      } catch (err: unknown) {
        logger.warn(
          { relPath, err, studentUserId },
          'Failed to unlink stored image file during deletion fulfillment; scheduled for retention job retry',
        );
      }
    }

    return counts;
  }

  /**
   * Reject a data deletion request with an explanatory note.
   */
  async rejectRequest(
    requestId: string,
    note: string,
    adminUserId: string,
    reqIp?: string,
    reqId?: string,
  ): Promise<void> {
    const cleanNote = note.trim();
    if (!cleanNote || cleanNote.length < 3 || cleanNote.length > 500) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Rejection note must be between 3 and 500 characters',
      );
    }

    await prisma.$transaction(async (tx) => {
      const request = await tx.dataDeletionRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        throw new AppError('NOT_FOUND', 404, 'Data deletion request not found');
      }

      if (request.status !== DeletionRequestStatus.PENDING) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          `Cannot reject data deletion request in status ${request.status}: must be PENDING`,
        );
      }

      const now = new Date();

      await tx.dataDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: DeletionRequestStatus.REJECTED,
          handlerNote: cleanNote,
          handledBy: adminUserId,
          handledAt: now,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          action: 'BIOMETRIC_DELETION_REJECTED',
          entityType: 'DataDeletionRequest',
          entityId: requestId,
          after: {
            studentUserId: request.studentUserId,
            reason: cleanNote,
          },
          requestId: reqId || null,
          ipHash: null,
        },
      });
    });
  }
}

export const adminDeletionService = new AdminDeletionService();
