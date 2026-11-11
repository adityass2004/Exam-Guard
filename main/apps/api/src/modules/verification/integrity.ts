import { prisma } from '../../lib/prisma.js';

export interface IntegrityCheckResult {
  isValid: boolean;
  issues: string[];
  details: {
    sessionId: string;
    totalLogs: number;
    sessionTotalAttempts: number;
    nextSequenceNo: number;
    expectedNextSequenceNo: number;
    matchCountMismatch: boolean;
    mismatchCountMismatch: boolean;
    noFaceCountMismatch: boolean;
    multiFaceCountMismatch: boolean;
    cameraErrorCountMismatch: boolean;
    verificationErrorCountMismatch: boolean;
  };
}

/**
 * Validates the verification log integrity for an exam session:
 * 1. Checks that sequence numbers are strictly contiguous with no gaps starting at 1.
 * 2. Compares session outcome counters to the actual row counts in verification_logs.
 * 3. Flags any sequence or counter anomalies.
 */
export async function checkSessionLogIntegrity(
  sessionId: string
): Promise<IntegrityCheckResult> {
  const session = await prisma.examSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  const logs = await prisma.verificationLog.findMany({
    where: { sessionId },
    orderBy: { sequenceNo: 'asc' },
    select: {
      id: true,
      sequenceNo: true,
      outcome: true,
    },
  });

  const issues: string[] = [];

  // 1. Check contiguous sequence numbers
  for (let i = 0; i < logs.length; i++) {
    const expectedSeq = i + 1;
    if (logs[i].sequenceNo !== expectedSeq) {
      issues.push(
        `Sequence gap detected at index ${i}: expected sequenceNo ${expectedSeq}, found ${logs[i].sequenceNo}`
      );
    }
  }

  // 2. Check total attempts vs log row count
  if (session.totalAttempts !== logs.length) {
    issues.push(
      `Total attempts mismatch: session recorded ${session.totalAttempts}, but found ${logs.length} log rows`
    );
  }

  if (session.nextSequenceNo !== logs.length + 1) {
    issues.push(
      `Next sequence number mismatch: session nextSequenceNo is ${session.nextSequenceNo}, expected ${logs.length + 1}`
    );
  }

  // 3. Check outcome tallies
  const actualMatches = logs.filter((l) => l.outcome === 'MATCH').length;
  const actualMismatches = logs.filter((l) => l.outcome === 'MISMATCH').length;
  const actualNoFace = logs.filter((l) => l.outcome === 'NO_FACE').length;
  const actualMultiFace = logs.filter((l) => l.outcome === 'MULTIPLE_FACES').length;
  const actualCameraError = logs.filter((l) => l.outcome === 'CAMERA_ERROR').length;
  const actualVerificationError = logs.filter((l) => l.outcome === 'VERIFICATION_ERROR').length;

  const matchMismatch = session.matchCount !== actualMatches;
  const mismatchMismatch = session.mismatchCount !== actualMismatches;
  const noFaceMismatch = session.noFaceCount !== actualNoFace;
  const multiFaceMismatch = session.multiFaceCount !== actualMultiFace;
  const cameraErrorMismatch = session.cameraErrorCount !== actualCameraError;
  const verErrorMismatch = session.verificationErrorCount !== actualVerificationError;

  if (matchMismatch) {
    issues.push(`Match count mismatch: session=${session.matchCount}, logs=${actualMatches}`);
  }
  if (mismatchMismatch) {
    issues.push(`Mismatch count mismatch: session=${session.mismatchCount}, logs=${actualMismatches}`);
  }
  if (noFaceMismatch) {
    issues.push(`NoFace count mismatch: session=${session.noFaceCount}, logs=${actualNoFace}`);
  }
  if (multiFaceMismatch) {
    issues.push(`MultiFace count mismatch: session=${session.multiFaceCount}, logs=${actualMultiFace}`);
  }
  if (cameraErrorMismatch) {
    issues.push(`CameraError count mismatch: session=${session.cameraErrorCount}, logs=${actualCameraError}`);
  }
  if (verErrorMismatch) {
    issues.push(`VerificationError count mismatch: session=${session.verificationErrorCount}, logs=${actualVerificationError}`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    details: {
      sessionId,
      totalLogs: logs.length,
      sessionTotalAttempts: session.totalAttempts,
      nextSequenceNo: session.nextSequenceNo,
      expectedNextSequenceNo: logs.length + 1,
      matchCountMismatch: matchMismatch,
      mismatchCountMismatch: mismatchMismatch,
      noFaceCountMismatch: noFaceMismatch,
      multiFaceCountMismatch: multiFaceMismatch,
      cameraErrorCountMismatch: cameraErrorMismatch,
      verificationErrorCountMismatch: verErrorMismatch,
    },
  };
}
