from app.models import Role, Task, User


def can_mutate_task(user: User, task: Task) -> bool:
    return user.role is Role.admin or task.assignee_id == user.id
