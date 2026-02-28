# app/services/leetcode.py
import asyncio
from datetime import datetime, timezone

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


_LANG_MAP: dict[str, str] = {
    "python3": "Python", "python": "Python",
    "javascript": "JavaScript", "typescript": "TypeScript",
    "cpp": "C++", "java": "Java", "c": "C",
    "golang": "Go", "rust": "Rust", "swift": "Swift",
    "kotlin": "Kotlin", "ruby": "Ruby", "scala": "Scala",
    "csharp": "C#", "mysql": "MySQL", "bash": "Bash",
    "php": "PHP", "dart": "Dart", "elixir": "Elixir",
}

_DIFF_MAP = {1: "easy", 2: "medium", 3: "hard"}


def _normalize_lang(lang: str) -> str | None:
    return _LANG_MAP.get(lang.lower()) if lang else None


async def validate_leetcode_username(username: str) -> bool:
    """Return True if the LeetCode username exists (public profile)."""
    _VALIDATE_QUERY = """
    query matchedUser($username: String!) {
      matchedUser(username: $username) { username }
    }
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://leetcode.com/graphql/",
                json={"query": _VALIDATE_QUERY, "variables": {"username": username}},
                headers={"Content-Type": "application/json", "User-Agent": _UA},
            )
            resp.raise_for_status()
            return resp.json().get("data", {}).get("matchedUser") is not None
    except Exception:
        return False


async def _fetch_all_solved_rest(session_cookie: str) -> list[dict]:
    """
    Use LeetCode's REST API with LEETCODE_SESSION cookie to fetch ALL solved problems
    in a single request. Returns list of {leetcode_id, title, slug, difficulty, topics}.
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(
            "https://leetcode.com/api/problems/all/",
            headers={
                "User-Agent": _UA,
                "Cookie": f"LEETCODE_SESSION={session_cookie}",
                "Referer": "https://leetcode.com/",
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()

        # If unauthenticated, LeetCode returns user_name: "" and no ac statuses
        if not data.get("user_name"):
            raise ValueError("LeetCode session cookie is invalid or expired.")

        solved = []
        for pair in data.get("stat_status_pairs", []):
            if pair.get("status") != "ac":
                continue
            stat = pair["stat"]
            lc_id = stat.get("frontend_question_id")
            if not lc_id:
                continue
            solved.append({
                "leetcode_id": int(lc_id),
                "title": stat.get("question__title", ""),
                "slug": stat.get("question__title_slug", ""),
                "difficulty": _DIFF_MAP.get(pair.get("difficulty", {}).get("level", 1), "easy"),
                "topics": [],  # REST API doesn't include topics
                "language": None,
                "solved_at": None,
            })
        return solved


async def import_historical_solves(
    lc_username: str,
    db: AsyncSession,
    user: User,
    session_cookie: str | None = None,
) -> int:
    """
    Import historical LeetCode solves. No XP is awarded for historical imports.

    - With session_cookie: uses REST API to fetch ALL solved problems.
    - Without: falls back to public GraphQL (capped at ~20 by LeetCode).

    Returns the number of new solves inserted.
    """
    if session_cookie:
        solved_list = await _fetch_all_solved_rest(session_cookie.strip())
    else:
        solved_list = await _fetch_recent_acs_fallback(lc_username)

    if not solved_list:
        return 0

    slugs = [item["slug"] for item in solved_list if item.get("slug")]

    # Bulk-load existing problems by slug
    res = await db.execute(select(LeetCodeProblem).where(LeetCodeProblem.slug.in_(slugs)))
    problems_by_slug: dict[str, LeetCodeProblem] = {p.slug: p for p in res.scalars().all()}

    # Bulk-load existing solves for this user
    known_problem_ids = {p.id for p in problems_by_slug.values()}
    already_solved: set[int] = set()
    if known_problem_ids:
        res2 = await db.execute(
            select(LeetCodeSolve.problem_id).where(
                LeetCodeSolve.user_id == user.id,
                LeetCodeSolve.problem_id.in_(known_problem_ids),
            )
        )
        already_solved = {row[0] for row in res2.all()}

    # Insert new problems (deduplicated)
    new_problems: list[tuple[str, LeetCodeProblem]] = []
    seen_slugs: set[str] = set()
    for item in solved_list:
        slug = item.get("slug", "")
        if not slug or slug in problems_by_slug or slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        p = LeetCodeProblem(
            leetcode_id=item["leetcode_id"],
            title=item["title"],
            slug=slug,
            difficulty=item["difficulty"],
            topics=[],
        )
        db.add(p)
        new_problems.append((slug, p))

    if new_problems:
        await db.flush()
        for slug, p in new_problems:
            problems_by_slug[slug] = p

    # Insert new solves
    imported = 0
    inserted_problem_ids: set[int] = set()
    for item in solved_list:
        slug = item.get("slug", "")
        problem = problems_by_slug.get(slug)
        if not problem:
            continue
        if problem.id in already_solved or problem.id in inserted_problem_ids:
            continue

        ts = item.get("solved_at")
        solved_at = ts if ts else datetime.now(tz=timezone.utc)

        db.add(LeetCodeSolve(
            user_id=user.id,
            problem_id=problem.id,
            language=item.get("language"),
            solved_at=solved_at,
            is_imported=True,
        ))
        inserted_problem_ids.add(problem.id)
        imported += 1

    await db.flush()
    return imported


_RECENT_AC_QUERY = """
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id title titleSlug timestamp lang
  }
}
"""

_PROBLEM_DETAIL_QUERY = """
query questionDetail($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId title difficulty topicTags { name }
  }
}
"""


async def _fetch_recent_acs_fallback(username: str) -> list[dict]:
    """Public GraphQL fallback — LeetCode hard-caps this at ~20 results."""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        await client.get("https://leetcode.com/problemset/", headers={"User-Agent": _UA})
        csrf = client.cookies.get("csrftoken", "")
        resp = await client.post(
            "https://leetcode.com/graphql/",
            json={"query": _RECENT_AC_QUERY, "variables": {"username": username, "limit": 20}},
            headers={
                "Content-Type": "application/json", "User-Agent": _UA,
                "Referer": "https://leetcode.com/", "x-csrftoken": csrf,
            },
        )
        resp.raise_for_status()
        subs = resp.json().get("data", {}).get("recentAcSubmissionList") or []

    # Deduplicate and enrich with problem details
    seen: dict[str, dict] = {}
    for sub in subs:
        slug = sub.get("titleSlug", "")
        if slug and slug not in seen:
            seen[slug] = sub

    semaphore = asyncio.Semaphore(5)

    async def _detail(slug: str) -> dict | None:
        async with semaphore:
            try:
                async with httpx.AsyncClient(timeout=10.0) as c:
                    r = await c.post(
                        "https://leetcode.com/graphql/",
                        json={"query": _PROBLEM_DETAIL_QUERY, "variables": {"titleSlug": slug}},
                        headers={"Content-Type": "application/json", "User-Agent": _UA},
                    )
                    q = r.json().get("data", {}).get("question")
                    if not q:
                        return None
                    sub = seen[slug]
                    ts = int(sub.get("timestamp", 0))
                    return {
                        "leetcode_id": int(q["questionFrontendId"]),
                        "title": q["title"],
                        "slug": slug,
                        "difficulty": q["difficulty"].lower(),
                        "topics": [t["name"] for t in q.get("topicTags", [])],
                        "language": _normalize_lang(sub.get("lang", "")),
                        "solved_at": datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None,
                    }
            except Exception:
                return None

    results = await asyncio.gather(*[_detail(s) for s in seen])
    return [r for r in results if r is not None]