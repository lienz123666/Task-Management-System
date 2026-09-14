from fastapi.testclient import TestClient


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_user(client: TestClient, admin_token: str, username: str, role: str = "member") -> dict:
    created = client.post(
        "/api/users",
        json={"username": username, "password": f"{username}-pass", "role": role},
        headers=auth(admin_token),
    )
    assert created.status_code == 201, created.text
    login = client.post(
        "/api/auth/login",
        json={"username": username, "password": f"{username}-pass"},
    )
    assert login.status_code == 200, login.text
    return {"id": created.json()["id"], "token": login.json()["access_token"], "username": username}


def create_task(client: TestClient, token: str, **overrides) -> object:
    me = client.get("/api/auth/me", headers=auth(token))
    body = {
        "title": "写周报",
        "description": "本周进展",
        "assignee": me.json()["id"],
        "priority": "high",
    }
    body.update(overrides)
    return client.post("/api/tasks", json=body, headers=auth(token))


def test_create_task_requires_login(client: TestClient) -> None:
    response = client.post(
        "/api/tasks",
        json={"title": "任务", "assignee": 1, "priority": "low"},
    )
    assert response.status_code == 401


def test_create_task_defaults_status_todo(client: TestClient, admin_token: str) -> None:
    response = create_task(client, admin_token, description=None)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "todo"
    assert body["priority"] == "high"
    assert body["title"] == "写周报"
    assert body["assignee_username"] == "admin"
    assert body["deleted_at"] is None
    assert body["created_at"] == body["updated_at"]
    assert "password_hash" not in body


def test_create_task_ignores_client_ids_and_timestamps(
    client: TestClient, admin_token: str
) -> None:
    me = client.get("/api/auth/me", headers=auth(admin_token)).json()
    response = client.post(
        "/api/tasks",
        json={
            "id": 999,
            "title": "客户端指定无效",
            "assignee": me["id"],
            "priority": "low",
            "created_at": "2000-01-01T00:00:00Z",
            "updated_at": "2000-01-01T00:00:00Z",
            "deleted_at": "2000-01-01T00:00:00Z",
        },
        headers=auth(admin_token),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] != 999
    assert not body["created_at"].startswith("2000-01-01")
    assert body["deleted_at"] is None


def test_create_requires_priority_and_existing_assignee(
    client: TestClient, admin_token: str
) -> None:
    me = client.get("/api/auth/me", headers=auth(admin_token)).json()
    missing_priority = client.post(
        "/api/tasks",
        json={"title": "无优先级", "assignee": me["id"]},
        headers=auth(admin_token),
    )
    assert missing_priority.status_code == 422

    missing_user = create_task(client, admin_token, assignee=99999)
    assert missing_user.status_code == 422
    assert missing_user.json()["detail"] == "负责人不存在"


def test_create_title_validation(client: TestClient, admin_token: str) -> None:
    assert create_task(client, admin_token, title="   ").status_code == 422
    assert create_task(client, admin_token, title="测" * 201).status_code == 422
    ok = create_task(client, admin_token, title="测" * 200)
    assert ok.status_code == 201
    assert len(ok.json()["title"]) == 200


def test_member_can_create_for_others_and_view_all(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    bob = create_user(client, admin_token, "bob")
    created = create_task(client, alice["token"], assignee=bob["id"], title="给 Bob 的活")
    assert created.status_code == 201
    assert created.json()["assignee_id"] == bob["id"]

    viewed = client.get(f"/api/tasks/{created.json()['id']}", headers=auth(alice["token"]))
    assert viewed.status_code == 200
    assert viewed.json()["title"] == "给 Bob 的活"


def test_member_cannot_update_or_delete_others_task(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    bob = create_user(client, admin_token, "bob")
    task_id = create_task(client, bob["token"], title="Bob 的任务").json()["id"]

    patched = client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "篡改"},
        headers=auth(alice["token"]),
    )
    assert patched.status_code == 403

    deleted = client.delete(f"/api/tasks/{task_id}", headers=auth(alice["token"]))
    assert deleted.status_code == 403


def test_member_can_update_and_delete_own_task(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    task_id = create_task(client, alice["token"], title="我的任务").json()["id"]

    patched = client.patch(
        f"/api/tasks/{task_id}",
        json={"status": "done", "title": "已完成"},
        headers=auth(alice["token"]),
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "done"
    assert patched.json()["title"] == "已完成"
    assert patched.json()["updated_at"] >= patched.json()["created_at"]

    deleted = client.delete(f"/api/tasks/{task_id}", headers=auth(alice["token"]))
    assert deleted.status_code == 204


def test_assignee_change_revokes_old_member_immediately(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    bob = create_user(client, admin_token, "bob")
    task_id = create_task(client, alice["token"], title="交接").json()["id"]

    changed = client.patch(
        f"/api/tasks/{task_id}",
        json={"assignee": bob["id"]},
        headers=auth(alice["token"]),
    )
    assert changed.status_code == 200
    assert changed.json()["assignee_id"] == bob["id"]

    denied = client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "还想改"},
        headers=auth(alice["token"]),
    )
    assert denied.status_code == 403

    allowed = client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "Bob 接手"},
        headers=auth(bob["token"]),
    )
    assert allowed.status_code == 200
    assert allowed.json()["title"] == "Bob 接手"


def test_admin_can_update_any_task(client: TestClient, admin_token: str) -> None:
    alice = create_user(client, admin_token, "alice")
    task_id = create_task(client, alice["token"], title="成员任务").json()["id"]
    updated = client.put(
        f"/api/tasks/{task_id}",
        json={
            "title": "管理员改了",
            "assignee": alice["id"],
            "status": "doing",
            "priority": "low",
        },
        headers=auth(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "管理员改了"
    assert updated.json()["description"] is None
    assert updated.json()["status"] == "doing"


def test_put_requires_full_fields_and_allows_status_rollback(
    client: TestClient, admin_token: str
) -> None:
    task_id = create_task(client, admin_token, title="全量").json()["id"]
    incomplete = client.put(
        f"/api/tasks/{task_id}",
        json={"title": "缺字段"},
        headers=auth(admin_token),
    )
    assert incomplete.status_code == 422

    me = client.get("/api/auth/me", headers=auth(admin_token)).json()
    rolled = client.put(
        f"/api/tasks/{task_id}",
        json={
            "title": "回退",
            "description": "仍可改回 todo",
            "assignee": me["id"],
            "status": "done",
            "priority": "medium",
        },
        headers=auth(admin_token),
    )
    assert rolled.status_code == 200
    again = client.put(
        f"/api/tasks/{task_id}",
        json={
            "title": "回退",
            "assignee": me["id"],
            "status": "todo",
            "priority": "medium",
        },
        headers=auth(admin_token),
    )
    assert again.status_code == 200
    assert again.json()["status"] == "todo"
    assert again.json()["description"] is None


def test_soft_delete_hides_from_member_but_admin_can_get(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    task_id = create_task(client, alice["token"], title="待删").json()["id"]
    assert client.delete(f"/api/tasks/{task_id}", headers=auth(alice["token"])).status_code == 204

    assert client.get(f"/api/tasks/{task_id}", headers=auth(alice["token"])).status_code == 404
    admin_view = client.get(f"/api/tasks/{task_id}", headers=auth(admin_token))
    assert admin_view.status_code == 200
    assert admin_view.json()["deleted_at"] is not None


def test_mutate_deleted_task_is_404(client: TestClient, admin_token: str) -> None:
    task_id = create_task(client, admin_token, title="删后不可改").json()["id"]
    assert client.delete(f"/api/tasks/{task_id}", headers=auth(admin_token)).status_code == 204

    me = client.get("/api/auth/me", headers=auth(admin_token)).json()
    assert (
        client.put(
            f"/api/tasks/{task_id}",
            json={
                "title": "复活",
                "assignee": me["id"],
                "status": "todo",
                "priority": "low",
            },
            headers=auth(admin_token),
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/tasks/{task_id}",
            json={"title": "复活"},
            headers=auth(admin_token),
        ).status_code
        == 404
    )
    assert client.delete(f"/api/tasks/{task_id}", headers=auth(admin_token)).status_code == 404


def test_unknown_task_is_404(client: TestClient, admin_token: str) -> None:
    assert client.get("/api/tasks/99999", headers=auth(admin_token)).status_code == 404
    assert (
        client.patch("/api/tasks/99999", json={"title": "x"}, headers=auth(admin_token)).status_code
        == 404
    )
