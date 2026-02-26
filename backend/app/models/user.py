from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.job import Job
    from app.models.goal import Goal
    from app.models.streak import Streak
    from app.models.xp_event import XPEvent


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    github_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_access_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    xp: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    level: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    pending_level_up: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    jobs: Mapped[list[Job]] = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    goals: Mapped[list[Goal]] = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    streaks: Mapped[list[Streak]] = relationship("Streak", back_populates="user", cascade="all, delete-orphan")
    xp_events: Mapped[list[XPEvent]] = relationship("XPEvent", back_populates="user", cascade="all, delete-orphan")
