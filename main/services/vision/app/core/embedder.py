import base64
from typing import Any, List, Optional, Tuple
import numpy as np


def extract_embedding_b64(
    raw_faces: List[Any],
    min_confidence: float = 0.60,
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[int]]:
    """
    Extracts L2-normalized 512-d float32 embedding as base64 string
    ONLY when exactly one acceptable face is detected.
    Returns: (b64_str, model_name, model_version, dim)
    """
    if len(raw_faces) != 1:
        return None, None, None, None

    face = raw_faces[0]
    det_score = float(face.det_score) if hasattr(face, "det_score") else 0.0
    if det_score < min_confidence:
        return None, None, None, None

    emb = None
    if hasattr(face, "normed_embedding") and face.normed_embedding is not None:
        emb = face.normed_embedding
    elif hasattr(face, "embedding") and face.embedding is not None:
        norm = np.linalg.norm(face.embedding)
        if norm > 1e-6:
            emb = face.embedding / norm

    if emb is None:
        return None, None, None, None

    emb_float32 = emb.astype(np.float32)
    b64_str = base64.b64encode(emb_float32.tobytes()).decode("ascii")

    return b64_str, "buffalo_l", "1.0", len(emb_float32)


def extract_embedding_vector(
    raw_faces: List[Any],
    min_confidence: float = 0.60,
) -> Tuple[Optional[np.ndarray], Optional[str], Optional[str], Optional[int]]:
    """
    Extracts L2-normalized 512-d float32 embedding as numpy array
    ONLY when exactly one acceptable face is detected.
    Returns: (np_array, model_name, model_version, dim)
    """
    if len(raw_faces) != 1:
        return None, None, None, None

    face = raw_faces[0]
    det_score = float(face.det_score) if hasattr(face, "det_score") else 0.0
    if det_score < min_confidence:
        return None, None, None, None

    emb = None
    if hasattr(face, "normed_embedding") and face.normed_embedding is not None:
        emb = face.normed_embedding
    elif hasattr(face, "embedding") and face.embedding is not None:
        norm = np.linalg.norm(face.embedding)
        if norm > 1e-6:
            emb = face.embedding / norm

    if emb is None:
        return None, None, None, None

    emb_float32 = emb.astype(np.float32)
    norm = float(np.linalg.norm(emb_float32))
    if norm > 1e-6:
        emb_float32 = emb_float32 / norm

    return emb_float32, "buffalo_l", "1.0", len(emb_float32)


