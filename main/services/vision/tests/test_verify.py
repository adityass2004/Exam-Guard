import base64
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.config import settings
from app.core.model_loader import model_loader
from app.core.similarity import (
    InvalidReferenceException,
    compute_cosine_similarity,
    validate_reference,
)
from app.main import app

client = TestClient(app)
VALID_KEY = "test_vision_internal_key"


def create_jpeg_bytes(img: np.ndarray) -> bytes:
    success, encoded = cv2.imencode(".jpg", img)
    assert success
    return encoded.tobytes()


def make_dummy_embedding_b64(dim: int = 512, seed: int = 42) -> str:
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim).astype(np.float32)
    vec /= np.linalg.norm(vec)
    return base64.b64encode(vec.tobytes()).decode("ascii")


def test_similarity_computation():
    ref_b64 = make_dummy_embedding_b64(seed=1)
    ref_vec = validate_reference(ref_b64)
    assert len(ref_vec) == 512
    assert abs(np.linalg.norm(ref_vec) - 1.0) < 1e-5

    # Self-similarity must be exactly 1.0
    sim_self = compute_cosine_similarity(ref_vec, ref_vec)
    assert abs(sim_self - 1.0) < 1e-5

    # Orthogonal or distinct vector
    ref2_b64 = make_dummy_embedding_b64(seed=2)
    ref2_vec = validate_reference(ref2_b64)
    sim_distinct = compute_cosine_similarity(ref_vec, ref2_vec)
    assert -1.0 <= sim_distinct <= 1.0


def test_validate_reference_exceptions():
    # Empty string
    with pytest.raises(InvalidReferenceException):
        validate_reference("")

    # Corrupt base64
    with pytest.raises(InvalidReferenceException):
        validate_reference("not-valid-base64!@#")

    # Wrong byte length (256 float32 instead of 512)
    short_vec = np.ones(256, dtype=np.float32)
    short_b64 = base64.b64encode(short_vec.tobytes()).decode("ascii")
    with pytest.raises(InvalidReferenceException, match="Invalid reference byte length"):
        validate_reference(short_b64)

    # Zero vector
    zero_vec = np.zeros(512, dtype=np.float32)
    zero_b64 = base64.b64encode(zero_vec.tobytes()).decode("ascii")
    with pytest.raises(InvalidReferenceException, match="zero or negligible norm"):
        validate_reference(zero_b64)


def test_verify_requires_internal_key(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    img_bytes = create_jpeg_bytes(np.zeros((100, 100, 3), dtype=np.uint8))
    ref_b64 = make_dummy_embedding_b64()

    res = client.post(
        "/v1/verify",
        files={"image": ("test.jpg", img_bytes, "image/jpeg")},
        data={"reference": ref_b64},
    )
    assert res.status_code == 401


def test_verify_rejects_invalid_reference(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    headers = {"X-Internal-Key": VALID_KEY}
    img_bytes = create_jpeg_bytes(np.zeros((100, 100, 3), dtype=np.uint8))

    res = client.post(
        "/v1/verify",
        files={"image": ("test.jpg", img_bytes, "image/jpeg")},
        data={"reference": "invalid-b64-value"},
        headers=headers,
    )
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "INVALID_REFERENCE"


def test_verify_rejects_corrupt_image(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    headers = {"X-Internal-Key": VALID_KEY}
    ref_b64 = make_dummy_embedding_b64()

    res = client.post(
        "/v1/verify",
        files={"image": ("corrupt.jpg", b"garbage-data", "image/jpeg")},
        data={"reference": ref_b64},
        headers=headers,
    )
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "INVALID_IMAGE"


def test_verify_no_face_image_returns_measurements_without_similarity(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    headers = {"X-Internal-Key": VALID_KEY}
    model_loader.load_model()

    black_img = np.zeros((480, 640, 3), dtype=np.uint8)
    img_bytes = create_jpeg_bytes(black_img)
    ref_b64 = make_dummy_embedding_b64()

    res = client.post(
        "/v1/verify",
        files={"image": ("black.jpg", img_bytes, "image/jpeg")},
        data={"reference": ref_b64},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["faceCount"] == 0
    assert data["similarityRaw"] is None
    assert data["similarityPct"] is None
    assert data["calibrationStatus"] == "PROVISIONAL"
    assert "quality" in data

