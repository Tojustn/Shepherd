from datetime import datetime

from pydantic import BaseModel

from app.models.goal import GoalPeriod, GoalType


class GoalCreate(BaseModel):
    type: GoalType
    period: GoalPeriod
    target: int
    label: str


class GoalOut(GoalCreate):
    id: int
    user_id: int
    current: float
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
