from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.goal import GoalType


class GoalCreate(BaseModel):
    label: str
    target: int = 1  # 1 = checkbox, >1 = counter
    difficulty: Annotated[int, Field(ge=1, le=5)] = 1


class GoalOut(BaseModel):
    id: int
    user_id: int
    type: GoalType
    target: int
    current: float
    label: str
    difficulty: int
    active: bool
    goal_date: date | None
    completed: bool
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}