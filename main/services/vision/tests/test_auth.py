import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
VALID_KEY = "test_internal_key_for_unit_tests"


@pytest.fixture(autouse=True)
def setup_test_key(monkeypatch):
    monkeypatch.setattr(settings, "VISION_INTERNAL_KEY", VALID_KEY)


def test_diagnostics_requires_internal_key():
    # Without header
    res = client.get("/v1/diagnostics")
    assert res.status_code == 401
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "BAD_INTERNAL_KEY"

    # With invalid header
    res2 = client.get("/v1/diagnostics", headers={"X-Internal-Key": "wrong_key"})
    assert res2.status_code == 401
    data2 = res2.json()
    assert data2["error"]["code"] == "BAD_INTERNAL_KEY"

    # With valid header
    res3 = client.get("/v1/diagnostics", headers={"X-Internal-Key": VALID_KEY})
    assert res3.status_code == 200


def test_verify_requires_internal_key():
    res = client.post("/v1/verify")
    assert res.status_code == 401

    res_auth = client.post("/v1/verify", headers={"X-Internal-Key": VALID_KEY})
    # Passes auth check, but rejected with 400 due to missing multipart body
    assert res_auth.status_code == 400

