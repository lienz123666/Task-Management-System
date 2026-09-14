from fastapi import APIRouter, HTTPException, status

from app.crud import user as crud_user
from app.deps import AdminUser, CurrentUser, DbSession
from app.schemas.user import UserCreate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(_: CurrentUser, db: DbSession) -> list[UserOut]:
    return [UserOut.model_validate(user) for user in crud_user.list_all(db)]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, _: AdminUser, db: DbSession) -> UserOut:
    try:
        user = crud_user.create(
            db, username=payload.username, password=payload.password, role=payload.role
        )
    except crud_user.UsernameTakenError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="用户名已被占用",
        ) from None
    return UserOut.model_validate(user)
