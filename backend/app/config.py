from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://taskuser:taskpass@db:5432/taskdb"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    admin_username: str = "admin"
    admin_password: str = "admin123"

    api_prefix: str = "/api"


@lru_cache
def get_settings() -> Settings:
    return Settings()
