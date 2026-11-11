from typing import Any, Dict, List, Optional, Tuple
import time
import numpy as np
from app.core.model_loader import model_loader
from app.core.pose import extract_pose_from_face
from app.core.quality import assess_quality


class ModelUnavailableException(Exception):
    pass


class ConcurrencyLimitException(Exception):
    pass


def detect_and_measure(
    bgr_img: np.ndarray,
    angle: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[str], List[Any], float]:
    """
    Runs face detection, pose estimation, and quality evaluation on an input BGR image.
    Returns: (faces_json, quality_metrics, reasons, raw_face_objects, duration_ms)
    """
    t0 = time.perf_counter()

    if not model_loader.is_loaded():
        raise ModelUnavailableException("Face analysis model is not loaded or ready")

    raw_faces = model_loader.model.get(bgr_img)

    # Sort faces by detection score descending
    raw_faces = sorted(raw_faces, key=lambda f: float(f.det_score) if hasattr(f, "det_score") else 0.0, reverse=True)

    faces_json: List[Dict[str, Any]] = []
    for face in raw_faces:
        bbox = [round(float(v), 1) for v in face.bbox]
        det_score = round(float(face.det_score), 4)
        yaw, pitch, roll, pose_src = extract_pose_from_face(face)

        # Extract real 5 SCRFD keypoints: [left_eye, right_eye, nose, left_mouth, right_mouth]
        kps_list = None
        if hasattr(face, "kps") and face.kps is not None:
            kps_list = [[round(float(pt[0]), 1), round(float(pt[1]), 1)] for pt in face.kps]

        faces_json.append({
            "box": bbox,
            "detScore": det_score,
            "yaw": yaw,
            "pitch": pitch,
            "roll": roll,
            "poseSource": pose_src,
            "kps": kps_list,
        })

    face_count = len(faces_json)
    quality_metrics, reasons = assess_quality(bgr_img, face_count, faces_json, angle=angle)
    duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)

    return faces_json, quality_metrics, reasons, raw_faces, duration_ms

