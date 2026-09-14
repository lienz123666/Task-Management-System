from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Task
from tests.test_tasks import auth, create_task, create_user


def _set_created_at(task_id: int, created_at: datetime) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        assert task is not None
        task.created_at = created_at
        task.updated_at = created_at
        db.commit()


def test_list_and_stats_require_login(client: TestClient) -> None:
    assert client.get("/api/tasks").status_code == 401
    assert client.get("/api/stats").status_code == 401


def test_list_default_pagination_and_excludes_deleted(
    client: TestClient, admin_token: str
) -> None:
    first = create_task(client, admin_token, title="可见").json()
    deleted = create_task(client, admin_token, title="已删").json()
    client.delete(f"/api/tasks/{deleted['id']}", headers=auth(admin_token))

    listed = client.get("/api/tasks", headers=auth(admin_token))
    assert listed.status_code == 200
    body = listed.json()
    assert body["page"] == 1
    assert body["page_size"] == 20
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [first["id"]]
    assert all(item["deleted_at"] is None for item in body["items"])


def test_page_size_over_100_is_422(client: TestClient, admin_token: str) -> None:
    response = client.get("/api/tasks?page_size=101", headers=auth(admin_token))
    assert response.status_code == 422


def test_page_starts_at_one(client: TestClient, admin_token: str) -> None:
    assert client.get("/api/tasks?page=0", headers=auth(admin_token)).status_code == 422


def test_filters_are_exact_and_combined_with_and(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    create_task(
        client, admin_token, title="a-todo-high", status="todo", priority="high", assignee=alice["id"]
    )
    create_task(
        client, admin_token, title="b-doing-high", status="doing", priority="high", assignee=alice["id"]
    )
    create_task(
        client, admin_token, title="c-todo-low", status="todo", priority="low"
    )

    by_status = client.get("/api/tasks?status=todo", headers=auth(admin_token)).json()
    assert {item["title"] for item in by_status["items"]} == {"a-todo-high", "c-todo-low"}

    by_priority = client.get("/api/tasks?priority=high", headers=auth(admin_token)).json()
    assert {item["title"] for item in by_priority["items"]} == {"a-todo-high", "b-doing-high"}

    by_assignee = client.get(
        f"/api/tasks?assignee={alice['id']}", headers=auth(admin_token)
    ).json()
    assert {item["title"] for item in by_assignee["items"]} == {"a-todo-high", "b-doing-high"}

    combined = client.get(
        f"/api/tasks?status=todo&priority=high&assignee={alice['id']}",
        headers=auth(admin_token),
    ).json()
    assert [item["title"] for item in combined["items"]] == ["a-todo-high"]
    assert combined["total"] == 1


def test_invalid_filter_is_422(client: TestClient, admin_token: str) -> None:
    assert client.get("/api/tasks?status=blocked", headers=auth(admin_token)).status_code == 422
    assert client.get("/api/tasks?priority=urgent", headers=auth(admin_token)).status_code == 422


def test_sorts_by_priority_then_created_at_desc(
    client: TestClient, admin_token: str
) -> None:
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    specs = [
        ("low-old", "low", base),
        ("high-old", "high", base + timedelta(hours=1)),
        ("medium-old", "medium", base + timedelta(hours=2)),
        ("low-new", "low", base + timedelta(hours=3)),
        ("high-new", "high", base + timedelta(hours=4)),
        ("medium-new", "medium", base + timedelta(hours=5)),
    ]
    for title, priority, created_at in specs:
        task_id = create_task(client, admin_token, title=title, priority=priority).json()["id"]
        _set_created_at(task_id, created_at)

    listed = client.get("/api/tasks", headers=auth(admin_token)).json()
    assert [item["title"] for item in listed["items"]] == [
        "high-new",
        "high-old",
        "medium-new",
        "medium-old",
        "low-new",
        "low-old",
    ]


def test_pagination_slices_sorted_results(client: TestClient, admin_token: str) -> None:
    for index in range(3):
        create_task(client, admin_token, title=f"p{index}", priority="low")

    page1 = client.get("/api/tasks?page=1&page_size=2", headers=auth(admin_token)).json()
    page2 = client.get("/api/tasks?page=2&page_size=2", headers=auth(admin_token)).json()
    assert page1["total"] == page2["total"] == 3
    assert page1["page"] == 1 and page1["page_size"] == 2
    assert len(page1["items"]) == 2
    assert len(page2["items"]) == 1
    assert {item["id"] for item in page1["items"]}.isdisjoint({item["id"] for item in page2["items"]})


def test_member_include_deleted_is_403(client: TestClient, admin_token: str) -> None:
    alice = create_user(client, admin_token, "alice")
    response = client.get(
        "/api/tasks?include_deleted=true",
        headers=auth(alice["token"]),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "仅管理员可查看已删除任务"


def test_admin_include_deleted_lists_soft_deleted(
    client: TestClient, admin_token: str
) -> None:
    keep = create_task(client, admin_token, title="keep").json()
    gone = create_task(client, admin_token, title="gone").json()
    client.delete(f"/api/tasks/{gone['id']}", headers=auth(admin_token))

    listed = client.get("/api/tasks?include_deleted=true", headers=auth(admin_token)).json()
    ids = {item["id"] for item in listed["items"]}
    assert keep["id"] in ids
    assert gone["id"] in ids
    deleted = next(item for item in listed["items"] if item["id"] == gone["id"])
    assert deleted["deleted_at"] is not None


def test_stats_exclude_deleted_and_ignore_list_filters(
    client: TestClient, admin_token: str
) -> None:
    alice = create_user(client, admin_token, "alice")
    create_task(client, admin_token, title="t1", status="todo", priority="high")
    create_task(client, admin_token, title="t2", status="doing", priority="low", assignee=alice["id"])
    done = create_task(client, admin_token, title="t3", status="done", priority="medium").json()
    gone = create_task(client, admin_token, title="t4", status="todo", priority="high").json()
    client.delete(f"/api/tasks/{gone['id']}", headers=auth(admin_token))

    stats = client.get("/api/stats", headers=auth(admin_token)).json()
    assert stats == {"total": 3, "todo": 1, "doing": 1, "done": 1}

    filtered_stats = client.get(
        f"/api/stats?status=done&include_deleted=true&assignee={alice['id']}",
        headers=auth(admin_token),
    ).json()
    assert filtered_stats == stats

    listed = client.get(
        f"/api/tasks?status=done&include_deleted=true",
        headers=auth(admin_token),
    ).json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == done["id"]
