import { prisma } from '../../lib/prisma.js';
import { ReportQuery } from './reports.schemas.js';
import { formatCsvRow } from '../../lib/csv-stream.js';
import { Prisma } from '@prisma/client';

interface CachedOverview {
  timestamp: number;
  data: any;
}

const overviewCache = new Map<string, CachedOverview>();
const CACHE_TTL_MS = 30000; // 30s

export class ReportsService {
  private getCacheKey(query: ReportQuery): string {
    return `${query.from || ''}_${query.to || ''}_${query.examId || ''}_${query.studentId || ''}`;
  }

  async getOverviewReport(query: ReportQuery) {
    const cacheKey = this.getCacheKey(query);
    const cached = overviewCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const where: Prisma.VerificationLogWhereInput = {
      phase: 'CONTINUOUS',
    };
    if (query.examId) where.examId = query.examId;
    if (query.studentId) where.studentUserId = query.studentId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    // 1. Outcome groupings
    const outcomeCounts = await prisma.verificationLog.groupBy({
      by: ['outcome'],
      where,
      _count: { _all: true },
    });

    const counts: Record<string, number> = {
      MATCH: 0,
      MISMATCH: 0,
      NO_FACE: 0,
      MULTIPLE_FACES: 0,
      LOW_QUALITY_FRAME: 0,
      CAMERA_ERROR: 0,
      SERVICE_UNAVAILABLE: 0,
    };

    let totalContinuous = 0;
    for (const item of outcomeCounts) {
      counts[item.outcome] = item._count._all;
      totalContinuous += item._count._all;
    }

    const matches = counts.MATCH || 0;
    const mismatches = counts.MISMATCH || 0;
    const unverified = totalContinuous - matches - mismatches;

    const matchPct = totalContinuous > 0 ? Number(((matches / totalContinuous) * 100).toFixed(1)) : 0;
    const mismatchPct = totalContinuous > 0 ? Number(((mismatches / totalContinuous) * 100).toFixed(1)) : 0;
    const unverifiedPct = totalContinuous > 0 ? Number(((unverified / totalContinuous) * 100).toFixed(1)) : 0;

    // 2. Incident breakdown
    const incidentWhere: Prisma.SecurityTriggerWhereInput = {};
    if (query.examId) incidentWhere.examId = query.examId;
    if (query.studentId) incidentWhere.studentUserId = query.studentId;
    if (query.from || query.to) {
      incidentWhere.createdAt = {};
      if (query.from) incidentWhere.createdAt.gte = new Date(query.from);
      if (query.to) incidentWhere.createdAt.lte = new Date(query.to);
    }

    const [incidentsByType, incidentsBySeverity] = await Promise.all([
      prisma.securityTrigger.groupBy({
        by: ['triggerType'],
        where: incidentWhere,
        _count: { _all: true },
      }),
      prisma.securityTrigger.groupBy({
        by: ['severity'],
        where: incidentWhere,
        _count: { _all: true },
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const t of incidentsByType) {
      byType[t.triggerType] = t._count._all;
    }

    const bySeverity: Record<string, number> = {};
    for (const s of incidentsBySeverity) {
      bySeverity[s.severity] = s._count._all;
    }

    // 3. Sessions by status
    const sessionWhere: Prisma.ExamSessionWhereInput = {};
    if (query.examId) sessionWhere.examId = query.examId;
    if (query.studentId) sessionWhere.studentUserId = query.studentId;
    if (query.from || query.to) {
      sessionWhere.createdAt = {};
      if (query.from) sessionWhere.createdAt.gte = new Date(query.from);
      if (query.to) sessionWhere.createdAt.lte = new Date(query.to);
    }

    const sessionsByStatus = await prisma.examSession.groupBy({
      by: ['status'],
      where: sessionWhere,
      _count: { _all: true },
    });

    const sessionCounts: Record<string, number> = {};
    for (const s of sessionsByStatus) {
      sessionCounts[s.status] = s._count._all;
    }

    // 4. Daily trend series (past 14 days or filtered period)
    const trendLogs = await prisma.verificationLog.findMany({
      where,
      select: {
        createdAt: true,
        outcome: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dayMap = new Map<string, { date: string; matches: number; mismatches: number; unverified: number }>();
    for (const log of trendLogs) {
      const dateStr = log.createdAt.toISOString().slice(0, 10);
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, { date: dateStr, matches: 0, mismatches: 0, unverified: 0 });
      }
      const day = dayMap.get(dateStr)!;
      if (log.outcome === 'MATCH') day.matches++;
      else if (log.outcome === 'MISMATCH') day.mismatches++;
      else day.unverified++;
    }
    const trendSeries = Array.from(dayMap.values());

    const result = {
      totalAttempts: totalContinuous,
      matches,
      mismatches,
      unverified,
      matchPct,
      mismatchPct,
      unverifiedPct,
      outcomeCounts: counts,
      incidentsByType: byType,
      incidentsBySeverity: bySeverity,
      sessionsByStatus: sessionCounts,
      trendSeries,
    };

    overviewCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  async getSessionsReport(query: ReportQuery) {
    const where: Prisma.ExamSessionWhereInput = {};
    if (query.examId) where.examId = query.examId;
    if (query.studentId) where.studentUserId = query.studentId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const sessions = await prisma.examSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        studentUser: { select: { fullName: true, email: true } },
        exam: { select: { title: true } },
        securityTriggers: {
          select: {
            id: true,
            triggerType: true,
            status: true,
            disposition: true,
          },
        },
      },
    });

    return sessions.map((s) => {
      const durationMin =
        s.startedAt && s.submittedAt
          ? Math.max(1, Math.round((s.submittedAt.getTime() - s.startedAt.getTime()) / 60000))
          : s.startedAt
          ? Math.max(1, Math.round((Date.now() - s.startedAt.getTime()) / 60000))
          : 0;

      const unverifiedCount = s.noFaceCount + s.multiFaceCount + s.cameraErrorCount + s.verificationErrorCount;
      const totalContinuous = s.matchCount + s.mismatchCount + unverifiedCount;
      const matchPct = totalContinuous > 0 ? Number(((s.matchCount / totalContinuous) * 100).toFixed(1)) : 0;

      const incidentTypes = Array.from(new Set(s.securityTriggers.map((t) => t.triggerType))).join(', ');
      const dispositions =
        Array.from(new Set(s.securityTriggers.map((t) => t.disposition).filter(Boolean))).join(', ') || 'NONE';

      return {
        sessionId: s.id,
        studentName: s.studentUser?.fullName ?? '',
        studentEmail: s.studentUser?.email ?? '',
        examTitle: s.exam?.title ?? '',
        status: s.status,
        startedAt: s.startedAt?.toISOString() ?? null,
        endedAt: s.submittedAt?.toISOString() ?? null,
        durationMinutes: durationMin,
        totalAttempts: s.totalAttempts,
        matches: s.matchCount,
        mismatches: s.mismatchCount,
        unverified: unverifiedCount,
        matchPct,
        incidentCount: s.securityTriggers.length,
        incidentTypes,
        finalDisposition: dispositions,
      };
    });
  }

  async getStudentsReport(query: ReportQuery) {
    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
    };
    if (query.studentId) where.id = query.studentId;

    const students = await prisma.user.findMany({
      where,
      take: 500,
      select: {
        id: true,
        fullName: true,
        email: true,
        studentProfile: { select: { studentId: true } },
        examSessions: {
          select: {
            id: true,
            totalAttempts: true,
            matchCount: true,
            mismatchCount: true,
            noFaceCount: true,
            multiFaceCount: true,
            cameraErrorCount: true,
            verificationErrorCount: true,
            securityTriggers: { select: { id: true } },
            createdAt: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return students.map((stu) => {
      const sessions = stu.examSessions;
      const totalSessions = sessions.length;
      let totalAttempts = 0;
      let totalMatches = 0;
      let totalMismatches = 0;
      let totalIncidents = 0;
      let lastSessionDate: Date | null = null;

      for (const s of sessions) {
        totalAttempts += s.totalAttempts;
        totalMatches += s.matchCount;
        totalMismatches += s.mismatchCount;
        totalIncidents += s.securityTriggers.length;
        if (!lastSessionDate || s.createdAt > lastSessionDate) {
          lastSessionDate = s.createdAt;
        }
      }

      const totalContinuous = totalMatches + totalMismatches;
      const matchPct = totalContinuous > 0 ? Number(((totalMatches / totalContinuous) * 100).toFixed(1)) : 0;
      const mismatchPct = totalContinuous > 0 ? Number(((totalMismatches / totalContinuous) * 100).toFixed(1)) : 0;

      return {
        studentUserId: stu.id,
        studentId: stu.studentProfile?.studentId ?? '',
        fullName: stu.fullName,
        email: stu.email,
        totalSessions,
        totalAttempts,
        matchPct,
        mismatchPct,
        incidentCount: totalIncidents,
        lastSessionAt: lastSessionDate ? lastSessionDate.toISOString() : null,
      };
    });
  }

  async getExamsReport(query: ReportQuery) {
    const where: Prisma.ExamWhereInput = {};
    if (query.examId) where.id = query.examId;

    const exams = await prisma.exam.findMany({
      where,
      take: 200,
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        status: true,
        sessions: {
          select: {
            id: true,
            studentUserId: true,
            status: true,
            startedAt: true,
            submittedAt: true,
            matchCount: true,
            mismatchCount: true,
            securityTriggers: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return exams.map((ex) => {
      const sessions = ex.sessions;
      const sessionCount = sessions.length;
      const participants = new Set(sessions.map((s) => s.studentUserId)).size;
      const completedSessions = sessions.filter((s) => s.status === 'SUBMITTED').length;
      const completionRate = sessionCount > 0 ? Number(((completedSessions / sessionCount) * 100).toFixed(1)) : 0;

      let totalMatches = 0;
      let totalMismatches = 0;
      let totalIncidents = 0;
      let totalDurationMin = 0;
      let timedSessions = 0;

      for (const s of sessions) {
        totalMatches += s.matchCount;
        totalMismatches += s.mismatchCount;
        totalIncidents += s.securityTriggers.length;
        if (s.startedAt && s.submittedAt) {
          totalDurationMin += (s.submittedAt.getTime() - s.startedAt.getTime()) / 60000;
          timedSessions++;
        }
      }

      const totalContinuous = totalMatches + totalMismatches;
      const avgMatchPct = totalContinuous > 0 ? Number(((totalMatches / totalContinuous) * 100).toFixed(1)) : 0;
      const avgDuration = timedSessions > 0 ? Math.round(totalDurationMin / timedSessions) : ex.durationMinutes;

      return {
        examId: ex.id,
        title: ex.title,
        status: ex.status,
        sessionCount,
        participants,
        avgMatchPct,
        totalIncidents,
        avgDurationMinutes: avgDuration,
        completionRatePct: completionRate,
      };
    });
  }

  async getIncidentsReport(query: ReportQuery) {
    const where: Prisma.SecurityTriggerWhereInput = {};
    if (query.examId) where.examId = query.examId;
    if (query.studentId) where.studentUserId = query.studentId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [byType, bySeverity, byStatus, byDisposition, reviewedIncidents] = await Promise.all([
      prisma.securityTrigger.groupBy({ by: ['triggerType'], where, _count: { _all: true } }),
      prisma.securityTrigger.groupBy({ by: ['severity'], where, _count: { _all: true } }),
      prisma.securityTrigger.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.securityTrigger.groupBy({ by: ['disposition'], where, _count: { _all: true } }),
      prisma.securityTrigger.findMany({
        where: {
          ...where,
          reviewedAt: { not: null },
        },
        select: {
          createdAt: true,
          acknowledgedAt: true,
          reviewedAt: true,
          disposition: true,
        },
      }),
    ]);

    const countsByType: Record<string, number> = {};
    for (const t of byType) countsByType[t.triggerType] = t._count?._all ?? 0;

    const countsBySeverity: Record<string, number> = {};
    for (const s of bySeverity) countsBySeverity[s.severity] = s._count?._all ?? 0;

    const countsByStatus: Record<string, number> = {};
    for (const st of byStatus) countsByStatus[st.status] = st._count?._all ?? 0;

    const countsByDisposition: Record<string, number> = {};
    for (const d of byDisposition) {
      countsByDisposition[d.disposition || 'UNREVIEWED'] = d._count?._all ?? 0;
    }

    // Mean times to acknowledge & review
    let ackTimeTotalMs = 0;
    let ackCount = 0;
    let reviewTimeTotalMs = 0;
    let reviewCount = 0;
    let falsePositiveCount = 0;

    for (const inc of reviewedIncidents) {
      if (inc.acknowledgedAt) {
        ackTimeTotalMs += inc.acknowledgedAt.getTime() - inc.createdAt.getTime();
        ackCount++;
      }
      if (inc.reviewedAt) {
        reviewTimeTotalMs += inc.reviewedAt.getTime() - inc.createdAt.getTime();
        reviewCount++;
      }
      if (inc.disposition === 'FALSE_POSITIVE') {
        falsePositiveCount++;
      }
    }

    const meanTimeToAckMinutes = ackCount > 0 ? Math.round(ackTimeTotalMs / ackCount / 60000) : 0;
    const meanTimeToReviewMinutes = reviewCount > 0 ? Math.round(reviewTimeTotalMs / reviewCount / 60000) : 0;
    const reviewerAssignedFalsePositiveRatePct =
      reviewCount > 0 ? Number(((falsePositiveCount / reviewCount) * 100).toFixed(1)) : 0;

    return {
      totalIncidents: reviewedIncidents.length,
      countsByType,
      countsBySeverity,
      countsByStatus,
      countsByDisposition,
      meanTimeToAckMinutes,
      meanTimeToReviewMinutes,
      reviewerAssignedFalsePositiveRatePct,
      disclaimer: 'False-positive rate is based strictly on reviewer disposition assignments (FALSE_ALARM), not ground truth.',
    };
  }

  toCsv(section: string, data: any[] | Record<string, any>): string {
    if (section === 'overview') {
      const ov = data as any;
      const lines = [
        formatCsvRow(['Metric', 'Value']),
        formatCsvRow(['Total Attempts', ov.totalAttempts]),
        formatCsvRow(['Matches', ov.matches]),
        formatCsvRow(['Mismatches', ov.mismatches]),
        formatCsvRow(['Unverified', ov.unverified]),
        formatCsvRow(['Match %', ov.matchPct]),
        formatCsvRow(['Mismatch %', ov.mismatchPct]),
        formatCsvRow(['Unverified %', ov.unverifiedPct]),
      ];
      return lines.join('');
    }

    if (section === 'sessions') {
      const rows = data as any[];
      const lines = [
        formatCsvRow([
          'Session ID',
          'Student Name',
          'Student Email',
          'Exam Title',
          'Status',
          'Started At',
          'Ended At',
          'Duration (min)',
          'Total Attempts',
          'Matches',
          'Mismatches',
          'Unverified',
          'Match %',
          'Incidents',
          'Incident Types',
          'Disposition',
        ]),
      ];
      for (const r of rows) {
        lines.push(
          formatCsvRow([
            r.sessionId,
            r.studentName,
            r.studentEmail,
            r.examTitle,
            r.status,
            r.startedAt ?? '',
            r.endedAt ?? '',
            r.durationMinutes,
            r.totalAttempts,
            r.matches,
            r.mismatches,
            r.unverified,
            r.matchPct,
            r.incidentCount,
            r.incidentTypes,
            r.finalDisposition,
          ])
        );
      }
      return lines.join('');
    }

    if (section === 'students') {
      const rows = data as any[];
      const lines = [
        formatCsvRow([
          'Student ID',
          'Full Name',
          'Email',
          'Sessions',
          'Total Attempts',
          'Match %',
          'Mismatch %',
          'Incidents',
          'Last Session At',
        ]),
      ];
      for (const r of rows) {
        lines.push(
          formatCsvRow([
            r.studentId,
            r.fullName,
            r.email,
            r.totalSessions,
            r.totalAttempts,
            r.matchPct,
            r.mismatchPct,
            r.incidentCount,
            r.lastSessionAt ?? '',
          ])
        );
      }
      return lines.join('');
    }

    if (section === 'exams') {
      const rows = data as any[];
      const lines = [
        formatCsvRow([
          'Exam ID',
          'Title',
          'Status',
          'Sessions',
          'Participants',
          'Avg Match %',
          'Total Incidents',
          'Avg Duration (min)',
          'Completion Rate %',
        ]),
      ];
      for (const r of rows) {
        lines.push(
          formatCsvRow([
            r.examId,
            r.title,
            r.status,
            r.sessionCount,
            r.participants,
            r.avgMatchPct,
            r.totalIncidents,
            r.avgDurationMinutes,
            r.completionRatePct,
          ])
        );
      }
      return lines.join('');
    }

    if (section === 'incidents') {
      const inc = data as any;
      const lines = [
        formatCsvRow(['Metric', 'Value']),
        formatCsvRow(['Mean Time to Ack (min)', inc.meanTimeToAckMinutes]),
        formatCsvRow(['Mean Time to Review (min)', inc.meanTimeToReviewMinutes]),
        formatCsvRow(['Reviewer False Positive Rate %', inc.reviewerAssignedFalsePositiveRatePct]),
        formatCsvRow(['Disclaimer', inc.disclaimer]),
      ];
      return lines.join('');
    }

    return '';
  }
}

export const reportsService = new ReportsService();

