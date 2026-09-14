from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import Role, User
from app.security import hash_password


class UsernameTakenError(Exception):
    pass


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def list_all(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.username)))


def admin_exists(db: Session) -> bool:
    return bool(db.scalar(select(exists().where(User.role == Role.admin))))


def create(db: Session, *, username: str, password: str, role: Role) -> User:
    if get_by_username(db, username) is not None:
        raise UsernameTakenError(username)

    user = User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def ensure_initial_admin(db: Session, *, username: str, password: str) -> User | None:
    """库中尚无任何管理员时，用环境变量引导创建唯一初始管理员。"""
    if admin_exists(db):
        return None
    return create(db, username=username, password=password, role=Role.admin)
