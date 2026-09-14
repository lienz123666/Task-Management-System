from fastapi.testclient import TestClient


def test_login_success(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 24 * 3600
    assert isinstance(body["access_token"], str) and body["access_token"]


def test_login_wrong_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


def test_login_unknown_user(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "nobody", "password": "admin123"},
    )
    assert response.status_code == 401


def test_login_missing_field_is_422(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "admin"})
    assert response.status_code == 422


def test_me_without_token(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_with_forged_token(client: TestClient) -> None:
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401


def test_me_with_valid_token(client: TestClient, admin_token: str) -> None:
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "admin"
    assert body["role"] == "admin"
    assert "id" in body
    assert "created_at" in body
    assert "password_hash" not in body
    assert "password" not in body
