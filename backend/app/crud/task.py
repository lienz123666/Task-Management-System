from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Task, TaskPriority, TaskStatus, utcnow


def get_by_id(db: Session, task_id: int, *, include_deleted: bool = False) -> Task | None:
    stmt = select(Task).where(Task.id == task_id)
    if not include_deleted:
        stmt = stmt.where(Task.deleted_at.is_(None))
    return db.scalar(stmt)


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
