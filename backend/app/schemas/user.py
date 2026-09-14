from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import Role


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: Role
    created_at: datetime
