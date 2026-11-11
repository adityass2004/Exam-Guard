import type { StudentDashboardDto } from '@examguard/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { enrollmentService } from '../enrollment/enrollment.service.js';

export class StudentDashboardService {
  async getDashboardData(userId: string): Promise<StudentDashboardDto> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });

    if (!user || user.role !== 'STUDENT') {
      throw new AppError('FORBIDDEN', 403, 'Student access only');
    }

    const enrollmentStatus = await enrollmentService.getEnrollmentStatus(userId);
    const profile = enrollmentStatus.profile;
    const isApproved = profile?.status === 'APPROVED';

    let statusMsg = 'Biometric enrollment not completed';
    if (!enrollmentStatus.hasConsent) {
      statusMsg = 'Biometric verification consent required';
    } else if (profile?.status === 'DRAFT') {
      statusMsg = `Enrollment in progress (${profile.progress}/5 angles captured)`;
    } else if (profile?.status === 'PENDING_APPROVAL') {
      statusMsg = 'Awaiting administrator verification review';
    } else if (profile?.status === 'APPROVED') {
      statusMsg = 'Identity verified and approved for examinations';
    } else if (profile?.status === 'REJECTED') {
      statusMsg = `Enrollment rejected: ${profile.rejectedReason || 'Please re-enroll'}`;
    }

    // 1. Available active exams
    const activeExams = await prisma.exam.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedExams = activeExams.map((exam) => {
      const canStart = isApproved;
      let eligibilityReason: string | undefined;
      if (!isApproved) {
        eligibilityReason = 'Enrollment must be approved first';
      }
      return {
        id: exam.id,
        title: exam.title,
        durationMinutes: exam.durationMinutes,
        totalQuestions: exam._count.questions,
        canStart,
        eligibilityReason,
      };
    });

    // 2. Previous student exam sessions
    const sessions = await prisma.examSession.findMany({
      where: { studentUserId: userId },
      include: { exam: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const formattedSessions = sessions.map((s) => ({
      id: s.id,
      examTitle: s.exam.title,
      startedAt: (s.startedAt || s.createdAt).toISOString(),
      submittedAt: s.submittedAt?.toISOString(),
      status: s.status,
      score: s.score,
      maxScore: s.maxScore,
    }));

    // 3. Verification summary from verification logs of this student's sessions
    const sessionIds = sessions.map((s) => s.id);
    let totalAttempts = 0;
    let successfulMatches = 0;
    let failedMatches = 0;
    let unverified = 0;

    if (sessionIds.length > 0) {
      const logs = await prisma.verificationLog.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { outcome: true },
      });

      totalAttempts = logs.length;
      for (const log of logs) {
        if (log.outcome === 'MATCH') {
          successfulMatches++;
        } else if (log.outcome === 'MISMATCH') {
          failedMatches++;
        } else {
          unverified++;
        }
      }
    }

    // 4. Previous security warnings (own triggers, friendly neutral phrasing)
    const triggers = await prisma.securityTrigger.findMany({
      where: { studentUserId: userId },
      include: {
        exam: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const triggerDescriptions: Record<string, string> = {
      IDENTITY_MISMATCH: 'Identity could not be confirmed',
      NO_FACE: 'Face not detected for a period',
      MULTIPLE_FACES: 'Multiple faces detected',
      CAMERA_DISCONNECTED: 'No verification signal received',
      VERIFICATION_SERVICE_FAILURE: 'Verification service experienced a temporary disruption',
      REPEATED_VERIFICATION_FAILURE: 'Multiple verification checks failed consecutively',
    };

    const formattedWarnings = triggers.map((t) => ({
      id: t.id,
      type: t.triggerType,
      detectedAt: t.firstDetectedAt.toISOString(),
      description: triggerDescriptions[t.triggerType] || 'Verification observation flagged for review',
      examTitle: t.exam?.title || 'Examination',
      note: 'An administrator may review this; it is not a final decision.',
    }));

    return {
      profile: {
        fullName: user.fullName,
        email: user.email,
        studentId: user.studentProfile?.studentId || 'N/A',
      },
      enrollment: {
        status: (profile?.status as any) || 'NOT_STARTED',
        version: profile?.version || 1,
        hasConsent: enrollmentStatus.hasConsent,
        progress: profile?.progress || 0,
        canStartExam: isApproved,
        statusMessage: statusMsg,
      },
      availableExams: formattedExams,
      previousSessions: formattedSessions,
      verificationSummary: {
        totalAttempts,
        successfulMatches,
        failedMatches,
        unverified,
      },
      previousWarnings: formattedWarnings,
    };
  }
}

export const studentDashboardService = new StudentDashboardService();
