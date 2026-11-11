import { describe, it, expect } from 'vitest';
import { evaluateTriggers } from './evaluateTriggers.js';
import { computeNextCounters } from './counters.js';
import { SessionCounters, VerificationAttemptContext } from './triggers.types.js';

describe('Pure Trigger Engine & Counter Suite', () => {
  const initialCounters: SessionCounters = {
    consecutiveMatch: 0,
    consecutiveMismatch: 0,
    consecutiveNoFace: 0,
    consecutiveMultiFace: 0,
    consecutiveServiceError: 0,
    consecutiveNonMatch: 0,
    cameraErrorSince: null,
  };

  const defaultSnapshot = {
    consecutiveMismatchLimit: 3,
    missingFaceLimit: 3,
    multipleFacesPolicy: 'ALERT_AFTER_CONSECUTIVE',
    multipleFacesConsecutiveLimit: 2,
    cameraFailurePolicy: 'ALERT_AFTER_GRACE',
    cameraGraceSeconds: 10,
    serviceFailureLimit: 3,
    repeatedFailureLimit: 5,
    recoveryMatchCount: 3,
    startupGraceSeconds: 10,
    severityRules: {
      IDENTITY_MISMATCH: 'CRITICAL',
      MULTIPLE_FACES: 'HIGH',
      CAMERA_DISCONNECTED: 'HIGH',
      NO_FACE: 'MEDIUM',
      REPEATED_VERIFICATION_FAILURE: 'MEDIUM',
      VERIFICATION_SERVICE_FAILURE: 'LOW',
    },
  };

  const baseDate = new Date('2026-11-10T12:00:00Z');
  const pastGraceDate = new Date('2026-11-10T12:01:00Z'); // 60s after start (past 10s grace)

  describe('Counter Transition Table (Deterministic Pure Unit Tests)', () => {
    it('MATCH increments consecutiveMatch and resets all failure counters', () => {
      const prev: SessionCounters = {
        consecutiveMatch: 0,
        consecutiveMismatch: 2,
        consecutiveNoFace: 1,
        consecutiveMultiFace: 1,
        consecutiveServiceError: 1,
        consecutiveNonMatch: 4,
        cameraErrorSince: new Date('2026-11-10T11:59:00Z'),
      };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'MATCH',
        errorCode: 'NONE',
        similarityPct: 88,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.consecutiveMatch).toBe(1);
      expect(next.consecutiveMismatch).toBe(0);
      expect(next.consecutiveNoFace).toBe(0);
      expect(next.consecutiveMultiFace).toBe(0);
      expect(next.consecutiveServiceError).toBe(0);
      expect(next.consecutiveNonMatch).toBe(0);
      expect(next.cameraErrorSince).toBeNull();
    });

    it('MISMATCH increments consecutiveMismatch, consecutiveNonMatch and clears other streaks', () => {
      const prev: SessionCounters = {
        consecutiveMatch: 5,
        consecutiveMismatch: 1,
        consecutiveNoFace: 2,
        consecutiveMultiFace: 2,
        consecutiveServiceError: 2,
        consecutiveNonMatch: 2,
        cameraErrorSince: null,
      };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        errorCode: 'BELOW_THRESHOLD',
        similarityPct: 42,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.consecutiveMatch).toBe(0);
      expect(next.consecutiveMismatch).toBe(2);
      expect(next.consecutiveNoFace).toBe(0);
      expect(next.consecutiveMultiFace).toBe(0);
      expect(next.consecutiveServiceError).toBe(0);
      expect(next.consecutiveNonMatch).toBe(3);
    });

    it('NO_FACE leaves consecutiveMismatch UNCHANGED (=) while incrementing consecutiveNoFace', () => {
      const prev: SessionCounters = {
        consecutiveMatch: 0,
        consecutiveMismatch: 2,
        consecutiveNoFace: 0,
        consecutiveMultiFace: 0,
        consecutiveServiceError: 0,
        consecutiveNonMatch: 2,
        cameraErrorSince: null,
      };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'NO_FACE',
        errorCode: 'NO_FACE_DETECTED',
        similarityPct: null,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.consecutiveMatch).toBe(0);
      expect(next.consecutiveMismatch).toBe(2); // Unchanged!
      expect(next.consecutiveNoFace).toBe(1);
      expect(next.consecutiveMultiFace).toBe(0);
      expect(next.consecutiveNonMatch).toBe(3);
    });

    it('MULTIPLE_FACES leaves consecutiveMismatch UNCHANGED (=) while incrementing consecutiveMultiFace', () => {
      const prev: SessionCounters = {
        consecutiveMatch: 0,
        consecutiveMismatch: 2,
        consecutiveNoFace: 2,
        consecutiveMultiFace: 0,
        consecutiveServiceError: 0,
        consecutiveNonMatch: 3,
        cameraErrorSince: null,
      };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'MULTIPLE_FACES',
        errorCode: 'MULTIPLE_FACES_DETECTED',
        similarityPct: null,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.consecutiveMismatch).toBe(2); // Unchanged!
      expect(next.consecutiveNoFace).toBe(0);
      expect(next.consecutiveMultiFace).toBe(1);
      expect(next.consecutiveNonMatch).toBe(4);
    });

    it('LOW_QUALITY_FRAME leaves consecutiveMismatch, consecutiveNoFace, consecutiveMultiFace UNCHANGED', () => {
      const prev: SessionCounters = {
        consecutiveMatch: 0,
        consecutiveMismatch: 2,
        consecutiveNoFace: 1,
        consecutiveMultiFace: 1,
        consecutiveServiceError: 0,
        consecutiveNonMatch: 3,
        cameraErrorSince: null,
      };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'VERIFICATION_ERROR',
        errorCode: 'LOW_QUALITY_FRAME',
        similarityPct: null,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.consecutiveMismatch).toBe(2);
      expect(next.consecutiveNoFace).toBe(1);
      expect(next.consecutiveMultiFace).toBe(1);
      expect(next.consecutiveServiceError).toBe(0); // Service error is NOT incremented
      expect(next.consecutiveNonMatch).toBe(4);
    });

    it('VERIFICATION_ERROR with service errors increments consecutiveServiceError and consecutiveNonMatch', () => {
      const prev = { ...initialCounters };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'VERIFICATION_ERROR',
        errorCode: 'SERVICE_UNAVAILABLE',
        similarityPct: null,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.consecutiveServiceError).toBe(1);
      expect(next.consecutiveNonMatch).toBe(1);
      expect(next.consecutiveMismatch).toBe(0);
    });

    it('CAMERA_ERROR sets cameraErrorSince when null, leaves other counters unchanged, increments nonMatch', () => {
      const prev = { ...initialCounters };
      const attempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'CAMERA_ERROR',
        errorCode: 'PERMISSION_DENIED',
        similarityPct: null,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next.cameraErrorSince).toEqual(baseDate);
      expect(next.consecutiveNonMatch).toBe(1);

      // Second CAMERA_ERROR does not advance cameraErrorSince
      const nextNext = computeNextCounters(
        next,
        attempt,
        new Date(baseDate.getTime() + 2000)
      );
      expect(nextNext.cameraErrorSince).toEqual(baseDate);
      expect(nextNext.consecutiveNonMatch).toBe(2);
    });

    it('PRE_EXAM phase attempts do not touch continuous counters', () => {
      const prev: SessionCounters = {
        consecutiveMatch: 2,
        consecutiveMismatch: 1,
        consecutiveNoFace: 1,
        consecutiveMultiFace: 0,
        consecutiveServiceError: 0,
        consecutiveNonMatch: 2,
        cameraErrorSince: null,
      };
      const attempt: VerificationAttemptContext = {
        phase: 'PRE_EXAM',
        outcome: 'MISMATCH',
        errorCode: 'BELOW_THRESHOLD',
        similarityPct: 40,
      };

      const next = computeNextCounters(prev, attempt, baseDate);
      expect(next).toEqual(prev);
    });
  });

  describe('Trigger Boundary & Policy Evaluations', () => {
    it('does not trigger below limit, triggers exactly at limit', () => {
      // Limit is 3
      let state = { ...initialCounters };
      const mismatchAttempt: VerificationAttemptContext = {
        phase: 'CONTINUOUS',
        outcome: 'MISMATCH',
        errorCode: 'BELOW_THRESHOLD',
        similarityPct: 45,
      };

      // Attempt 1: consecutiveMismatch = 1 -> no trigger
      let res = evaluateTriggers({
        prevState: state,
        attempt: mismatchAttempt,
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(res.actions).toHaveLength(0);
      state = res.nextCounters;

      // Attempt 2: consecutiveMismatch = 2 (limit - 1) -> no trigger
      res = evaluateTriggers({
        prevState: state,
        attempt: mismatchAttempt,
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(res.actions).toHaveLength(0);
      state = res.nextCounters;

      // Attempt 3: consecutiveMismatch = 3 (== limit) -> OPENS IDENTITY_MISMATCH
      res = evaluateTriggers({
        prevState: state,
        attempt: mismatchAttempt,
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(res.actions).toContainEqual(
        expect.objectContaining({
          type: 'IDENTITY_MISMATCH',
          action: 'OPEN',
          severity: 'CRITICAL',
        })
      );
    });

    it('interleaved MISMATCH, NO_FACE, MISMATCH, MISMATCH triggers IDENTITY_MISMATCH', () => {
      let state = { ...initialCounters };

      // 1. MISMATCH -> consecutiveMismatch = 1
      state = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 50 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      }).nextCounters;

      // 2. NO_FACE -> consecutiveMismatch stays 1
      state = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'NO_FACE', errorCode: 'NO_FACE_DETECTED', similarityPct: null },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      }).nextCounters;
      expect(state.consecutiveMismatch).toBe(1);

      // 3. MISMATCH -> consecutiveMismatch = 2
      state = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 50 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      }).nextCounters;
      expect(state.consecutiveMismatch).toBe(2);

      // 4. MISMATCH -> consecutiveMismatch = 3 -> triggers IDENTITY_MISMATCH!
      const res = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 48 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(res.nextCounters.consecutiveMismatch).toBe(3);
      expect(res.actions).toContainEqual(
        expect.objectContaining({
          type: 'IDENTITY_MISMATCH',
          action: 'OPEN',
        })
      );
    });

    it('a MATCH in between resets consecutiveMismatch and prevents trigger', () => {
      let state = { ...initialCounters };

      // Two mismatches
      state = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 40 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      }).nextCounters;
      state = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 40 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      }).nextCounters;
      expect(state.consecutiveMismatch).toBe(2);

      // MATCH resets it
      state = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MATCH', errorCode: 'NONE', similarityPct: 90 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      }).nextCounters;
      expect(state.consecutiveMismatch).toBe(0);

      // One more mismatch is only 1, not 3
      const res = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 40 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(res.nextCounters.consecutiveMismatch).toBe(1);
      expect(res.actions).toHaveLength(0);
    });

    it('honors startup grace period: no triggers fire before startup_grace_seconds', () => {
      const withinGraceDate = new Date(baseDate.getTime() + 5000); // 5s in, grace is 10s
      let state = { ...initialCounters, consecutiveMismatch: 2 };

      const res = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 40 },
        snapshot: defaultSnapshot,
        now: withinGraceDate,
        startedAt: baseDate,
      });

      // Counter advanced to 3
      expect(res.nextCounters.consecutiveMismatch).toBe(3);
      // But no action fired because within grace!
      expect(res.actions).toHaveLength(0);

      // On next attempt past grace, it triggers OPEN
      const afterGraceRes = evaluateTriggers({
        prevState: res.nextCounters,
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 40 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(afterGraceRes.actions).toContainEqual(
        expect.objectContaining({
          type: 'IDENTITY_MISMATCH',
          action: 'OPEN',
        })
      );
    });

    it('handles MULTIPLE_FACES policies: LOG_ONLY, ALERT_IMMEDIATELY, ALERT_AFTER_CONSECUTIVE', () => {
      // 1. LOG_ONLY
      const logOnlyRes = evaluateTriggers({
        prevState: { ...initialCounters, consecutiveMultiFace: 10 },
        attempt: { phase: 'CONTINUOUS', outcome: 'MULTIPLE_FACES', errorCode: 'NONE', similarityPct: null },
        snapshot: { ...defaultSnapshot, multipleFacesPolicy: 'LOG_ONLY' },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(logOnlyRes.actions.some((a) => a.type === 'MULTIPLE_FACES')).toBe(false);

      // 2. ALERT_IMMEDIATELY (triggers on 1st occurrence)
      const alertImmRes = evaluateTriggers({
        prevState: initialCounters,
        attempt: { phase: 'CONTINUOUS', outcome: 'MULTIPLE_FACES', errorCode: 'NONE', similarityPct: null },
        snapshot: { ...defaultSnapshot, multipleFacesPolicy: 'ALERT_IMMEDIATELY' },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(alertImmRes.actions).toContainEqual(
        expect.objectContaining({
          type: 'MULTIPLE_FACES',
          action: 'OPEN',
        })
      );

      // 3. ALERT_AFTER_CONSECUTIVE (limit = 2)
      const consecRes1 = evaluateTriggers({
        prevState: initialCounters,
        attempt: { phase: 'CONTINUOUS', outcome: 'MULTIPLE_FACES', errorCode: 'NONE', similarityPct: null },
        snapshot: { ...defaultSnapshot, multipleFacesPolicy: 'ALERT_AFTER_CONSECUTIVE', multipleFacesConsecutiveLimit: 2 },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(consecRes1.actions.some((a) => a.type === 'MULTIPLE_FACES')).toBe(false);

      const consecRes2 = evaluateTriggers({
        prevState: consecRes1.nextCounters,
        attempt: { phase: 'CONTINUOUS', outcome: 'MULTIPLE_FACES', errorCode: 'NONE', similarityPct: null },
        snapshot: { ...defaultSnapshot, multipleFacesPolicy: 'ALERT_AFTER_CONSECUTIVE', multipleFacesConsecutiveLimit: 2 },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(consecRes2.actions).toContainEqual(
        expect.objectContaining({
          type: 'MULTIPLE_FACES',
          action: 'OPEN',
        })
      );
    });

    it('handles CAMERA_DISCONNECTED policies: ALERT_IMMEDIATELY and ALERT_AFTER_GRACE', () => {
      // 1. ALERT_IMMEDIATELY
      const immRes = evaluateTriggers({
        prevState: initialCounters,
        attempt: { phase: 'CONTINUOUS', outcome: 'CAMERA_ERROR', errorCode: 'PERMISSION_DENIED', similarityPct: null },
        snapshot: { ...defaultSnapshot, cameraFailurePolicy: 'ALERT_IMMEDIATELY' },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(immRes.actions).toContainEqual(
        expect.objectContaining({
          type: 'CAMERA_DISCONNECTED',
          action: 'OPEN',
        })
      );

      // 2. ALERT_AFTER_GRACE: not elapsed yet
      const errorSince = new Date(pastGraceDate.getTime() - 5000); // 5s ago, grace is 10s
      const graceRes1 = evaluateTriggers({
        prevState: { ...initialCounters, cameraErrorSince: errorSince },
        attempt: { phase: 'CONTINUOUS', outcome: 'CAMERA_ERROR', errorCode: 'TRACK_ENDED', similarityPct: null },
        snapshot: { ...defaultSnapshot, cameraFailurePolicy: 'ALERT_AFTER_GRACE', cameraGraceSeconds: 10 },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(graceRes1.actions.some((a) => a.type === 'CAMERA_DISCONNECTED')).toBe(false);

      // 3. ALERT_AFTER_GRACE: elapsed >= 10s
      const errorSince12s = new Date(pastGraceDate.getTime() - 12000); // 12s ago
      const graceRes2 = evaluateTriggers({
        prevState: { ...initialCounters, cameraErrorSince: errorSince12s },
        attempt: { phase: 'CONTINUOUS', outcome: 'CAMERA_ERROR', errorCode: 'TRACK_ENDED', similarityPct: null },
        snapshot: { ...defaultSnapshot, cameraFailurePolicy: 'ALERT_AFTER_GRACE', cameraGraceSeconds: 10 },
        now: pastGraceDate,
        startedAt: baseDate,
      });
      expect(graceRes2.actions).toContainEqual(
        expect.objectContaining({
          type: 'CAMERA_DISCONNECTED',
          action: 'OPEN',
        })
      );
    });

    it('emits UPDATE instead of OPEN when trigger is already active in session', () => {
      const res = evaluateTriggers({
        prevState: { ...initialCounters, consecutiveMismatch: 2 },
        attempt: { phase: 'CONTINUOUS', outcome: 'MISMATCH', errorCode: 'NONE', similarityPct: 35 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
        activeIncidents: ['IDENTITY_MISMATCH'], // Already active!
      });

      expect(res.actions).toContainEqual(
        expect.objectContaining({
          type: 'IDENTITY_MISMATCH',
          action: 'UPDATE',
        })
      );
    });

    it('detects recovery after recoveryMatchCount consecutive MATCH outcomes', () => {
      // 2 matches so far
      const state = { ...initialCounters, consecutiveMatch: 2 };

      // 3rd match (recoveryMatchCount is 3)
      const res = evaluateTriggers({
        prevState: state,
        attempt: { phase: 'CONTINUOUS', outcome: 'MATCH', errorCode: 'NONE', similarityPct: 92 },
        snapshot: defaultSnapshot,
        now: pastGraceDate,
        startedAt: baseDate,
        activeIncidents: ['IDENTITY_MISMATCH', 'NO_FACE'],
      });

      expect(res.shouldRecover).toBe(true);
      expect(res.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'IDENTITY_MISMATCH',
            action: 'RECOVER',
          }),
          expect.objectContaining({
            type: 'NO_FACE',
            action: 'RECOVER',
          }),
        ])
      );
    });
  });
});
