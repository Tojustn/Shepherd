# app/models/leetcode.py
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
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
    topics: Mapped[list[str]] = mapped_column(JSON, default=list)

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
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    is_imported: Mapped[bool] = mapped_column(Boolean, default=False)


class LeetCodeReview(Base):
    """
    Per-user, per-problem spaced-repetition state (Leitner 5-box system).

    `box` (1-5) selects the review interval. A passing re-solve (confidence >= 3)
    promotes the problem one box; a failing one (confidence <= 2) drops it back to
    box 1. `next_review_at` is recomputed on every solve from the resulting box.
    """
    __tablename__ = "leetcode_reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "problem_id", name="uq_review_user_problem"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("leetcode_problems.id", ondelete="CASCADE"), index=True)
    box: Mapped[int] = mapped_column(Integer, default=1)  # 1-5
    next_review_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Graduated out of active review: passed again while already in the top box.
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    problem: Mapped["LeetCodeProblem"] = relationship("LeetCodeProblem")


class LeetCodeTodoList(Base):
    """
    A named study list (e.g. "Blind 75", "Company prep"). Todos with a null
    list_id live in the built-in Backlog pseudo-list.
    """
    __tablename__ = "leetcode_todo_lists"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_todolist_user_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LeetCodeTodo(Base):
    """
    A problem the user wants to solve (or re-solve). `done` is derived from
    solves at read time, never stored. One row per (user, problem); `position`
    orders it within its list.
    """
    __tablename__ = "leetcode_todos"
    __table_args__ = (
        UniqueConstraint("user_id", "problem_id", name="uq_todo_user_problem"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("leetcode_problems.id", ondelete="CASCADE"), index=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Null = the built-in Backlog.
    list_id: Mapped[int | None] = mapped_column(
        ForeignKey("leetcode_todo_lists.id", ondelete="CASCADE"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    problem: Mapped["LeetCodeProblem"] = relationship("LeetCodeProblem")