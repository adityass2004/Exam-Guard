from typing import Any, Dict, Optional, Tuple
import math
import numpy as np


def extract_pose_from_face(face_obj: Any) -> Tuple[Optional[float], Optional[float], Optional[float], str]:
    """
    Extracts yaw, pitch, roll in degrees from a face object.
    Returns (yaw, pitch, roll, pose_source).
    """
    # 1. Prefer InsightFace's landmark_3d_68 pose if present
    # In InsightFace, face['pose'] is [pitch, yaw, roll] in degrees
    if hasattr(face_obj, "__getitem__"):
        try:
            pose = face_obj["pose"]
            if pose is not None and len(pose) >= 3:
                pitch = float(pose[0])
                yaw = float(pose[1])
                roll = float(pose[2])
                return round(yaw, 1), round(pitch, 1), round(roll, 1), "insightface_3d_68"
        except (KeyError, IndexError, TypeError):
            pass

    # 2. Fallback: Estimate from 5 facial keypoints (kps)
    # kps order in SCRFD / InsightFace:
    # 0: right eye, 1: left eye, 2: nose, 3: right mouth, 4: left mouth (from subject perspective: 0=right eye)
    kps = None
    if hasattr(face_obj, "kps"):
        kps = face_obj.kps
    elif hasattr(face_obj, "__getitem__"):
        try:
            kps = face_obj["kps"]
        except (KeyError, TypeError):
            pass

    if kps is not None and len(kps) >= 5:
        re = kps[0]  # right eye
        le = kps[1]  # left eye
        nose = kps[2]  # nose tip
        rm = kps[3]  # right mouth
        lm = kps[4]  # left mouth

        # Roll: angle between the two eyes
        dx = float(le[0] - re[0])
        dy = float(le[1] - re[1])
        roll = math.degrees(math.atan2(dy, dx))

        # Yaw: asymmetry of nose relative to the midpoint between eyes
        eye_mid_x = (re[0] + le[0]) / 2.0
        eye_dist = max(1.0, math.sqrt(dx * dx + dy * dy))
        # If nose is centered, offset is 0. If turned, nose shifts.
        nose_offset = float(nose[0] - eye_mid_x)
        # Approximate yaw in degrees (scale factor ~ 90 deg at extreme)
        yaw = float(np.clip((nose_offset / (eye_dist * 0.5)) * 45.0, -90.0, 90.0))

        # Pitch: vertical position of nose relative to eye line and mouth line
        eye_mid_y = (re[1] + le[1]) / 2.0
        mouth_mid_y = (rm[1] + lm[1]) / 2.0
        face_height = max(1.0, mouth_mid_y - eye_mid_y)
        nose_v_ratio = (nose[1] - eye_mid_y) / face_height
        # Canonical nose ratio is approx 0.45.
        pitch = float(np.clip((0.45 - nose_v_ratio) * 90.0, -90.0, 90.0))

        return round(yaw, 1), round(pitch, 1), round(roll, 1), "insightface_kps_fallback"

    return None, None, None, "NONE"

