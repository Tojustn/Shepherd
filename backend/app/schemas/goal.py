from datetime import date, datetime

from pydantic import BaseModel

from app.models.goal import GoalType


class GoalCreate(BaseModel):
    label: str
    target: int = 1  # 1 = checkbox, >1 = counter


class GoalOut(BaseModel):
    id: int
    user_id: int
    type: GoalType
    target: int
    current: float
    label: str
    active: bool
    goal_date: date | None
    completed: bool
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}