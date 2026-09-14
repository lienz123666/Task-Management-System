"""测试入口：在导入应用之前切到 SQLite，避免连上开发用 PostgreSQL。"""

import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-only-jwt-secret"
os.environ["JWT_EXPIRE_HOURS"] = "24"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin123"

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def settings():
    return get_settings()


@pytest.fixture
def client() -> Iterator[TestClient]:
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def admin_token(client: TestClient) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]
