from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np


def compute_blur(gray_roi: np.ndarray) -> float:
    """Computes the variance of the Laplacian (sharpness/blur metric)."""
    if gray_roi.size == 0:
        return 0.0
    return float(cv2.Laplacian(gray_roi, cv2.CV_64F).var())


def compute_brightness_and_exposure(gray_roi: np.ndarray) -> Tuple[float, float, float]:
    """
    Computes mean brightness, under-exposure fraction (<15), and over-exposure fraction (>240).
    """
    if gray_roi.size == 0:
        return 0.0, 1.0, 0.0
    mean_val = float(np.mean(gray_roi))
    under_exposed = float(np.count_nonzero(gray_roi < 15)) / float(gray_roi.size)
    over_exposed = float(np.count_nonzero(gray_roi > 240)) / float(gray_roi.size)
    return mean_val, under_exposed, over_exposed


def assess_quality(
    frame_bgr: np.ndarray,
    face_count: int,
    faces_data: List[Dict[str, Any]],
    angle: Optional[str] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Assesses image and face quality metrics.
    Returns (quality_metrics_dict, reasons_list).
    """
    reasons: List[str] = []
    frame_h, frame_w = frame_bgr.shape[:2]
    frame_area = frame_w * frame_h

    frame_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    frame_blur = compute_blur(frame_gray)

    if face_count == 0:
        reasons.append("NO_FACE")
        quality_metrics = {
            "blur": round(frame_blur, 2),
            "brightness": round(float(np.mean(frame_gray)), 2),
            "faceSizeRatio": 0.0,
            "faceInFrame": False,
            "poseOk": False,
            "underExposureFraction": round(float(np.count_nonzero(frame_gray < 15)) / float(frame_gray.size), 3),
            "overExposureFraction": round(float(np.count_nonzero(frame_gray > 240)) / float(frame_gray.size), 3),
        }
        return quality_metrics, reasons

    if face_count > 1:
        reasons.append("MULTIPLE_FACES")

    # Primary face analysis (first / most confident face)
    primary = faces_data[0]
    box = primary["box"]  # [x1, y1, x2, y2]
    x1, y1, x2, y2 = [int(v) for v in box]
    det_score = float(primary.get("detScore", 0.0))

    # Clamp coordinates to frame for ROI extraction
    roi_x1 = max(0, x1)
    roi_y1 = max(0, y1)
    roi_x2 = min(frame_w, x2)
    roi_y2 = min(frame_h, y2)

    face_w = max(0, x2 - x1)
    face_h = max(0, y2 - y1)
    face_area = face_w * face_h
    face_size_ratio = float(face_area) / float(frame_area) if frame_area > 0 else 0.0

    # Margin check: is face box fully in frame with at least 5px margin?
    face_in_frame = (x1 >= 5) and (y1 >= 5) and (x2 <= frame_w - 5) and (y2 <= frame_h - 5)
    if not face_in_frame:
        reasons.append("FACE_PARTIALLY_OUT_OF_FRAME")

    # Min face side constraint
    min_side = min(face_w, face_h)
    if min_side < 70 or face_size_ratio < 0.04:
        reasons.append("FACE_TOO_SMALL")

    # Face ROI luminance & blur
    face_gray = frame_gray[roi_y1:roi_y2, roi_x1:roi_x2]
    face_blur = compute_blur(face_gray)
    brightness, under_exp, over_exp = compute_brightness_and_exposure(face_gray)

    # Sharpness check
    if face_blur < 30.0:
        reasons.append("TOO_BLURRY")

    # Exposure / lighting checks
    if brightness < 45.0 or under_exp > 0.45:
        reasons.append("TOO_DARK")
    elif brightness > 215.0 or over_exp > 0.45:
        reasons.append("TOO_BRIGHT")

    # Confidence check
    if det_score < 0.60:
        reasons.append("LOW_DETECTION_CONFIDENCE")

    # Pose estimation check
    yaw = primary.get("yaw")
    pitch = primary.get("pitch")
    roll = primary.get("roll")
    pose_ok = yaw is not None and pitch is not None and roll is not None
    if not pose_ok:
        reasons.append("POSE_NOT_ESTIMATED")

    quality_metrics = {
        "blur": round(face_blur, 2),
        "brightness": round(brightness, 2),
        "faceSizeRatio": round(face_size_ratio, 4),
        "faceInFrame": face_in_frame,
        "poseOk": pose_ok,
        "underExposureFraction": round(under_exp, 3),
        "overExposureFraction": round(over_exp, 3),
    }

    return quality_metrics, reasons

