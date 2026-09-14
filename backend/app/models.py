import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Role(str, enum.Enum):
    admin = "admin"
    member = "member"


class TaskStatus(str, enum.Enum):
    todo = "todo"
    doing = "doing"
    done = "done"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _enum_column(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        length=16,
        values_callable=lambda members: [m.value for m in members],
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(_enum_column(Role, "role_enum"), default=Role.member)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    tasks: Mapped[list["Task"]] = relationship(back_populates="assignee")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(2000), default=None)
    assignee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[TaskStatus] = mapped_column(
        _enum_column(TaskStatus, "task_status_enum"), default=TaskStatus.todo, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        _enum_column(TaskPriority, "task_priority_enum"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None, index=True
    )

    assignee: Mapped[User] = relationship(back_populates="tasks", lazy="joined")
