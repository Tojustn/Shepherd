from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class GoalType(str, Enum):
    COMMITS_DAILY = "commits_daily"
    COMMITS_WEEKLY = "commits_weekly"
    LEETCODE_DAILY = "leetcode_daily"
    LEETCODE_WEEKLY = "leetcode_weekly"
    STREAK_MAINTAIN = "streak_maintain"
    CUSTOM = "custom"


class GoalPeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[GoalType] = mapped_column(String(32))
    period: Mapped[GoalPeriod] = mapped_column(String(16))
    target: Mapped[int] = mapped_column(Integer)
    current: Mapped[float] = mapped_column(Float, default=0)
    label: Mapped[str] = mapped_column(String(256))
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="goals")
