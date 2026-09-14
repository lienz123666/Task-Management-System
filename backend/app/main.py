import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.exc import IntegrityError, OperationalError

from app.config import get_settings
from app.crud import user as crud_user
from app.database import Base, SessionLocal, engine
from app.routers import auth, health, users

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("app")

DB_CONNECT_ATTEMPTS = 10
DB_CONNECT_INTERVAL_SECONDS = 2


def _create_tables() -> None:
    """容器编排下数据库可能比后端晚几秒就绪，失败时重试而非直接退出。"""
    for attempt in range(1, DB_CONNECT_ATTEMPTS + 1):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError:
            if attempt == DB_CONNECT_ATTEMPTS:
                raise
            logger.warning("数据库未就绪，%s 秒后重试（%s/%s）", DB_CONNECT_INTERVAL_SECONDS, attempt, DB_CONNECT_ATTEMPTS)
            time.sleep(DB_CONNECT_INTERVAL_SECONDS)


def _bootstrap_admin() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        try:
            admin = crud_user.ensure_initial_admin(
                db, username=settings.admin_username, password=settings.admin_password
            )
        except crud_user.UsernameTakenError:
            db.rollback()
            logger.error(
                "无法引导初始管理员：用户名 %r 已被占用，请修改 ADMIN_USERNAME 后重启",
                settings.admin_username,
            )
            return
        except IntegrityError:
            db.rollback()
            logger.warning("初始管理员已由其他进程创建，跳过")
            return

    if admin is None:
        logger.info("系统已存在管理员，跳过初始管理员引导")
    else:
        logger.info("已创建初始管理员 %r", admin.username)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _create_tables()
    _bootstrap_admin()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="员工任务管理系统", version="0.1.0", lifespan=lifespan)

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(users.router, prefix=settings.api_prefix)
    return app


app = create_app()
