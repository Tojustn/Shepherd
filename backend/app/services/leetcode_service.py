# app/services/leetcode.py
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leetcode import LeetCodeProblem, LeetCodeSolve
from app.models.streak import StreakType
from app.models.user import User
from app.schemas.leetcode import LeetCodeSolveCreate, LeetCodeSolveUpdate
from app.services.xp_service import award_xp, XPSource
from app.services.streak_service import update_streak


async def log_solve(
    db: AsyncSession,
    user: User,
    payload: LeetCodeSolveCreate,
) -> tuple[LeetCodeSolve, int]:
    result = await db.execute(
        select(LeetCodeProblem).where(LeetCodeProblem.leetcode_id == payload.leetcode_id)
    )
    problem = result.scalar_one_or_none()

    if not problem:
        problem = LeetCodeProblem(
            leetcode_id=payload.leetcode_id,
            title=payload.title,
            slug=payload.slug,
            difficulty=payload.difficulty,
            topics=payload.topics,
        )
        db.add(problem)
        await db.flush()

    existing = await db.execute(
        select(LeetCodeSolve).where(
            LeetCodeSolve.user_id == user.id,
            LeetCodeSolve.problem_id == problem.id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"You have already logged a solve for {problem.title}")

    solve = LeetCodeSolve(
        user_id=user.id,
        problem_id=problem.id,
        notes=payload.notes,
        code=payload.code,
        language=payload.language,
        time_complexity=payload.time_complexity,
        space_complexity=payload.space_complexity,
    )
    db.add(solve)
    await db.flush()

    xp_awarded = await award_xp(
        db,
        user,
        XPSource.LEETCODE_SOLVE,
        meta={"difficulty": payload.difficulty},
    )

    await update_streak(db, user, StreakType.LEETCODE)

    result = await db.execute(
        select(LeetCodeSolve)
        .where(LeetCodeSolve.id == solve.id)
        .options(selectinload(LeetCodeSolve.problem))
    )
    solve = result.scalar_one()
    return solve, xp_awarded


async def update_solve(
    db: AsyncSession,
    user: User,
    solve_id: int,
    payload: LeetCodeSolveUpdate,
) -> LeetCodeSolve:
    result = await db.execute(
        select(LeetCodeSolve)
        .where(LeetCodeSolve.id == solve_id, LeetCodeSolve.user_id == user.id)
        .options(selectinload(LeetCodeSolve.problem))
    )
    solve = result.scalar_one_or_none()
    if not solve:
        raise ValueError("Solve not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(solve, field, value)

    return solve


async def delete_solve(
    db: AsyncSession,
    user: User,
    solve_id: int,
) -> None:
    result = await db.execute(
        select(LeetCodeSolve).where(LeetCodeSolve.id == solve_id, LeetCodeSolve.user_id == user.id)
    )
    solve = result.scalar_one_or_none()
    if not solve:
        raise ValueError("Solve not found")

    await db.delete(solve)


async def get_stats(
    db: AsyncSession,
    user: User,
) -> dict:
    result = await db.execute(
        select(LeetCodeSolve)
        .where(LeetCodeSolve.user_id == user.id)
        .options(selectinload(LeetCodeSolve.problem))
    )
    solves = result.scalars().all()

    total = len(solves)
    difficulty_breakdown = {"easy": 0, "medium": 0, "hard": 0}
    topic_breakdown: dict[str, int] = {}

    for solve in solves:
        diff = solve.problem.difficulty.lower()
        if diff in difficulty_breakdown:
            difficulty_breakdown[diff] += 1
        for topic in solve.problem.topics:
            topic_breakdown[topic] = topic_breakdown.get(topic, 0) + 1

    top_topics = sorted(topic_breakdown.items(), key=lambda x: x[1], reverse=True)[:10]
    weak_topics = sorted(topic_breakdown.items(), key=lambda x: x[1])[:5]

    return {
        "total": total,
        "difficulty_breakdown": difficulty_breakdown,
        "topic_breakdown": topic_breakdown,
        "top_topics": [{"topic": t, "count": c} for t, c in top_topics],
        "weak_topics": [{"topic": t, "count": c} for t, c in weak_topics],
    }


async def get_solve(
    db: AsyncSession,
    user: User,
    solve_id: int,
) -> LeetCodeSolve:
    result = await db.execute(
        select(LeetCodeSolve)
        .where(LeetCodeSolve.id == solve_id, LeetCodeSolve.user_id == user.id)
        .options(selectinload(LeetCodeSolve.problem))
    )
    solve = result.scalar_one_or_none()
    if not solve:
        raise ValueError("Solve not found")
    return solve