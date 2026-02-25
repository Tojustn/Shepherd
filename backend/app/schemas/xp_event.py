from datetime import datetime

from pydantic import BaseModel

from app.models.xp_event import XPSource


class XPEventOut(BaseModel):
    id: int
    source: XPSource
    amount: int
    meta: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
