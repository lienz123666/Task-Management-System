from fastapi.testclient import TestClient


def _create_user(client: TestClient, token: str, **overrides) -> object:
    body = {"username": "alice", "password": "alice123", "role": "member"}
    body.update(overrides)
    return client.post(
        "/api/users",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )


def _login(client: TestClient, username: str, password: str) -> object:
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_list_users_requires_login(client: TestClient) -> None:
    assert client.get("/api/users").status_code == 401


def test_create_user_requires_login(client: TestClient) -> None:
    response = client.post(
        "/api/users",
        json={"username": "alice", "password": "alice123", "role": "member"},
    )
    assert response.status_code == 401


def test_admin_can_create_member_and_list_users(client: TestClient, admin_token: str) -> None:
    created = _create_user(client, admin_token)
    assert created.status_code == 201
    body = created.json()
    assert body["username"] == "alice"
    assert body["role"] == "member"
    assert "password" not in body
    assert "password_hash" not in body

    listed = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert listed.status_code == 200
    names = [item["username"] for item in listed.json()]
    assert names == ["admin", "alice"]
    assert all("password_hash" not in item for item in listed.json())


def test_created_member_can_login(client: TestClient, admin_token: str) -> None:
    _create_user(client, admin_token)
    login = _login(client, "alice", "alice123")
    assert login.status_code == 200

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == "alice"
    assert me.json()["role"] == "member"


def test_admin_can_create_another_admin(client: TestClient, admin_token: str) -> None:
    response = _create_user(client, admin_token, username="root", password="root123", role="admin")
    assert response.status_code == 201
    assert response.json()["role"] == "admin"


def test_member_cannot_create_user(client: TestClient, admin_token: str) -> None:
    _create_user(client, admin_token)
    member_token = _login(client, "alice", "alice123").json()["access_token"]

    response = _create_user(client, member_token, username="bob", password="bob123")
    assert response.status_code == 403
    assert response.json()["detail"] == "需要管理员权限"


def test_member_can_list_users(client: TestClient, admin_token: str) -> None:
    _create_user(client, admin_token)
    member_token = _login(client, "alice", "alice123").json()["access_token"]

    response = client.get("/api/users", headers={"Authorization": f"Bearer {member_token}"})
    assert response.status_code == 200
    assert {item["username"] for item in response.json()} == {"admin", "alice"}


def test_duplicate_username_is_422(client: TestClient, admin_token: str) -> None:
    assert _create_user(client, admin_token).status_code == 201
    again = _create_user(client, admin_token)
    assert again.status_code == 422
    assert again.json()["detail"] == "用户名已被占用"


def test_invalid_role_is_422(client: TestClient, admin_token: str) -> None:
    response = _create_user(client, admin_token, role="superuser")
    assert response.status_code == 422


def test_blank_username_is_422(client: TestClient, admin_token: str) -> None:
    response = _create_user(client, admin_token, username="   ")
    assert response.status_code == 422
