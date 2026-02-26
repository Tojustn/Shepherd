from datetime import datetime

from pydantic import BaseModel

from app.models.goal import GoalPeriod, GoalType


class GoalCreate(BaseModel):
    type: GoalType
    period: GoalPeriod
    target: int
    difficulty: int = 1  # 1–5 stars
    label: str

class GoalOut(GoalCreate):
    id: int
    user_id: int
    current: float
    active: bool
    completed: bool
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}