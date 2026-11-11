import type { FaceAngle } from '@examguard/shared';

/**
 * Provisional Enrollment Acceptance Thresholds & Pose Windows
 *
 * NOTE: These values are initial baseline estimates (PROVISIONAL) and must be calibrated
 * against real evaluation data under target lighting conditions (documented in docs/CALIBRATION.md).
 *
 * Pose conventions:
 * - Yaw: rotation around vertical axis in degrees.
 *   - FRONT: centered (-15° to +15°)
 *   - LEFT (student's left): nose turns to student's left (+15° to +45° or -45° to -15° depending on perspective)
 *   - RIGHT (student's right): nose turns to student's right
 * - Pitch: rotation around horizontal axis in degrees.
 *   - UP: looking slightly upward (+12° to +35°)
 *   - DOWN: looking slightly downward (-35° to -12°)
 * - Roll: sideways head tilt (must be within -15° to +15°)
 */

export interface PoseWindow {
  yawMin: number;
  yawMax: number;
  pitchMin: number;
  pitchMax: number;
  rollMaxAbs: number;
}

export interface EnrollmentConfig {
  minBlur: number;
  minBrightness: number;
  maxBrightness: number;
  minFaceSizeRatio: number;
  minDetectorConfidence: number;
  minConsistencyCosine: number;
  poseWindows: Record<FaceAngle, PoseWindow>;
  hints: Record<string, string>;
}

export const enrollmentConfig: EnrollmentConfig = {
  minBlur: 35.0,
  minBrightness: 50.0,
  maxBrightness: 210.0,
  minFaceSizeRatio: 0.05,
  minDetectorConfidence: 0.65,
  minConsistencyCosine: 0.65, // Minimum cosine similarity of each angle sample to the mean centroid

  poseWindows: {
    FRONT: {
      yawMin: -15,
      yawMax: 15,
      pitchMin: -15,
      pitchMax: 15,
      rollMaxAbs: 15,
    },
    LEFT: {
      // Student turning head to student's left
      yawMin: 15,
      yawMax: 45,
      pitchMin: -18,
      pitchMax: 18,
      rollMaxAbs: 20,
    },
    RIGHT: {
      // Student turning head to student's right
      yawMin: -45,
      yawMax: -15,
      pitchMin: -18,
      pitchMax: 18,
      rollMaxAbs: 20,
    },
    UP: {
      yawMin: -18,
      yawMax: 18,
      pitchMin: 12,
      pitchMax: 35,
      rollMaxAbs: 18,
    },
    DOWN: {
      yawMin: -18,
      yawMax: 18,
      pitchMin: -35,
      pitchMax: -12,
      rollMaxAbs: 18,
    },
  },

  hints: {
    NO_FACE: 'No face detected. Please ensure your camera is uncovered and your face is visible.',
    MULTIPLE_FACES: 'Multiple faces detected. Please ensure only one person is in the camera frame.',
    FACE_TOO_SMALL: 'You are too far from the camera. Please move closer to the screen.',
    FACE_PARTIALLY_OUT_OF_FRAME: 'Your face is partially out of frame. Please center your face in the oval guide.',
    TOO_BLURRY: 'The camera feed is blurry. Hold still or clean your webcam lens.',
    TOO_DARK: 'Lighting is too dim. Please turn on room lights or face a light source.',
    TOO_BRIGHT: 'Lighting is too harsh or overexposed. Please adjust lighting to reduce glare.',
    LOW_DETECTION_CONFIDENCE: 'Face detection is uncertain. Improve lighting and face the camera directly.',
    POSE_NOT_ESTIMATED: 'Head pose could not be estimated. Keep your entire face visible.',
    WRONG_POSE_FRONT: 'Please look directly at the center of the camera.',
    WRONG_POSE_LEFT: 'Please turn your head slightly to your left.',
    WRONG_POSE_RIGHT: 'Please turn your head slightly to your right.',
    WRONG_POSE_UP: 'Please tilt your head slightly upward.',
    WRONG_POSE_DOWN: 'Please tilt your head slightly downward.',
    EXCESSIVE_TILT: 'Please keep your head upright without tilting sideways.',
  },
};
