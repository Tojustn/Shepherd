from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    github_id: str
    username: str
    email: str | None
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
