from app.crud import user as crud_user
from app.database import SessionLocal
from app.models import Role


def test_lifespan_creates_initial_admin(client) -> None:
    with SessionLocal() as db:
        admin = crud_user.get_by_username(db, "admin")
        assert admin is not None
        assert admin.role is Role.admin


def test_ensure_initial_admin_is_idempotent(client) -> None:
    with SessionLocal() as db:
        first = crud_user.ensure_initial_admin(db, username="admin", password="admin123")
        second = crud_user.ensure_initial_admin(db, username="admin", password="other")
    assert first is None
    assert second is None

    with SessionLocal() as db:
        admins = [user for user in crud_user.list_all(db) if user.role is Role.admin]
        assert len(admins) == 1
        assert admins[0].username == "admin"
