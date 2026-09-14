from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from app.models import Task, TaskPriority, TaskStatus, utcnow

PRIORITY_ORDER = case(
    (Task.priority == TaskPriority.high, 0),
    (Task.priority == TaskPriority.medium, 1),
    (Task.priority == TaskPriority.low, 2),
    else_=3,
)


def get_by_id(db: Session, task_id: int, *, include_deleted: bool = False) -> Task | None:
    stmt = select(Task).where(Task.id == task_id)
    if not include_deleted:
        stmt = stmt.where(Task.deleted_at.is_(None))
    return db.scalar(stmt)


def _apply_filters(
    stmt: Select,
    *,
    status: TaskStatus | None,
    priority: TaskPriority | None,
    assignee_id: int | None,
    include_deleted: bool,
) -> Select:
    if not include_deleted:
        stmt = stmt.where(Task.deleted_at.is_(None))
    if status is not None:
        stmt = stmt.where(Task.status == status)
    if priority is not None:
        stmt = stmt.where(Task.priority == priority)
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    return stmt


def list_tasks(
    db: Session,
    *,
    status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    assignee_id: int | None = None,
    include_deleted: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Task], int]:
    filters = {
        "status": status,
        "priority": priority,
        "assignee_id": assignee_id,
        "include_deleted": include_deleted,
    }
    total = db.scalar(
        _apply_filters(select(func.count()).select_from(Task), **filters)
    ) or 0
    items = list(
        db.scalars(
            _apply_filters(select(Task), **filters)
            .order_by(PRIORITY_ORDER, Task.created_at.desc(), Task.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return items, total


def stats(db: Session) -> dict[str, int]:
    counts = {status.value: 0 for status in TaskStatus}
    rows = db.execute(
        select(Task.status, func.count())
        .where(Task.deleted_at.is_(None))
        .group_by(Task.status)
    )
    for status, count in rows:
        counts[status.value] = count
    return {
        "total": sum(counts.values()),
        "todo": counts[TaskStatus.todo.value],
        "doing": counts[TaskStatus.doing.value],
        "done": counts[TaskStatus.done.value],
    }


def create(
    db: Session,
    *,
    title: str,
    description: str | None,
    assignee_id: int,
    priority: TaskPriority,
    status: TaskStatus,
) -> Task:
    now = utcnow()
    task = Task(
        title=title,
        description=description,
        assignee_id=assignee_id,
        priority=priority,
        status=status,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update(db: Session, task: Task, fields: dict) -> Task:
    for key, value in fields.items():
        setattr(task, key, value)
    task.updated_at = utcnow()
    db.commit()
    db.refresh(task)
    return task


def soft_delete(db: Session, task: Task) -> None:
    task.deleted_at = utcnow()
    task.updated_at = task.deleted_at
    db.commit()
