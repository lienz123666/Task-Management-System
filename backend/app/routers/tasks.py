from fastapi import APIRouter, HTTPException, status

from app.crud import task as crud_task
from app.crud import user as crud_user
from app.deps import CurrentUser, DbSession
from app.models import Role, Task, User
from app.permissions import can_mutate_task
from app.schemas.task import TaskCreate, TaskOut, TaskPatch, TaskPut

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _task_out(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        assignee_id=task.assignee_id,
        assignee_username=task.assignee.username,
        status=task.status,
        priority=task.priority,
        created_at=task.created_at,
        updated_at=task.updated_at,
        deleted_at=task.deleted_at,
    )


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改或删除该任务")


def _require_assignee(db: DbSession, assignee_id: int) -> User:
    user = crud_user.get_by_id(db, assignee_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="负责人不存在",
        )
    return user


def _get_active_task(db: DbSession, task_id: int) -> Task:
    task = crud_task.get_by_id(db, task_id)
    if task is None:
        raise _not_found()
    return task


def _require_mutate(user: User, task: Task) -> None:
    if not can_mutate_task(user, task):
        raise _forbidden()


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, _: CurrentUser, db: DbSession) -> TaskOut:
    _require_assignee(db, payload.assignee)
    task = crud_task.create(
        db,
        title=payload.title,
        description=payload.description,
        assignee_id=payload.assignee,
        priority=payload.priority,
        status=payload.status,
    )
    return _task_out(task)


@router.get("/{task_id}", response_model=TaskOut)
def read_task(task_id: int, current_user: CurrentUser, db: DbSession) -> TaskOut:
    include_deleted = current_user.role is Role.admin
    task = crud_task.get_by_id(db, task_id, include_deleted=include_deleted)
    if task is None:
        raise _not_found()
    if task.deleted_at is not None and current_user.role is not Role.admin:
        raise _not_found()
    return _task_out(task)


@router.put("/{task_id}", response_model=TaskOut)
def replace_task(
    task_id: int, payload: TaskPut, current_user: CurrentUser, db: DbSession
) -> TaskOut:
    task = _get_active_task(db, task_id)
    _require_mutate(current_user, task)
    _require_assignee(db, payload.assignee)
    task = crud_task.update(
        db,
        task,
        {
            "title": payload.title,
            "description": payload.description,
            "assignee_id": payload.assignee,
            "status": payload.status,
            "priority": payload.priority,
        },
    )
    return _task_out(task)


@router.patch("/{task_id}", response_model=TaskOut)
def patch_task(
    task_id: int, payload: TaskPatch, current_user: CurrentUser, db: DbSession
) -> TaskOut:
    task = _get_active_task(db, task_id)
    _require_mutate(current_user, task)
    fields = payload.model_dump(exclude_unset=True)
    if "title" in fields and not fields["title"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="标题不能为空",
        )
    if "assignee" in fields:
        if fields["assignee"] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="负责人不存在",
            )
        _require_assignee(db, fields["assignee"])
        fields["assignee_id"] = fields.pop("assignee")
    if not fields:
        return _task_out(task)
    task = crud_task.update(db, task, fields)
    return _task_out(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, current_user: CurrentUser, db: DbSession) -> None:
    task = _get_active_task(db, task_id)
    _require_mutate(current_user, task)
    crud_task.soft_delete(db, task)
