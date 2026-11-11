import crypto from 'node:crypto';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { AppError } from '../../../lib/errors.js';
import { hashPassword } from '../../../lib/password.js';
import { prisma } from '../../../lib/prisma.js';
import { auditService } from '../../audit/audit.service.js';
import { sessionService } from '../../auth/session.service.js';
import type {
  ResetPasswordResponse,
  StudentDetailDto,
  StudentListItemDto,
} from '@examguard/shared';

export interface StudentListQuery {
  search?: string;
  enrollmentStatus?: string;
  status?: UserStatus;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'created' | 'lastLogin';
  sortOrder?: 'asc' | 'desc';
}

export class AdminStudentsService {
  async listStudents(query: StudentListQuery): Promise<{
    data: StudentListItemDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: UserRole.STUDENT,
      deletedAt: null, // do not list soft-deleted students
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        const fromDate = new Date(query.createdFrom);
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (query.createdTo) {
        const toDate = new Date(query.createdTo);
        if (!isNaN(toDate.getTime())) {
          where.createdAt.lte = toDate;
        }
      }
    }

    if (query.enrollmentStatus) {
      if (query.enrollmentStatus === 'NOT_STARTED') {
        where.studentProfile = {
          is: {
            enrollmentStatusCache: null,
          },
        };
      } else {
        where.studentProfile = {
          is: {
            enrollmentStatusCache: query.enrollmentStatus as any,
          },
        };
      }
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term } },
        { email: { contains: term } },
        {
          studentProfile: {
            is: {
              studentId: { contains: term },
            },
          },
        },
      ];
    }

    // Determine sorting
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    if (query.sortBy === 'name') {
      orderBy = { fullName: sortOrder };
    } else if (query.sortBy === 'lastLogin') {
      orderBy = { lastLoginAt: sortOrder };
    } else {
      orderBy = { createdAt: sortOrder };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          studentProfile: true,
        },
      }),
    ]);

    const data: StudentListItemDto[] = users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      studentId: u.studentProfile?.studentId || 'N/A',
      status: u.status,
      enrollmentStatus: u.studentProfile?.enrollmentStatusCache || 'NOT_STARTED',
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
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

  async getStudent(id: string): Promise<StudentDetailDto> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: true,
        faceProfiles: {
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!user || user.role !== UserRole.STUDENT || user.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Student account not found');
    }

    const latestProfile = user.faceProfiles[0] || null;

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      studentId: user.studentProfile?.studentId || 'N/A',
      status: user.status,
      enrollmentStatus: user.studentProfile?.enrollmentStatusCache || 'NOT_STARTED',
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      enrollmentSummary: {
        currentVersion: latestProfile ? latestProfile.version : null,
        totalVersions: user.faceProfiles.length,
        status: user.studentProfile?.enrollmentStatusCache || 'NOT_STARTED',
        consistency: latestProfile?.consistencyMinObserved ?? null,
        submittedAt: latestProfile?.submittedAt ? latestProfile.submittedAt.toISOString() : null,
        approvedAt: latestProfile?.approvedAt ? latestProfile.approvedAt.toISOString() : null,
        rejectedReason: latestProfile?.rejectedReason || null,
      },
      sessions: [], // Phase 5 exams
      recentWarnings: [], // Phase 7 triggers
    };
  }

  async updateStudentStatus(
    id: string,
    newStatus: UserStatus,
    actorUserId: string,
    requestId?: string,
    reqIp?: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.role !== UserRole.STUDENT || user.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Student account not found');
    }

    if (user.status === newStatus) {
      return; // No change needed
    }

    const previousStatus = user.status;

    await prisma.user.update({
      where: { id },
      data: { status: newStatus },
    });

    // If suspended, revoke all active sessions immediately
    if (newStatus === UserStatus.SUSPENDED) {
      await sessionService.revokeAllUserSessions(id);
    }

    await auditService.record({
      actorUserId,
      actorRole: UserRole.ADMIN,
      action: newStatus === UserStatus.SUSPENDED ? 'STUDENT_SUSPENDED' : 'STUDENT_REACTIVATED',
      entityType: 'User',
      entityId: id,
      before: { status: previousStatus },
      after: { status: newStatus },
      requestId,
      ip: reqIp,
    });
  }

  async resetPassword(
    id: string,
    actorUserId: string,
    requestId?: string,
    reqIp?: string,
  ): Promise<ResetPasswordResponse> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.role !== UserRole.STUDENT || user.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Student account not found');
    }

    // Generate strong temporary password: 16 chars base64url + prefix
    const randomEntropy = crypto.randomBytes(12).toString('base64url');
    const temporaryPassword = `Tmp!${randomEntropy}`;
    const passwordHash = await hashPassword(temporaryPassword);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    // Revoke all existing sessions
    await sessionService.revokeAllUserSessions(id);

    // Audit action - NEVER audit or log the temporary password
    await auditService.record({
      actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'STUDENT_PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      after: {
        mustChangePassword: true,
        sessionsRevoked: true,
      },
      requestId,
      ip: reqIp,
    });

    return {
      temporaryPassword,
      message: 'Temporary password generated successfully. This will only be displayed once.',
    };
  }

  async softDeleteStudent(
    id: string,
    actorUserId: string,
    requestId?: string,
    reqIp?: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.role !== UserRole.STUDENT || user.deletedAt !== null) {
      throw new AppError('NOT_FOUND', 404, 'Student account not found');
    }

    await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: UserStatus.SUSPENDED,
      },
    });

    // Revoke all sessions
    await sessionService.revokeAllUserSessions(id);

    await auditService.record({
      actorUserId,
      actorRole: UserRole.ADMIN,
      action: 'STUDENT_SOFT_DELETED',
      entityType: 'User',
      entityId: id,
      after: {
        deletedAt: new Date().toISOString(),
        note: 'Biometric records preserved until data deletion fulfillment',
      },
      requestId,
      ip: reqIp,
    });
  }
}

export const adminStudentsService = new AdminStudentsService();
