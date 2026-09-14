from app.models import Role, Task, User
from app.permissions import can_mutate_task


def _user(user_id: int, role: Role) -> User:
    return User(id=user_id, username=f"u{user_id}", password_hash="x", role=role)


def test_admin_can_mutate_any_task() -> None:
    admin = _user(1, Role.admin)
    task = Task(id=10, title="t", assignee_id=2, status="todo", priority="low")
    assert can_mutate_task(admin, task) is True


def test_member_can_only_mutate_own_task() -> None:
    member = _user(2, Role.member)
    own = Task(id=10, title="t", assignee_id=2, status="todo", priority="low")
    other = Task(id=11, title="t", assignee_id=3, status="todo", priority="low")
    assert can_mutate_task(member, own) is True
    assert can_mutate_task(member, other) is False
