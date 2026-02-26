from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.goal import GoalOut


class StreakInfo(BaseModel):
    current: int
    longest: int
    last_activity_date: date | None


class UserOut(BaseModel):
    id: int
    github_id: str
    username: str
    email: str | None
    avatar_url: str | None
    xp: int
    level: int
    xp_current_level: int
    xp_next_level: int
    github_streak: StreakInfo
    leetcode_streak: StreakInfo
    recent_goals: list[GoalOut]
    pending_level_up: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
