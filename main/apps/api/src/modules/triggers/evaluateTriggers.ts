import { Severity, TriggerType } from '@examguard/shared';
import {
  EvaluateTriggersInput,
  EvaluateTriggersOutput,
  TriggerActionDecision,
} from './triggers.types.js';
import { computeNextCounters } from './counters.js';

export const DEFAULT_SEVERITIES: Record<TriggerType, Severity> = {
  IDENTITY_MISMATCH: 'CRITICAL',
  MULTIPLE_FACES: 'HIGH',
  CAMERA_DISCONNECTED: 'HIGH',
  NO_FACE: 'MEDIUM',
  REPEATED_VERIFICATION_FAILURE: 'MEDIUM',
  VERIFICATION_SERVICE_FAILURE: 'LOW',
};

/**
 * Pure and deterministic security trigger evaluation.
 * No database access, no system clock access.
 */
export function evaluateTriggers(input: EvaluateTriggersInput): EvaluateTriggersOutput {
  const { prevState, attempt, snapshot, now, startedAt } = input;

  // PRE_EXAM phase attempts do not touch continuous counters and never open incidents
  if (attempt.phase === 'PRE_EXAM') {
    return {
      nextCounters: { ...prevState },
      actions: [],
      shouldRecover: false,
    };
  }

  const nextCounters = computeNextCounters(prevState, attempt, now);
  const activeSet = new Set<TriggerType>(
    Array.isArray(input.activeIncidents)
      ? input.activeIncidents
      : input.activeIncidents
      ? Array.from(input.activeIncidents)
      : []
  );

  const recoveryMatchCount = Number(snapshot?.recoveryMatchCount ?? 3);
  const shouldRecover = nextCounters.consecutiveMatch >= recoveryMatchCount;

  // If recovery is met, generate RECOVER action for any ongoing active incidents
  const actions: TriggerActionDecision[] = [];

  if (shouldRecover && activeSet.size > 0) {
    for (const activeType of activeSet) {
      actions.push({
        type: activeType,
        action: 'RECOVER',
        reason: `Recovered after ${nextCounters.consecutiveMatch} consecutive match outcomes`,
        severity: snapshot?.severityRules?.[activeType] ?? DEFAULT_SEVERITIES[activeType],
        similarityPct: attempt.similarityPct,
      });
    }
  }

  // Startup grace period check: triggers only fire when now >= startedAt + startup_grace_seconds
  const startupGraceSeconds = Number(snapshot?.startupGraceSeconds ?? 0);
  if (startedAt && startupGraceSeconds > 0) {
    const elapsedSeconds = (now.getTime() - new Date(startedAt).getTime()) / 1000;
    if (elapsedSeconds < startupGraceSeconds) {
      // Counters still accumulate during grace, but no trigger actions fire
      return {
        nextCounters,
        actions,
        shouldRecover,
      };
    }
  }

  // Helper to add action for a trigger condition
  const checkTrigger = (
    type: TriggerType,
    condition: boolean,
    reason: string
  ) => {
    if (!condition) return;

    const isActive = activeSet.has(type);
    const severity = (snapshot?.severityRules?.[type] as Severity) ?? DEFAULT_SEVERITIES[type];

    actions.push({
      type,
      action: isActive ? 'UPDATE' : 'OPEN',
      reason,
      severity,
      similarityPct: attempt.similarityPct,
    });
  };

  // 1. IDENTITY_MISMATCH: consecutiveMismatch >= consecutiveMismatchLimit
  const mismatchLimit = Number(snapshot?.consecutiveMismatchLimit ?? 3);
  checkTrigger(
    'IDENTITY_MISMATCH',
    nextCounters.consecutiveMismatch >= mismatchLimit,
    `Consecutive mismatch limit reached (${nextCounters.consecutiveMismatch}/${mismatchLimit})`
  );

  // 2. NO_FACE: consecutiveNoFace >= missingFaceLimit
  const missingFaceLimit = Number(snapshot?.missingFaceLimit ?? 3);
  checkTrigger(
    'NO_FACE',
    nextCounters.consecutiveNoFace >= missingFaceLimit,
    `Missing face limit reached (${nextCounters.consecutiveNoFace}/${missingFaceLimit})`
  );

  // 3. MULTIPLE_FACES: policy ALERT_IMMEDIATELY, ALERT_AFTER_CONSECUTIVE, or LOG_ONLY
  const multiPolicy = snapshot?.multipleFacesPolicy ?? 'ALERT_AFTER_CONSECUTIVE';
  const multiLimit = Number(snapshot?.multipleFacesConsecutiveLimit ?? 2);
  let multiFacesTriggered = false;
  if (multiPolicy === 'ALERT_IMMEDIATELY') {
    multiFacesTriggered = nextCounters.consecutiveMultiFace >= 1;
  } else if (multiPolicy === 'ALERT_AFTER_CONSECUTIVE') {
    multiFacesTriggered = nextCounters.consecutiveMultiFace >= multiLimit;
  }
  checkTrigger(
    'MULTIPLE_FACES',
    multiFacesTriggered,
    `Multiple faces detected (${nextCounters.consecutiveMultiFace} consecutive under policy ${multiPolicy})`
  );

  // 4. VERIFICATION_SERVICE_FAILURE: consecutiveServiceError >= serviceFailureLimit
  const serviceLimit = Number(snapshot?.serviceFailureLimit ?? 3);
  checkTrigger(
    'VERIFICATION_SERVICE_FAILURE',
    nextCounters.consecutiveServiceError >= serviceLimit,
    `Consecutive service error limit reached (${nextCounters.consecutiveServiceError}/${serviceLimit})`
  );

  // 5. REPEATED_VERIFICATION_FAILURE: consecutiveNonMatch >= repeatedFailureLimit
  const repeatedLimit = Number(snapshot?.repeatedFailureLimit ?? 5);
  checkTrigger(
    'REPEATED_VERIFICATION_FAILURE',
    nextCounters.consecutiveNonMatch >= repeatedLimit,
    `Repeated verification failure limit reached (${nextCounters.consecutiveNonMatch}/${repeatedLimit})`
  );

  // 6. CAMERA_DISCONNECTED: policy ALERT_IMMEDIATELY or ALERT_AFTER_GRACE
  const cameraPolicy = snapshot?.cameraFailurePolicy ?? 'ALERT_AFTER_GRACE';
  const cameraGraceSeconds = Number(snapshot?.cameraGraceSeconds ?? 10);
  let cameraTriggered = false;
  if (attempt.outcome === 'CAMERA_ERROR') {
    if (cameraPolicy === 'ALERT_IMMEDIATELY' || attempt.errorCode === 'NO_SIGNAL') {
      cameraTriggered = true;
    } else if (cameraPolicy === 'ALERT_AFTER_GRACE' && nextCounters.cameraErrorSince) {
      const cameraElapsedSeconds =
        (now.getTime() - new Date(nextCounters.cameraErrorSince).getTime()) / 1000;
      cameraTriggered = cameraElapsedSeconds >= cameraGraceSeconds;
    }
  }
  checkTrigger(
    'CAMERA_DISCONNECTED',
    cameraTriggered,
    `Camera error triggered under policy ${cameraPolicy}`
  );

  return {
    nextCounters,
    actions,
    shouldRecover,
  };
}
