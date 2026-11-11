import {
  VerificationOutcome,
  VerificationStatusCode,
  STUDENT_MESSAGES,
} from '@examguard/shared';

export interface StatusCodeResolution {
  statusCode: VerificationStatusCode;
  studentMessage: string;
  activeWarning: boolean;
}

export function resolveVerificationStatus(
  outcome: VerificationOutcome,
  errorCode?: string | null,
  qualityReasons?: string[]
): StatusCodeResolution {
  switch (outcome) {
    case 'MATCH':
      return {
        statusCode: 'IDENTITY_VERIFIED',
        studentMessage: STUDENT_MESSAGES.MATCH,
        activeWarning: false,
      };

    case 'NO_FACE':
      return {
        statusCode: 'FACE_NOT_DETECTED',
        studentMessage: STUDENT_MESSAGES.NO_FACE,
        activeWarning: true,
      };

    case 'MULTIPLE_FACES':
      return {
        statusCode: 'MULTIPLE_FACES',
        studentMessage: STUDENT_MESSAGES.MULTIPLE_FACES,
        activeWarning: true,
      };

    case 'MISMATCH':
      return {
        statusCode: 'IDENTITY_NOT_CONFIRMED',
        studentMessage: STUDENT_MESSAGES.MISMATCH,
        activeWarning: true,
      };

    case 'CAMERA_ERROR':
      return {
        statusCode: 'CAMERA_PROBLEM',
        studentMessage: STUDENT_MESSAGES.CAMERA_ERROR,
        activeWarning: true,
      };

    case 'VERIFICATION_ERROR':
    default:
      if (
        errorCode === 'LOW_QUALITY_FRAME' ||
        errorCode === 'IMAGE_UNCLEAR' ||
        (qualityReasons && qualityReasons.length > 0)
      ) {
        return {
          statusCode: 'IMAGE_UNCLEAR',
          studentMessage: STUDENT_MESSAGES.LOW_QUALITY_FRAME,
          activeWarning: true,
        };
      }

      return {
        statusCode: 'SERVICE_UNAVAILABLE',
        studentMessage: STUDENT_MESSAGES.SERVICE_UNAVAILABLE,
        activeWarning: true,
      };
  }
}

