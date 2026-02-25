from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class JobStatus(str, Enum):
    WISHLIST = "wishlist"
    APPLIED = "applied"
    PHONE_SCREEN = "phone_screen"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(256))
    status: Mapped[JobStatus] = mapped_column(String(32), default=JobStatus.APPLIED)
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    follow_up_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    applied_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship("User", back_populates="jobs")
