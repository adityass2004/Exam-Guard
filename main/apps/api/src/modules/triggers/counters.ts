import { SessionCounters, VerificationAttemptContext } from './triggers.types.js';

export function isServiceErrorCode(errorCode: string): boolean {
  return (
    errorCode.startsWith('SERVICE_') ||
    errorCode.startsWith('MODEL_') ||
    errorCode === 'INTERNAL_ERROR' ||
    errorCode === 'VISION_UNAVAILABLE' ||
    errorCode === 'GATEWAY_TIMEOUT'
  );
}

/**
 * Computes next session counters deterministically based on previous state and attempt outcome.
 * Pure function: does not mutate input state, does not access DB.
 */
export function computeNextCounters(
  prevState: SessionCounters,
  attempt: VerificationAttemptContext,
  now: Date
): SessionCounters {
  // PRE_EXAM phase attempts do not modify continuous counters
  if (attempt.phase === 'PRE_EXAM') {
    return { ...prevState };
  }

  const { outcome, errorCode } = attempt;

  let consecutiveMatch = prevState.consecutiveMatch;
  let consecutiveMismatch = prevState.consecutiveMismatch;
  let consecutiveNoFace = prevState.consecutiveNoFace;
  let consecutiveMultiFace = prevState.consecutiveMultiFace;
  let consecutiveServiceError = prevState.consecutiveServiceError;
  let consecutiveNonMatch = prevState.consecutiveNonMatch;
  let cameraErrorSince = prevState.cameraErrorSince;

  if (outcome === 'MATCH') {
    consecutiveMatch = prevState.consecutiveMatch + 1;
    consecutiveMismatch = 0;
    consecutiveNoFace = 0;
    consecutiveMultiFace = 0;
    consecutiveServiceError = 0;
    consecutiveNonMatch = 0;
    cameraErrorSince = null;
  } else {
    // Any non-match resets consecutiveMatch and increments consecutiveNonMatch
    consecutiveMatch = 0;
    consecutiveNonMatch = prevState.consecutiveNonMatch + 1;

    switch (outcome) {
      case 'MISMATCH':
        consecutiveMismatch = prevState.consecutiveMismatch + 1;
        consecutiveNoFace = 0;
        consecutiveMultiFace = 0;
        consecutiveServiceError = 0;
        cameraErrorSince = null;
        break;

      case 'NO_FACE':
        // consecutiveMismatch remains unchanged (=)
        consecutiveNoFace = prevState.consecutiveNoFace + 1;
        consecutiveMultiFace = 0;
        consecutiveServiceError = 0;
        cameraErrorSince = null;
        break;

      case 'MULTIPLE_FACES':
        // consecutiveMismatch remains unchanged (=)
        consecutiveNoFace = 0;
        consecutiveMultiFace = prevState.consecutiveMultiFace + 1;
        consecutiveServiceError = 0;
        cameraErrorSince = null;
        break;

      case 'VERIFICATION_ERROR':
        cameraErrorSince = null;
        if (errorCode === 'LOW_QUALITY_FRAME') {
          // consecutiveMismatch, consecutiveNoFace, consecutiveMultiFace remain unchanged (=)
          consecutiveServiceError = 0;
        } else if (isServiceErrorCode(errorCode)) {
          // consecutiveMismatch, consecutiveNoFace, consecutiveMultiFace remain unchanged (=)
          consecutiveServiceError = prevState.consecutiveServiceError + 1;
        } else if (errorCode === 'INVALID_IMAGE') {
          // consecutiveServiceError unchanged (=)
        } else {
          // Default for other unclassified verification errors: treat as service error
          consecutiveServiceError = prevState.consecutiveServiceError + 1;
        }
        break;

      case 'CAMERA_ERROR':
        // consecutiveMismatch, consecutiveNoFace, consecutiveMultiFace, consecutiveServiceError unchanged (=)
        if (!cameraErrorSince) {
          cameraErrorSince = now;
        }
        break;
    }
  }

  return {
    consecutiveMatch,
    consecutiveMismatch,
    consecutiveNoFace,
    consecutiveMultiFace,
    consecutiveServiceError,
    consecutiveNonMatch,
    cameraErrorSince,
  };
}
