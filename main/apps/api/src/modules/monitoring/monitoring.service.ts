import { prisma } from '../../lib/prisma.js';
import { Severity, SessionStatus } from '@examguard/shared';

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export interface MonitoringSessionDto {
  sessionId: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  examId: string;
  examTitle: string;
  status: SessionStatus;
  startedAt: string | null;
  expiresAt: string | null;
  lastSeenAt: string | null;
  signalHealth: 'OK' | 'STALE' | 'NO_SIGNAL';
  latestOutcome: string | null;
  latestSimilarityPct: number | null;
  totalAttempts: number;
  successfulMatches: number;
  failedMatches: number;
  unverified: number;
  activeIncidentsCount: number;
  highestActiveSeverity: Severity | null;
}

export interface MonitoringSnapshotResponse {
  inProgress: MonitoringSessionDto[];
  pendingVerification: MonitoringSessionDto[];
  counts: {
    totalActive: number;
    inProgress: number;
    pendingVerification: number;
    criticalIncidents: number;
  };
  serverNow: string;
}

export class MonitoringService {
  async getMonitoringSnapshot(): Promise<MonitoringSnapshotResponse> {
    const now = new Date();

    const sessions = await prisma.examSession.findMany({
      where: {
        status: { in: ['IN_PROGRESS', 'PENDING_VERIFICATION'] },
      },
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
        securityTriggers: {
          where: { activeDedupeKey: { not: null } },
          select: {
            id: true,
            severity: true,
            triggerType: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    const mappedSessions: MonitoringSessionDto[] = sessions.map((s) => {
      const snapshot = s.settingsSnapshot as Record<string, any>;
      const intervalMs = Number(snapshot?.intervalMs ?? 1500);
      const cameraGraceSeconds = Number(snapshot?.cameraGraceSeconds ?? 10);

      const unverified =
        s.noFaceCount +
        s.multiFaceCount +
        s.cameraErrorCount +
        s.verificationErrorCount;

      // Determine highest severity among active incidents
      let highestActiveSeverity: Severity | null = null;
      let highestSeverityScore = 0;

      for (const inc of s.securityTriggers) {
        const score = SEVERITY_ORDER[inc.severity as Severity] ?? 0;
        if (score > highestSeverityScore) {
          highestSeverityScore = score;
          highestActiveSeverity = inc.severity as Severity;
        }
      }

      // Compute signal health
      let signalHealth: 'OK' | 'STALE' | 'NO_SIGNAL' = 'OK';
      if (s.status === 'IN_PROGRESS') {
        const lastSeen = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
        const elapsedMs = Math.max(0, now.getTime() - lastSeen);

        const staleThresholdMs = intervalMs * 2;
        const noSignalThresholdMs = intervalMs * 3 + cameraGraceSeconds * 1000;

        if (elapsedMs >= noSignalThresholdMs) {
          signalHealth = 'NO_SIGNAL';
        } else if (elapsedMs >= staleThresholdMs) {
          signalHealth = 'STALE';
        } else {
          signalHealth = 'OK';
        }
      }

      return {
        sessionId: s.id,
        studentUserId: s.studentUserId,
        studentId: s.studentUser?.studentProfile?.studentId || 'N/A',
        studentName: s.studentUser?.fullName || 'Unknown Student',
        studentEmail: s.studentUser?.email || '',
        examId: s.examId,
        examTitle: s.exam?.title || 'Untitled Exam',
        status: s.status as SessionStatus,
        startedAt: s.startedAt?.toISOString() ?? null,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
        signalHealth,
        latestOutcome: s.lastOutcome,
        latestSimilarityPct: s.lastSimilarityPct,
        totalAttempts: s.totalAttempts,
        successfulMatches: s.matchCount,
        failedMatches: s.mismatchCount,
        unverified,
        activeIncidentsCount: s.securityTriggers.length,
        highestActiveSeverity,
      };
    });

    // Sort by severity (descending), then recency
    const comparator = (a: MonitoringSessionDto, b: MonitoringSessionDto) => {
      const aScore = a.highestActiveSeverity ? SEVERITY_ORDER[a.highestActiveSeverity] : 0;
      const bScore = b.highestActiveSeverity ? SEVERITY_ORDER[b.highestActiveSeverity] : 0;

      if (aScore !== bScore) {
        return bScore - aScore;
      }

      const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return bTime - aTime;
    };

    const inProgress = mappedSessions
      .filter((s) => s.status === 'IN_PROGRESS')
      .sort(comparator);

    const pendingVerification = mappedSessions
      .filter((s) => s.status === 'PENDING_VERIFICATION')
      .sort(comparator);

    let criticalIncidentsCount = 0;
    for (const s of mappedSessions) {
      if (s.highestActiveSeverity === 'CRITICAL') {
        criticalIncidentsCount++;
      }
    }

    return {
      inProgress,
      pendingVerification,
      counts: {
        totalActive: mappedSessions.length,
        inProgress: inProgress.length,
        pendingVerification: pendingVerification.length,
        criticalIncidents: criticalIncidentsCount,
      },
      serverNow: now.toISOString(),
    };
  }
}

export const monitoringService = new MonitoringService();
