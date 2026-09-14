from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_does_not_require_login(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code != 401
    assert "WWW-Authenticate" not in response.headers
