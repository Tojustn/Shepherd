from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class GoalType(str, Enum):
    DAILY_COMMIT = "daily_commit"
    DAILY_LEETCODE = "daily_leetcode"
    CUSTOM = "custom"


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[GoalType] = mapped_column(String(32))
    target: Mapped[int] = mapped_column(Integer)
    current: Mapped[float] = mapped_column(Float, default=0)
    label: Mapped[str] = mapped_column(String(256))
    difficulty: Mapped[int] = mapped_column(Integer, default=1)  # 1-5 stars
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    goal_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # set for daily goals only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="goals")
