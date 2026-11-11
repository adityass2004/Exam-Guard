import { VerificationOutcome } from '@examguard/shared';

export const STUDENT_MESSAGES: Record<string, string> = {
  MATCH: 'Identity verified',
  NO_FACE: 'Face not detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  MISMATCH: 'Identity could not be confirmed',
  LOW_QUALITY_FRAME: 'Image unclear, improve lighting',
  CAMERA_ERROR: 'Camera disconnected or blocked',
  SERVICE_UNAVAILABLE: 'Verification service temporarily unavailable',
  MODEL_UNAVAILABLE: 'Verification service temporarily unavailable',
  SERVICE_TIMEOUT: 'Verification service temporarily unavailable',
  SERVICE_BUSY: 'Verification service temporarily unavailable',
  MODEL_MISMATCH: 'Verification service temporarily unavailable',
};

export function getStudentMessage(outcome: VerificationOutcome, errorCode?: string | null): string {
  if (errorCode && STUDENT_MESSAGES[errorCode]) {
    return STUDENT_MESSAGES[errorCode];
  }
  return STUDENT_MESSAGES[outcome] || 'Identity could not be confirmed';
}

