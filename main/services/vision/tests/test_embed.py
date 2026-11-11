import cv2
import numpy as np
from fastapi.testclient import TestClient
from app.config import settings
from app.core.model_loader import model_loader
from app.main import app

client = TestClient(app)
VALID_KEY = "test_vision_internal_key"


def create_jpeg_bytes(img: np.ndarray) -> bytes:
    success, encoded = cv2.imencode(".jpg", img)
    assert success
    return encoded.tobytes()


def test_embed_requires_internal_key(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    img_bytes = create_jpeg_bytes(np.zeros((100, 100, 3), dtype=np.uint8))
    res = client.post(
        "/v1/embed",
        files={"image": ("test.jpg", img_bytes, "image/jpeg")},
    )
    assert res.status_code == 401


def test_embed_black_image_returns_no_embedding_honestly(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    headers = {"X-Internal-Key": VALID_KEY}
    model_loader.load_model()

    black_img = np.zeros((480, 640, 3), dtype=np.uint8)
    img_bytes = create_jpeg_bytes(black_img)

    res = client.post(
        "/v1/embed",
        files={"image": ("black.jpg", img_bytes, "image/jpeg")},
        data={"angle": "FRONT"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["faceCount"] == 0
    assert data["embedding"] is None
    assert "NO_FACE" in data["reasons"]


def test_embed_rejects_corrupt_image(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    headers = {"X-Internal-Key": VALID_KEY}
    res = client.post(
        "/v1/embed",
        files={"image": ("corrupt.jpg", b"bad-bytes-header", "image/jpeg")},
        headers=headers,
    )
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "INVALID_IMAGE"


def test_embed_model_unavailable_returns_503(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    monkeypatch.setattr(model_loader, "is_loaded", lambda: False)
    headers = {"X-Internal-Key": VALID_KEY}

    black_img = np.zeros((100, 100, 3), dtype=np.uint8)
    img_bytes = create_jpeg_bytes(black_img)

    res = client.post(
        "/v1/embed",
        files={"image": ("test.jpg", img_bytes, "image/jpeg")},
        headers=headers,
    )
    assert res.status_code == 503
    data = res.json()
    assert data["error"]["code"] == "MODEL_UNAVAILABLE"

