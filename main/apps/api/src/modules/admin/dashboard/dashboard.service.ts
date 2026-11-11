import { UserRole, VerificationOutcome } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import type { AdminDashboardData } from '@examguard/shared';

export class AdminDashboardService {
  async getDashboardData(): Promise<AdminDashboardData> {
    const [
      totalStudents,
      enrolledCandidates,
      pendingEnrollmentApprovals,
      activeExams,
      activeSessions,
      verificationGroups,
      activeSecurityIncidents,
      pendingProfiles,
      recentAuditLogs,
    ] = await Promise.all([
      // 1. Total students (non-deleted)
      prisma.user.count({
        where: {
          role: UserRole.STUDENT,
          deletedAt: null,
        },
      }),

      // 2. Enrolled candidates (approved active profile)
      prisma.studentProfile.count({
        where: {
          enrollmentStatusCache: 'APPROVED',
          user: {
            deletedAt: null,
          },
        },
      }),

      // 3. Pending enrollment approvals
      prisma.faceProfile.count({
        where: {
          status: 'PENDING_APPROVAL',
        },
      }),

      // 4. Active exams
      prisma.exam.count({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),

      // 5. Active sessions
      prisma.examSession.count({
        where: {
          status: 'IN_PROGRESS',
        },
      }),

      // 6. Verification attempts grouped by outcome
      prisma.verificationLog.groupBy({
        by: ['outcome'],
        _count: {
          id: true,
        },
      }),

      // 7. Active security incidents (OPEN or ACKNOWLEDGED)
      prisma.securityTrigger.count({
        where: {
          status: {
            in: ['OPEN', 'ACKNOWLEDGED'],
          },
        },
      }),

      // 8. Latest 5 pending enrollment approvals
      prisma.faceProfile.findMany({
        where: {
          status: 'PENDING_APPROVAL',
        },
        take: 5,
        orderBy: {
          submittedAt: 'desc',
        },
        include: {
          studentUser: {
            include: {
              studentProfile: true,
            },
          },
          images: {
            select: {
              id: true,
            },
          },
        },
      }),

      // 9. Latest 5 admin audit rows
      prisma.adminAuditLog.findMany({
        take: 5,
        orderBy: {
          id: 'desc',
        },
        include: {
          actor: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    // Aggregate verification outcomes
    let totalAttempts = 0;
    let successful = 0;
    let failed = 0;
    let unverified = 0;

    for (const group of verificationGroups) {
      const count = group._count.id;
      totalAttempts += count;
      if (group.outcome === VerificationOutcome.MATCH) {
        successful += count;
      } else if (group.outcome === VerificationOutcome.MISMATCH) {
        failed += count;
      } else {
        unverified += count;
      }
    }

    return {
      metrics: {
        totalStudents,
        enrolledCandidates,
        pendingEnrollmentApprovals,
        activeExams,
        activeSessions,
        totalVerificationAttempts: totalAttempts,
        successfulVerifications: successful,
        failedVerifications: failed,
        unverifiedVerifications: unverified,
        activeSecurityIncidents,
      },
      pendingApprovals: pendingProfiles.map((p) => ({
        profileId: p.id,
        studentUserId: p.studentUserId,
        studentId: p.studentUser.studentProfile?.studentId || 'N/A',
        fullName: p.studentUser.fullName,
        email: p.studentUser.email,
        version: p.version,
        submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        sampleCount: p.images.length,
      })),
      recentActions: recentAuditLogs.map((log) => ({
        id: log.id.toString(),
        action: log.action,
        actorEmail: log.actor?.email ?? null,
        actorName: log.actor?.fullName ?? null,
        entityType: log.entityType,
        entityId: log.entityId,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
