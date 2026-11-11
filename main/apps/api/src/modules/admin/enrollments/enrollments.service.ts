import { EnrollmentStatus, UserRole } from '@prisma/client';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { auditService } from '../../audit/audit.service.js';
import { referenceService } from '../../../lib/reference.service.js';
import type { FaceImageDto, PendingEnrollmentItemDto } from '@examguard/shared';

export class AdminEnrollmentsService {
  /**
   * List pending (or filtered) enrollment profiles for administrative review.
   */
  async listEnrollments(query: {
    status?: EnrollmentStatus;
    page?: number;
    limit?: number;
  }): Promise<{
    data: PendingEnrollmentItemDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const status = query.status || EnrollmentStatus.PENDING_APPROVAL;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where = {
      status,
      studentUser: {
        deletedAt: null,
      },
    };

    const [total, profiles] = await Promise.all([
      prisma.faceProfile.count({ where }),
      prisma.faceProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          studentUser: {
            include: {
              studentProfile: true,
            },
          },
          images: {
            orderBy: { angle: 'asc' },
            select: {
              id: true,
              angle: true,
              capturedAt: true,
              width: true,
              height: true,
              byteSize: true,
              mime: true,
              quality: true,
            },
          },
        },
      }),
    ]);

    const data: PendingEnrollmentItemDto[] = profiles.map((p) => {
      const images: FaceImageDto[] = p.images.map((img) => ({
        id: img.id,
        angle: img.angle,
        capturedAt: img.capturedAt.toISOString(),
        width: img.width,
        height: img.height,
        byteSize: img.byteSize,
        mime: img.mime,
        quality: img.quality,
        authorizedImageUrl: `/api/v1/admin/images/enrollment/${img.id}`,
      }));

      return {
        profileId: p.id,
        student: {
          id: p.studentUserId,
          fullName: p.studentUser.fullName,
          studentId: p.studentUser.studentProfile?.studentId || 'N/A',
          email: p.studentUser.email,
        },
        version: p.version,
        submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
        consistency: p.consistencyMinObserved,
        qualitySummary: p.qualitySummary,
        images,
      };
    });

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
   * Approve a candidate face profile from PENDING_APPROVAL.
   * Atomic transaction: marks previous approved profiles SUPERSEDED, marks this APPROVED,
   * updates enrollment_status_cache, audits action.
   */
  async approveEnrollment(
    profileId: string,
    adminUserId: string,
    requestId?: string,
    reqIp?: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.faceProfile.findUnique({
        where: { id: profileId },
      });

      if (!profile) {
        throw new AppError('NOT_FOUND', 404, 'Face profile not found');
      }

      if (profile.status !== EnrollmentStatus.PENDING_APPROVAL) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          `Cannot approve face profile in status ${profile.status}: must be PENDING_APPROVAL`,
        );
      }

      const now = new Date();

      const previousApproved = await tx.faceProfile.findMany({
        where: {
          studentUserId: profile.studentUserId,
          status: EnrollmentStatus.APPROVED,
        },
        select: { id: true },
      });

      // Mark any existing APPROVED profile for this student as SUPERSEDED
      await tx.faceProfile.updateMany({
        where: {
          studentUserId: profile.studentUserId,
          status: EnrollmentStatus.APPROVED,
        },
        data: {
          status: EnrollmentStatus.SUPERSEDED,
        },
      });

      for (const p of previousApproved) {
        referenceService.invalidate(p.id);
      }

      // Mark this profile APPROVED
      await tx.faceProfile.update({
        where: { id: profileId },
        data: {
          status: EnrollmentStatus.APPROVED,
          approvedAt: now,
          approvedBy: adminUserId,
          rejectedReason: null,
        },
      });

      // Update student profile cache
      await tx.studentProfile.update({
        where: { userId: profile.studentUserId },
        data: {
          enrollmentStatusCache: EnrollmentStatus.APPROVED,
        },
      });

      // Audit approval
      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          action: 'ENROLLMENT_APPROVED',
          entityType: 'FaceProfile',
          entityId: profileId,
          before: { status: profile.status },
          after: {
            status: EnrollmentStatus.APPROVED,
            studentUserId: profile.studentUserId,
            version: profile.version,
          },
          requestId: requestId || null,
          ipHash: null,
        },
      });
    });
  }

  /**
   * Reject a face profile with a required reason.
   */
  async rejectEnrollment(
    profileId: string,
    reason: string,
    adminUserId: string,
    requestId?: string,
    reqIp?: string,
  ): Promise<void> {
    if (!reason || reason.trim().length < 3 || reason.trim().length > 500) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Rejection reason must be between 3 and 500 characters',
      );
    }

    await prisma.$transaction(async (tx) => {
      const profile = await tx.faceProfile.findUnique({
        where: { id: profileId },
      });

      if (!profile) {
        throw new AppError('NOT_FOUND', 404, 'Face profile not found');
      }

      if (
        profile.status === EnrollmentStatus.REJECTED ||
        profile.status === EnrollmentStatus.REVOKED ||
        profile.status === EnrollmentStatus.SUPERSEDED
      ) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          `Cannot reject face profile in status ${profile.status}`,
        );
      }

      const cleanReason = reason.trim();

      await tx.faceProfile.update({
        where: { id: profileId },
        data: {
          status: EnrollmentStatus.REJECTED,
          rejectedReason: cleanReason,
        },
      });

      referenceService.invalidate(profileId);

      await tx.studentProfile.update({
        where: { userId: profile.studentUserId },
        data: {
          enrollmentStatusCache: EnrollmentStatus.REJECTED,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          action: 'ENROLLMENT_REJECTED',
          entityType: 'FaceProfile',
          entityId: profileId,
          before: { status: profile.status },
          after: {
            status: EnrollmentStatus.REJECTED,
            reason: cleanReason,
            studentUserId: profile.studentUserId,
            version: profile.version,
          },
          requestId: requestId || null,
          ipHash: null,
        },
      });
    });
  }

  /**
   * Revoke an approved enrollment profile.
   */
  async revokeEnrollment(
    profileId: string,
    adminUserId: string,
    requestId?: string,
    reqIp?: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.faceProfile.findUnique({
        where: { id: profileId },
      });

      if (!profile) {
        throw new AppError('NOT_FOUND', 404, 'Face profile not found');
      }

      if (profile.status !== EnrollmentStatus.APPROVED) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          `Cannot revoke face profile in status ${profile.status}: must be APPROVED`,
        );
      }

      const now = new Date();

      await tx.faceProfile.update({
        where: { id: profileId },
        data: {
          status: EnrollmentStatus.REVOKED,
          revokedAt: now,
        },
      });

      referenceService.invalidate(profileId);

      await tx.studentProfile.update({
        where: { userId: profile.studentUserId },
        data: {
          enrollmentStatusCache: EnrollmentStatus.REVOKED,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          action: 'ENROLLMENT_REVOKED',
          entityType: 'FaceProfile',
          entityId: profileId,
          before: { status: profile.status },
          after: {
            status: EnrollmentStatus.REVOKED,
            revokedAt: now.toISOString(),
            studentUserId: profile.studentUserId,
            version: profile.version,
          },
          requestId: requestId || null,
          ipHash: null,
        },
      });
    });
  }
}

export const adminEnrollmentsService = new AdminEnrollmentsService();
