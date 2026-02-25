from datetime import date

from pydantic import BaseModel

from app.models.streak import StreakType


class StreakOut(BaseModel):
    type: StreakType
    current: int
    longest: int
    last_activity_date: date | None

    model_config = {"from_attributes": True}
