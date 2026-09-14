from datetime import timedelta
from typing import Any

import bcrypt
import jwt

from app.config import get_settings
from app.models import utcnow

BCRYPT_MAX_BYTES = 72


def _to_bcrypt_bytes(password: str) -> bytes:
    # bcrypt 只接受 72 字节以内的口令，超长部分由算法忽略，这里显式截断避免抛错
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bcrypt_bytes(password), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bcrypt_bytes(password), password_hash.encode())
    except ValueError:
        return False


def access_token_lifetime() -> timedelta:
    return timedelta(hours=get_settings().jwt_expire_hours)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    issued_at = utcnow()
    payload = {
        "sub": str(user_id),
        "iat": issued_at,
        "exp": issued_at + access_token_lifetime(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
