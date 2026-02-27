# app/models/leetcode.py
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User


class LeetCodeProblem(Base):
    __tablename__ = "leetcode_problems"

    id: Mapped[int] = mapped_column(primary_key=True)
    leetcode_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    slug: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    difficulty: Mapped[str] = mapped_column(String(16))  # easy, medium, hard
    topics: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    solves: Mapped[list["LeetCodeSolve"]] = relationship("LeetCodeSolve", back_populates="problem")


class LeetCodeSolve(Base):
    __tablename__ = "leetcode_solves"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("leetcode_problems.id", ondelete="CASCADE"), index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    solved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="leetcode_solves")
    problem: Mapped["LeetCodeProblem"] = relationship("LeetCodeProblem", back_populates="solves")
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)  # python, javascript, etc.
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_complexity: Mapped[str | None] = mapped_column(String(64), nullable=True)   # O(n), O(n^2) etc.
    space_complexity: Mapped[str | None] = mapped_column(String(64), nullable=True)