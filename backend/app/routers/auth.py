from fastapi import APIRouter, HTTPException, status

from app.crud import user as crud_user
from app.deps import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserOut
from app.security import access_token_lifetime, create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = crud_user.get_by_username(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=int(access_token_lifetime().total_seconds()),
    )


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)
