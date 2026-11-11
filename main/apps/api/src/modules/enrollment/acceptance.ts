import type { FaceAngle } from '@examguard/shared';
import { enrollmentConfig } from '../../config/enrollment.js';
import type { VisionQualityResponse } from '../../lib/vision-client.js';

export interface AcceptanceResult {
  acceptable: boolean;
  reasons: string[];
  hints: string[];
}

export function validateEnrollmentCaptureQuality(
  qualityRes: VisionQualityResponse,
  targetAngle: FaceAngle,
): AcceptanceResult {
  const reasons: string[] = [...qualityRes.reasons];
  const hints: string[] = [];

  // 1. Face count check
  if (qualityRes.faceCount === 0) {
    if (!reasons.includes('NO_FACE')) reasons.push('NO_FACE');
  } else if (qualityRes.faceCount > 1) {
    if (!reasons.includes('MULTIPLE_FACES')) reasons.push('MULTIPLE_FACES');
  }

  // 2. Metrics threshold checks
  if (qualityRes.faceCount === 1) {
    const face = qualityRes.faces[0];
    const q = qualityRes.quality;

    if (q.blur < enrollmentConfig.minBlur && !reasons.includes('TOO_BLURRY')) {
      reasons.push('TOO_BLURRY');
    }
    if (q.brightness < enrollmentConfig.minBrightness && !reasons.includes('TOO_DARK')) {
      reasons.push('TOO_DARK');
    }
    if (q.brightness > enrollmentConfig.maxBrightness && !reasons.includes('TOO_BRIGHT')) {
      reasons.push('TOO_BRIGHT');
    }
    if (q.faceSizeRatio < enrollmentConfig.minFaceSizeRatio && !reasons.includes('FACE_TOO_SMALL')) {
      reasons.push('FACE_TOO_SMALL');
    }
    if (!q.faceInFrame && !reasons.includes('FACE_PARTIALLY_OUT_OF_FRAME')) {
      reasons.push('FACE_PARTIALLY_OUT_OF_FRAME');
    }
    if (face.detScore < enrollmentConfig.minDetectorConfidence && !reasons.includes('LOW_DETECTION_CONFIDENCE')) {
      reasons.push('LOW_DETECTION_CONFIDENCE');
    }

    // 3. Pose window evaluation
    const window = enrollmentConfig.poseWindows[targetAngle];
    const yaw = face.yaw;
    const pitch = face.pitch;
    const roll = face.roll;

    if (yaw === null || pitch === null || roll === null) {
      if (!reasons.includes('POSE_NOT_ESTIMATED')) reasons.push('POSE_NOT_ESTIMATED');
    } else {
      if (Math.abs(roll) > window.rollMaxAbs) {
        reasons.push('EXCESSIVE_TILT');
      }

      const yawOk = yaw >= window.yawMin && yaw <= window.yawMax;
      const pitchOk = pitch >= window.pitchMin && pitch <= window.pitchMax;

      if (!yawOk || !pitchOk) {
        reasons.push(`WRONG_POSE_${targetAngle}`);
      }
    }
  }

  // Deduplicate reasons
  const uniqueReasons = Array.from(new Set(reasons));

  // Map reasons to friendly student hints
  for (const reason of uniqueReasons) {
    const hint = enrollmentConfig.hints[reason];
    if (hint) {
      hints.push(hint);
    }
  }

  return {
    acceptable: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    hints,
  };
}
