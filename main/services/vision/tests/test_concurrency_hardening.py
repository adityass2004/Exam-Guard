import asyncio
import io
import time
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.core.metrics import metrics
from app.core.concurrency import concurrency_manager
from app.core.warmup import run_warmup
from app.core.model_loader import model_loader

client = TestClient(app)
VALID_KEY = "test_internal_key_for_unit_tests"


def create_jpeg_bytes(width: int = 100, height: int = 100) -> bytes:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def test_diagnostics_reports_hardening_metrics(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    response = client.get("/v1/diagnostics", headers={"X-Internal-Key": VALID_KEY})
    assert response.status_code == 200
    data = response.json()

    assert "totalRequests" in data
    assert "errorCounts" in data
    assert "latency" in data
    assert "p50Ms" in data["latency"]
    assert "p95Ms" in data["latency"]
    assert "sampleCount" in data["latency"]
    assert "uptimeSeconds" in data
    assert data["uptimeSeconds"] >= 0.0


def test_limits_rejects_decompression_bomb(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    monkeypatch.setattr(settings, "VISION_MAX_IMAGE_EDGE", 500)

    # Image with edge 600 > 500
    oversized_edge = create_jpeg_bytes(width=600, height=100)
    response = client.post(
        "/v1/quality",
        headers={"X-Internal-Key": VALID_KEY},
        files={"image": ("test.jpg", io.BytesIO(oversized_edge), "image/jpeg")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"
    assert "exceeds maximum allowed edge" in response.json()["error"]["message"]


def test_limits_rejects_pixel_cap(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    monkeypatch.setattr(settings, "VISION_MAX_IMAGE_PIXELS", 50_000)

    # 300 x 300 = 90,000 pixels > 50,000
    oversized_pixels = create_jpeg_bytes(width=300, height=300)
    response = client.post(
        "/v1/quality",
        headers={"X-Internal-Key": VALID_KEY},
        files={"image": ("test.jpg", io.BytesIO(oversized_pixels), "image/jpeg")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE"
    assert "decompression bomb protection" in response.json()["error"]["message"]


@pytest.mark.anyio
async def test_concurrency_saturation_returns_busy(monkeypatch):
    # Configure concurrency limit = 1 and queue timeout = 50ms
    test_cm = concurrency_manager
    test_cm.max_concurrency = 1
    test_cm.queue_timeout_sec = 0.05
    test_cm._semaphore = asyncio.Semaphore(1)

    # Acquire the single available slot
    async with test_cm.acquire():
        # Attempt to acquire again from a concurrent task -> should timeout and raise 503 BUSY
        with pytest.raises(Exception) as exc_info:
            async with test_cm.acquire():
                pass

        assert "BUSY" in str(exc_info.value.detail)
        assert exc_info.value.status_code == 503
        assert exc_info.value.headers.get("Retry-After") == "1"


def test_warmup_runs_safely():
    # Calling warmup when model is not loaded should safely return without exception
    run_warmup()
    # Calling with model loaded if ready
    if model_loader.is_loaded():
        run_warmup()
        assert metrics.warmup_duration_ms is not None
        assert metrics.warmup_duration_ms > 0

