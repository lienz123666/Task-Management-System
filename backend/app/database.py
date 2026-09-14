from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


def create_db_engine(database_url: str | None = None) -> Engine:
    url = database_url or get_settings().database_url
    if url.startswith("sqlite"):
        # 内存库必须共用连接，否则每个 Session 都是空库；测试用。
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(url, pool_pre_ping=True)


engine = create_db_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
