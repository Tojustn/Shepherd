from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class XPSource(str, Enum):
    COMMIT = "commit"
    LEETCODE_SOLVE = "leetcode_solve"
    STREAK_BONUS = "streak_bonus"
    GOAL_COMPLETE = "goal_complete"


class XPEvent(Base):
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[XPSource] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(Integer)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="xp_events")
