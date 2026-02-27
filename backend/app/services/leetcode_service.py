# app/services/leetcode.py
import httpx
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leetcode import LeetCodeProblem, LeetCodeSolve
from app.models.streak import StreakType
from app.models.user import User
from app.schemas.leetcode import LeetCodeSolveCreate, LeetCodeSolveUpdate
from app.services.xp_service import award_xp, XPSource
from app.services.streak_service import update_streak
from app.services.cache import cache_set, cache_get


_LC_SEARCH_QUERY = """
query problemSearch($filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(
    categorySlug: ""
    limit: 10
    skip: 0
    filters: $filters
  ) {
    questions: data {
      questionFrontendId
      title
      titleSlug
      difficulty
      topicTags { name }
    }
  }
}
"""


_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


async def search_problems(query: str) -> list[dict]:
    cache_key = f"leetcode:search:{query.lower().strip()}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        # Acquire CSRF cookie by hitting the problemset page first
        await client.get(
            "https://leetcode.com/problemset/",
            headers={
                "User-Agent": _UA,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
        )
        csrf = client.cookies.get("csrftoken", "")

        resp = await client.post(
            "https://leetcode.com/graphql/",
            json={
                "query": _LC_SEARCH_QUERY,
                "variables": {"filters": {"searchKeywords": query}},
            },
            headers={
                "Content-Type": "application/json",
                "User-Agent": _UA,
                "Referer": "https://leetcode.com/problemset/",
                "Origin": "https://leetcode.com",
                "x-csrftoken": csrf,
            },
        )
        resp.raise_for_status()
        questions = (
            resp.json()
            .get("data", {})
            .get("problemsetQuestionList", {})
            .get("questions", []) or []
        )
        result = [
            {
                "leetcode_id": int(q["questionFrontendId"]),
                "title": q["title"],
                "slug": q["titleSlug"],
                "difficulty": q["difficulty"].lower(),
                "topics": [t["name"] for t in q.get("topicTags", [])],
            }
            for q in questions
        ]

    await cache_set(cache_key, result, ttl=60 * 60 * 24)  # 24 hours
    return result

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

    count_result = await db.execute(
        select(func.count()).where(
            LeetCodeSolve.user_id == user.id,
            LeetCodeSolve.problem_id == problem.id,
        )
    )
    is_first_solve = count_result.scalar() == 0

    solve = LeetCodeSolve(
        user_id=user.id,
        problem_id=problem.id,
        notes=payload.notes,
        code=payload.code,
        language=payload.language,
        time_complexity=payload.time_complexity,
        space_complexity=payload.space_complexity,
        confidence=payload.confidence,
    )
    db.add(solve)
    await db.flush()

    if is_first_solve:
        xp_awarded = await award_xp(
            db,
            user,
            XPSource.LEETCODE_SOLVE,
            meta={"difficulty": payload.difficulty},
        )
        await update_streak(db, user, StreakType.LEETCODE)
    else:
        xp_awarded = 0

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

    difficulty_breakdown = {"easy": 0, "medium": 0, "hard": 0}
    topic_breakdown: dict[str, int] = {}

    seen_problems: set[int] = set()
    for solve in solves:
        if solve.problem_id not in seen_problems:
            seen_problems.add(solve.problem_id)
            diff = solve.problem.difficulty.lower()
            if diff in difficulty_breakdown:
                difficulty_breakdown[diff] += 1
            for topic in solve.problem.topics:
                topic_breakdown[topic] = topic_breakdown.get(topic, 0) + 1

    total = len(seen_problems)

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