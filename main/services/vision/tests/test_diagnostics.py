from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
VALID_KEY = "test_internal_key_for_unit_tests"


def test_diagnostics_structure_and_truthfulness(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)
    response = client.get("/v1/diagnostics", headers={"X-Internal-Key": VALID_KEY})
    assert response.status_code == 200
    data = response.json()

    assert "versions" in data
    assert "python" in data["versions"]
    assert "fastapi" in data["versions"]
    assert "executionProviders" in data
    assert "modelState" in data
    assert data["modelState"] in (
        "NOT_INSTALLED",
        "NOT_FOUND",
        "DOWNLOADING_DISABLED",
        "LOADING",
        "READY",
        "FAILED",
    )
    assert data["calibrationStatus"] == "PROVISIONAL"
    assert "concurrency" in data
    assert "inFlight" in data["concurrency"]
    assert "limit" in data["concurrency"]

