from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.crud import user as crud_user
from app.database import SessionLocal
from app.models import Role, User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未认证或登录已失效",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise _unauthorized()

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise _unauthorized()

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _unauthorized() from None

    user = crud_user.get_by_id(db, user_id)
    if user is None:
        raise _unauthorized()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(current_user: CurrentUser) -> User:
    if current_user.role is not Role.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]
