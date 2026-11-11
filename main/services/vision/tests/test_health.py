from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint_no_auth():
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ("OK", "DEGRADED")
    assert "modelLoaded" in data
    assert isinstance(data["modelLoaded"], bool)

