from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import TaskPriority, TaskStatus


def _clean_title(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("标题不能为空")
    if len(stripped) > 200:
        raise ValueError("标题不能超过 200 个字符")
    return stripped


def _clean_description(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > 2000:
        raise ValueError("描述不能超过 2000 个字符")
    return stripped


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    assignee: int
    priority: TaskPriority
    status: TaskStatus = TaskStatus.todo

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return _clean_title(value)

    @field_validator("description")
    @classmethod
    def description_optional(cls, value: str | None) -> str | None:
        return _clean_description(value)


class TaskPut(BaseModel):
    """全量更新：可改字段均需提交；省略 description 视为清空。"""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    assignee: int
    status: TaskStatus
    priority: TaskPriority

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return _clean_title(value)

    @field_validator("description")
    @classmethod
    def description_optional(cls, value: str | None) -> str | None:
        return _clean_description(value)


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    assignee: int | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_title(value)

    @field_validator("description")
    @classmethod
    def description_optional(cls, value: str | None) -> str | None:
        return _clean_description(value)


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    assignee_id: int
    assignee_username: str
    status: TaskStatus
    priority: TaskPriority
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class TaskListOut(BaseModel):
    items: list[TaskOut]
    total: int
    page: int
    page_size: int


class AssigneeStat(BaseModel):
    user_id: int
    username: str
    count: int


class PriorityStats(BaseModel):
    high: int
    medium: int
    low: int


class StatsOut(BaseModel):
    total: int
    todo: int
    doing: int
    done: int
    priority: PriorityStats
    assignees: list[AssigneeStat]
