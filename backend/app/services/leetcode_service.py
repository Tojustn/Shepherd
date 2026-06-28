# app/services/leetcode.py
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leetcode import LeetCodeProblem, LeetCodeSolve, LeetCodeReview
from app.models.streak import StreakType
from app.models.user import User
from app.schemas.leetcode import LeetCodeSolveCreate, LeetCodeSolveUpdate, LCJsonImportProblem
from app.services.xp_service import award_xp, XPSource
from app.services.streak_service import update_streak
from app.services.cache import cache_set, cache_get


# ── Leitner spaced-repetition scheduler ────────────────────────────────────
# Box (1-5) → days until the next review. A passing re-solve promotes one box;
# a failing one drops straight back to box 1.
BOX_INTERVALS: dict[int, int] = {1: 1, 2: 3, 3: 7, 4: 21, 5: 60}
MAX_BOX = 5
PASS_CONFIDENCE = 3  # confidence >= this is a "pass"


def _pass_increment(confidence: int | None, from_review: bool) -> int:
    """
    Boxes to advance on a passing solve. A flawless 'Mastered' (5) during a
    review fast-tracks +2 — no point reviewing normally when it's fully locked in.
    Everything else advances one box.
    """
    return 2 if (from_review and confidence is not None and confidence >= 5) else 1


def next_box(current_box: int | None, confidence: int | None, from_review: bool = False) -> int:
    """
    Compute the resulting Leitner box after a solve.

    - fail (confidence <= 2): drop back to box 1
    - pass (confidence 3-4): promote one box (capped at MAX_BOX)
    - mastered in review (confidence 5): fast-track two boxes (capped)
    - unknown (no confidence): keep the current box, floored at 1
    """
    base = current_box or 0
    if confidence is None:
        return max(base, 1)
    if confidence < PASS_CONFIDENCE:
        return 1
    return min(base + _pass_increment(confidence, from_review), MAX_BOX)


def _is_pass(confidence: int | None) -> bool:
    return confidence is not None and confidence >= PASS_CONFIDENCE


async def schedule_review(
    db: AsyncSession,
    user: User,
    problem_id: int,
    confidence: int | None,
    *,
    reviewed_at: datetime | None = None,
    from_review: bool = False,
) -> LeetCodeReview:
    """
    Create or update the Leitner review row for a (user, problem) after a solve.

    Graduation: when `from_review` and the problem is passed again while already
    in the top box, it's archived (removed from the active queue). Any other solve
    reactivates it, so a re-solve months later pulls it back into rotation.
    """
    reviewed_at = reviewed_at or datetime.now(tz=timezone.utc)
    result = await db.execute(
        select(LeetCodeReview).where(
            LeetCodeReview.user_id == user.id,
            LeetCodeReview.problem_id == problem_id,
        )
    )
    review = result.scalar_one_or_none()

    prev_box = review.box if review else None
    box = next_box(prev_box, confidence, from_review=from_review)
    next_review_at = reviewed_at + timedelta(days=BOX_INTERVALS[box])

    # Graduate when a deliberate review pass would advance past the top box —
    # covers a normal pass at box 5 and a +2 fast-track from box 4 or 5.
    graduate = (
        from_review
        and _is_pass(confidence)
        and (prev_box or 0) + _pass_increment(confidence, from_review) > MAX_BOX
    )

    if review:
        review.box = box
        review.next_review_at = next_review_at
        review.last_reviewed_at = reviewed_at
        review.archived = graduate
    else:
        review = LeetCodeReview(
            user_id=user.id,
            problem_id=problem_id,
            box=box,
            next_review_at=next_review_at,
            last_reviewed_at=reviewed_at,
            archived=graduate,
        )
        db.add(review)
    await db.flush()
    return review


async def seed_missing_reviews(db: AsyncSession, user: User) -> int:
    """
    Idempotently create review rows for problems the user has really solved
    (non-imported) but that have no schedule yet. Mirrors the prod migration's
    backfill so the queue also works on SQLite dev, where migrations don't run.
    Each seeded problem starts in box 1, due one day after its last solve.
    """
    existing = select(LeetCodeReview.problem_id).where(LeetCodeReview.user_id == user.id)
    result = await db.execute(
        select(LeetCodeSolve.problem_id, func.max(LeetCodeSolve.solved_at))
        .where(
            LeetCodeSolve.user_id == user.id,
            LeetCodeSolve.is_imported == False,  # noqa: E712
            LeetCodeSolve.problem_id.notin_(existing),
        )
        .group_by(LeetCodeSolve.problem_id)
    )
    created = 0
    for problem_id, last_solved in result.all():
        if last_solved is not None and last_solved.tzinfo is None:
            last_solved = last_solved.replace(tzinfo=timezone.utc)
        anchor = last_solved or datetime.now(tz=timezone.utc)
        db.add(LeetCodeReview(
            user_id=user.id,
            problem_id=problem_id,
            box=1,
            next_review_at=anchor + timedelta(days=1),
            last_reviewed_at=anchor,
        ))
        created += 1
    if created:
        await db.flush()
    return created


async def _latest_solve_map(
    db: AsyncSession, user: User, problem_ids: list[int]
) -> tuple[dict[int, LeetCodeSolve], dict[int, int]]:
    """Most-recent solve and solve count per problem, for the given problem ids."""
    if not problem_ids:
        return {}, {}
    result = await db.execute(
        select(LeetCodeSolve)
        .where(
            LeetCodeSolve.user_id == user.id,
            LeetCodeSolve.problem_id.in_(problem_ids),
        )
        .options(selectinload(LeetCodeSolve.problem))
        .order_by(LeetCodeSolve.solved_at.asc())
    )
    latest: dict[int, LeetCodeSolve] = {}
    counts: dict[int, int] = {}
    for s in result.scalars().all():
        latest[s.problem_id] = s  # ascending order → last wins
        counts[s.problem_id] = counts.get(s.problem_id, 0) + 1
    return latest, counts


async def _get_imported_backlog(db: AsyncSession, user: User) -> list[dict]:
    """
    Problems the user has only ever *imported* (no real solve, so no schedule).
    These have no Leitner state, so they're treated as always-available backlog —
    oldest first. Reviewing one (logging a real re-solve) converts it into a
    normally-scheduled problem and drops it from this list.
    """
    has_real_solve = select(LeetCodeSolve.problem_id).where(
        LeetCodeSolve.user_id == user.id,
        LeetCodeSolve.is_imported == False,  # noqa: E712
    )
    already_scheduled = select(LeetCodeReview.problem_id).where(
        LeetCodeReview.user_id == user.id
    )
    result = await db.execute(
        select(LeetCodeSolve.problem_id, func.max(LeetCodeSolve.solved_at).label("last_at"))
        .where(
            LeetCodeSolve.user_id == user.id,
            LeetCodeSolve.problem_id.notin_(has_real_solve),
            LeetCodeSolve.problem_id.notin_(already_scheduled),
        )
        .group_by(LeetCodeSolve.problem_id)
        .order_by(func.max(LeetCodeSolve.solved_at).asc())
    )
    rows = result.all()
    if not rows:
        return []

    now = datetime.now(tz=timezone.utc)
    latest, counts = await _latest_solve_map(db, user, [r[0] for r in rows])
    items: list[dict] = []
    for problem_id, last_at in rows:
        solve = latest.get(problem_id)
        if solve is None:
            continue
        items.append({
            "problem": solve.problem,
            "box": 1,
            "next_review_at": last_at or now,
            "last_solve": solve,
            "solve_count": counts.get(problem_id, 0),
            "imported_only": True,
        })
    return items


async def get_due_reviews(
    db: AsyncSession, user: User, include_imported: bool = False
) -> list[dict]:
    """
    Return problems whose next_review_at has passed, most-overdue first, each
    paired with its most recent solve (so the UI can reveal the prior solution).

    With include_imported=True, append imported-only problems (which have no
    schedule of their own) as backlog after the scheduled due items.
    """
    await seed_missing_reviews(db, user)
    now = datetime.now(tz=timezone.utc)
    result = await db.execute(
        select(LeetCodeReview)
        .where(
            LeetCodeReview.user_id == user.id,
            LeetCodeReview.archived == False,  # noqa: E712
            LeetCodeReview.next_review_at <= now,
        )
        .options(selectinload(LeetCodeReview.problem))
        .order_by(LeetCodeReview.next_review_at.asc())
    )
    reviews = result.scalars().all()

    latest, counts = await _latest_solve_map(db, user, [r.problem_id for r in reviews])
    items = [
        {
            "problem": r.problem,
            "box": r.box,
            "next_review_at": r.next_review_at,
            "last_solve": latest.get(r.problem_id),
            "solve_count": counts.get(r.problem_id, 0),
            "imported_only": False,
        }
        for r in reviews
    ]

    if include_imported:
        items.extend(await _get_imported_backlog(db, user))

    return items


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

    existing_result = await db.execute(
        select(LeetCodeSolve)
        .where(
            LeetCodeSolve.user_id == user.id,
            LeetCodeSolve.problem_id == problem.id,
        )
        .order_by(LeetCodeSolve.solved_at.asc())
    )
    existing = existing_result.scalars().all()
    has_real = any(not s.is_imported for s in existing)
    imported_placeholder = next((s for s in existing if s.is_imported), None)

    if existing and not has_real and imported_placeholder is not None:
        # The problem was only ever imported (placeholder, no real solve). Fill that
        # placeholder in-place instead of stacking a second row on top of it.
        solve = imported_placeholder
        solve.notes = payload.notes
        solve.code = payload.code
        solve.language = payload.language
        solve.time_complexity = payload.time_complexity
        solve.space_complexity = payload.space_complexity
        solve.confidence = payload.confidence
        solve.is_imported = False
        solve.solved_at = datetime.now(tz=timezone.utc)
        is_first_real = True  # first time it's a real, logged solve
    else:
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
        is_first_real = len(existing) == 0

    await db.flush()

    if is_first_real:
        xp_awarded = await award_xp(
            db,
            user,
            XPSource.LEETCODE_SOLVE,
            meta={"difficulty": payload.difficulty},
        )
        await update_streak(db, user, StreakType.LEETCODE)
    else:
        xp_awarded = 0

    # Update the Leitner schedule for this problem.
    await schedule_review(db, user, problem.id, payload.confidence, from_review=payload.from_review)

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

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(solve, field, value)

    if solve.is_imported and solve.code:
        solve.is_imported = False
        if "solved_at" not in updates:
            solve.solved_at = datetime.now(tz=timezone.utc)

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


async def clear_solves(
    db: AsyncSession,
    user: User,
) -> int:
    result = await db.execute(
        delete(LeetCodeSolve).where(LeetCodeSolve.user_id == user.id)
    )
    return result.rowcount or 0


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


async def import_solves_from_json(
    db: AsyncSession,
    user: User,
    problems: list[LCJsonImportProblem],
) -> tuple[int, int]:
    """
    Restore solves from a previously exported Shepherd JSON backup.
    Additive: new problems/solves are inserted, and matching existing
    problems/solves are updated in place. Each solve keeps the
    `is_imported` flag it had at export time.

    Returns (imported, updated) counts.
    """
    slugs = [p.slug for p in problems if p.slug]

    problems_by_slug: dict[str, LeetCodeProblem] = {}
    if slugs:
        res = await db.execute(select(LeetCodeProblem).where(LeetCodeProblem.slug.in_(slugs)))
        problems_by_slug = {p.slug: p for p in res.scalars().all()}

    new_problems: list[tuple[str, LeetCodeProblem]] = []
    seen_slugs: set[str] = set()
    for item in problems:
        if not item.slug or item.slug in seen_slugs:
            continue
        seen_slugs.add(item.slug)
        existing_problem = problems_by_slug.get(item.slug)
        if existing_problem:
            existing_problem.title = item.title
            existing_problem.difficulty = item.difficulty
            if item.topics:
                existing_problem.topics = item.topics
        else:
            p = LeetCodeProblem(
                leetcode_id=item.leetcode_id,
                title=item.title,
                slug=item.slug,
                difficulty=item.difficulty,
                topics=item.topics,
            )
            db.add(p)
            new_problems.append((item.slug, p))

    if new_problems:
        await db.flush()
        for slug, p in new_problems:
            problems_by_slug[slug] = p

    problem_ids = {p.id for p in problems_by_slug.values()}
    existing_solves: dict[tuple[int, datetime], LeetCodeSolve] = {}
    if problem_ids:
        res2 = await db.execute(
            select(LeetCodeSolve).where(
                LeetCodeSolve.user_id == user.id,
                LeetCodeSolve.problem_id.in_(problem_ids),
            )
        )
        for s in res2.scalars().all():
            solved_at = s.solved_at
            if solved_at.tzinfo is None:
                solved_at = solved_at.replace(tzinfo=timezone.utc)
            existing_solves[(s.problem_id, solved_at)] = s

    imported = 0
    updated = 0
    for item in problems:
        problem = problems_by_slug.get(item.slug)
        if not problem:
            continue
        for solve in item.solves:
            solved_at = solve.solved_at
            if solved_at.tzinfo is None:
                solved_at = solved_at.replace(tzinfo=timezone.utc)
            key = (problem.id, solved_at)
            existing_solve = existing_solves.get(key)
            if existing_solve:
                existing_solve.notes = solve.notes
                existing_solve.code = solve.code
                existing_solve.language = solve.language
                existing_solve.time_complexity = solve.time_complexity
                existing_solve.space_complexity = solve.space_complexity
                existing_solve.confidence = solve.confidence
                existing_solve.is_imported = solve.is_imported
                updated += 1
            else:
                new_solve = LeetCodeSolve(
                    user_id=user.id,
                    problem_id=problem.id,
                    notes=solve.notes,
                    code=solve.code,
                    language=solve.language,
                    time_complexity=solve.time_complexity,
                    space_complexity=solve.space_complexity,
                    confidence=solve.confidence,
                    solved_at=solved_at,
                    is_imported=solve.is_imported,
                )
                db.add(new_solve)
                existing_solves[key] = new_solve
                imported += 1

    await db.flush()
    return imported, updated


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