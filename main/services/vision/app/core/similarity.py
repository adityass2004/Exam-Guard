import base64
from typing import List, Optional
import numpy as np


class InvalidReferenceException(Exception):
    """Raised when a reference embedding cannot be decoded or has invalid dimensions/values."""
    pass


def validate_reference(b64_ref: str, expected_dim: int = 512) -> np.ndarray:
    """
    Decodes and validates a base64 float32 reference embedding vector.
    Enforces expected dimensionality, finite values, and L2-normalizes.
    """
    if not b64_ref or not isinstance(b64_ref, str):
        raise InvalidReferenceException("Reference embedding must be a non-empty base64 string")

    try:
        raw_bytes = base64.b64decode(b64_ref, validate=True)
    except Exception as exc:
        raise InvalidReferenceException(f"Invalid base64 encoding: {exc}")

    expected_bytes = expected_dim * 4  # 4 bytes per float32
    if len(raw_bytes) != expected_bytes:
        raise InvalidReferenceException(
            f"Invalid reference byte length: expected {expected_bytes} bytes ({expected_dim} float32), "
            f"got {len(raw_bytes)} bytes"
        )

    vec = np.frombuffer(raw_bytes, dtype=np.float32)
    if len(vec) != expected_dim:
        raise InvalidReferenceException(
            f"Invalid reference dimension: expected {expected_dim}, got {len(vec)}"
        )

    if not np.all(np.isfinite(vec)):
        raise InvalidReferenceException("Reference vector contains NaN or Inf values")

    norm = float(np.linalg.norm(vec))
    if norm < 1e-6:
        raise InvalidReferenceException("Reference vector has zero or negligible norm")

    return (vec / norm).astype(np.float32)


def compute_cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
    """
    Computes cosine similarity between two L2-normalized float32 vectors.
    Clamps result to [-1.0, 1.0].
    """
    dot_product = float(np.dot(v1, v2))
    return float(np.clip(dot_product, -1.0, 1.0))


def compute_sample_similarities(
    emb: np.ndarray,
    samples_b64: Optional[List[str]],
    expected_dim: int = 512,
) -> Optional[List[float]]:
    """
    Computes cosine similarity of `emb` against each sample in `samples_b64`.
    Returns None if samples_b64 is empty or None.
    """
    if not samples_b64:
        return None

    similarities: List[float] = []
    for s_b64 in samples_b64:
        sample_vec = validate_reference(s_b64, expected_dim=expected_dim)
        sim = compute_cosine_similarity(emb, sample_vec)
        similarities.append(sim)

    return similarities

