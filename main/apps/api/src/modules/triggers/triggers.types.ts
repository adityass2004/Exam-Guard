import {
  VerificationOutcome,
  VerificationPhase,
  TriggerType,
  Severity,
} from '@examguard/shared';

export interface SessionCounters {
  consecutiveMatch: number;
  consecutiveMismatch: number;
  consecutiveNoFace: number;
  consecutiveMultiFace: number;
  consecutiveServiceError: number;
  consecutiveNonMatch: number;
  cameraErrorSince: Date | null;
}

export interface VerificationAttemptContext {
  phase: VerificationPhase;
  outcome: VerificationOutcome;
  errorCode: string;
  similarityPct: number | null;
  frameBuffer?: Buffer | null;
}

export type TriggerAction = 'OPEN' | 'UPDATE' | 'RECOVER' | 'NONE';

export interface TriggerActionDecision {
  type: TriggerType;
  action: TriggerAction;
  reason: string;
  severity: Severity;
  similarityPct: number | null;
}

export interface EvaluateTriggersInput {
  prevState: SessionCounters;
  attempt: VerificationAttemptContext;
  snapshot: Record<string, any>;
  now: Date;
  startedAt?: Date | null;
  activeIncidents?: Set<TriggerType> | TriggerType[];
}

export interface EvaluateTriggersOutput {
  nextCounters: SessionCounters;
  actions: TriggerActionDecision[];
  shouldRecover: boolean;
}
