from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, func

from app.models.leetcode import LeetCodeProblem, LeetCodeSolve, LeetCodeReview
from app.schemas.leetcode import LeetCodeSolveCreate
from app.services.leetcode_service import (
    next_box,
    schedule_review,
    seed_missing_reviews,
    get_due_reviews,
    log_solve,
    BOX_INTERVALS,
    MAX_BOX,
)


async def _review_for(db, user, problem_id):
    return (await db.execute(
        select(LeetCodeReview).where(
            LeetCodeReview.user_id == user.id,
            LeetCodeReview.problem_id == problem_id,
        )
    )).scalar_one()


# ── helpers ────────────────────────────────────────────────────────────────

async def _problem(db, leetcode_id=1, difficulty="easy", topics=None):
    p = LeetCodeProblem(
        leetcode_id=leetcode_id,
        title=f"Problem {leetcode_id}",
        slug=f"problem-{leetcode_id}",
        difficulty=difficulty,
        topics=topics or [],
    )
    db.add(p)
    await db.flush()
    return p


async def _solve(db, user, problem, *, is_imported=False, days_ago=0, confidence=None, code=None):
    s = LeetCodeSolve(
        user_id=user.id,
        problem_id=problem.id,
        is_imported=is_imported,
        solved_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
        confidence=confidence,
        code=code,
    )
    db.add(s)
    await db.flush()
    return s


def _payload(leetcode_id=1, confidence=None, code="x = 1", from_review=False):
    return LeetCodeSolveCreate(
        leetcode_id=leetcode_id,
        title=f"Problem {leetcode_id}",
        slug=f"problem-{leetcode_id}",
        difficulty="easy",
        topics=[],
        code=code,
        confidence=confidence,
        from_review=from_review,
    )


async def _count_reviews(db, user):
    return (await db.execute(
        select(func.count()).select_from(LeetCodeReview).where(LeetCodeReview.user_id == user.id)
    )).scalar()


# ── next_box (pure Leitner transitions) ────────────────────────────────────

@pytest.mark.parametrize("current,confidence,expected", [
    (None, None, 1),   # brand new, no rating → box 1
    (None, 5,    1),   # brand new + pass (not a review) → box 1 (then climbs)
    (1,    3,    2),   # "Got It" is a pass → promote
    (2,    4,    3),   # pass → promote
    (4,    5,    5),   # promote, capped at MAX_BOX
    (5,    5,    5),   # already at cap
    (3,    2,    1),   # "Shaky" fails → back to box 1
    (4,    1,    1),   # "Struggled" fails → back to box 1
    (3,    None, 3),   # no rating keeps current box
])
def test_next_box_transitions(current, confidence, expected):
    assert next_box(current, confidence) == expected
    assert next_box(current, confidence) <= MAX_BOX


@pytest.mark.parametrize("current,confidence,expected", [
    (1, 5, 3),   # mastered in review fast-tracks +2
    (2, 5, 4),
    (3, 5, 5),
    (4, 5, 5),   # capped
    (1, 4, 2),   # "Solid" is a normal pass, not a fast-track
    (3, 2, 1),   # fail still resets
])
def test_next_box_fast_track_in_review(current, confidence, expected):
    assert next_box(current, confidence, from_review=True) == expected


# ── schedule_review ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_schedule_review_promotes_and_fails(db, user):
    prob = await _problem(db, 1)

    r1 = await schedule_review(db, user, prob.id, 4)   # new + pass → box 1
    assert r1.box == 1
    assert r1.next_review_at - r1.last_reviewed_at == timedelta(days=BOX_INTERVALS[1])

    r2 = await schedule_review(db, user, prob.id, 4)   # box 1 + pass → box 2
    assert r2.box == 2
    assert r2.next_review_at - r2.last_reviewed_at == timedelta(days=BOX_INTERVALS[2])

    r3 = await schedule_review(db, user, prob.id, 1)   # fail → box 1
    assert r3.box == 1

    # all on the same (user, problem) row — no duplicates
    assert await _count_reviews(db, user) == 1


# ── seed_missing_reviews ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_seed_creates_due_row_and_is_idempotent(db, user):
    prob = await _problem(db, 1)
    await _solve(db, user, prob, days_ago=5)

    created = await seed_missing_reviews(db, user)
    assert created == 1

    review = (await db.execute(select(LeetCodeReview))).scalar_one()
    assert review.box == 1
    # scheduled one day after the solve (both timestamps round-trip naive on sqlite)
    assert review.next_review_at == review.last_reviewed_at + timedelta(days=1)

    # a 5-day-old solve is therefore overdue and surfaces in the due queue
    due = await get_due_reviews(db, user)
    assert [item["problem"].id for item in due] == [prob.id]

    # running again seeds nothing
    assert await seed_missing_reviews(db, user) == 0
    assert await _count_reviews(db, user) == 1


@pytest.mark.asyncio
async def test_seed_skips_imported_only_problems(db, user):
    prob = await _problem(db, 1)
    await _solve(db, user, prob, is_imported=True, days_ago=10)

    assert await seed_missing_reviews(db, user) == 0
    assert await _count_reviews(db, user) == 0


# ── get_due_reviews ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_due_includes_overdue_excludes_future(db, user):
    overdue = await _problem(db, 1)
    await _solve(db, user, overdue, days_ago=5)        # seeded → due (4 days ago)

    fresh = await _problem(db, 2)
    await schedule_review(db, user, fresh.id, 4)        # scheduled now → +1 day, future

    due = await get_due_reviews(db, user)
    ids = [item["problem"].id for item in due]
    assert overdue.id in ids
    assert fresh.id not in ids
    assert all(item["imported_only"] is False for item in due)


@pytest.mark.asyncio
async def test_due_includes_imported_backlog_only_when_requested(db, user):
    imported = await _problem(db, 1)
    await _solve(db, user, imported, is_imported=True, days_ago=3)

    assert await get_due_reviews(db, user, include_imported=False) == []

    backlog = await get_due_reviews(db, user, include_imported=True)
    assert len(backlog) == 1
    item = backlog[0]
    assert item["problem"].id == imported.id
    assert item["imported_only"] is True
    assert item["last_solve"].is_imported is True


# ── log_solve scheduling + imported placeholder conversion ─────────────────

@pytest.mark.asyncio
async def test_log_solve_schedules_review(db, user):
    solve, xp = await log_solve(db, user, _payload(1, confidence=4))
    assert xp > 0  # first real solve awards XP

    review = (await db.execute(
        select(LeetCodeReview).where(LeetCodeReview.problem_id == solve.problem_id)
    )).scalar_one()
    assert review.box == 1


@pytest.mark.asyncio
async def test_log_solve_converts_imported_placeholder_in_place(db, user):
    prob = await _problem(db, 1)
    placeholder = await _solve(db, user, prob, is_imported=True, days_ago=30)
    placeholder_id = placeholder.id

    solve, xp = await log_solve(db, user, _payload(1, confidence=4, code="print(1)"))

    # same row reused, now a real solve
    assert solve.id == placeholder_id
    assert solve.is_imported is False
    assert solve.code == "print(1)"
    assert xp > 0  # converting an import counts as the first real solve

    # exactly one solve row — nothing stacked
    count = (await db.execute(
        select(func.count()).select_from(LeetCodeSolve).where(LeetCodeSolve.problem_id == prob.id)
    )).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_log_solve_second_attempt_stacks_without_xp(db, user):
    prob = await _problem(db, 1)
    await _solve(db, user, prob, is_imported=True, days_ago=30)

    await log_solve(db, user, _payload(1, confidence=4))   # converts placeholder
    solve2, xp2 = await log_solve(db, user, _payload(1, confidence=3))  # re-solve stacks

    assert xp2 == 0
    count = (await db.execute(
        select(func.count()).select_from(LeetCodeSolve).where(LeetCodeSolve.problem_id == prob.id)
    )).scalar()
    assert count == 2


# ── graduation / archiving ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pass_at_top_box_in_review_archives(db, user):
    prob = await _problem(db, 1)
    review = await schedule_review(db, user, prob.id, 4)
    review.box = MAX_BOX  # pretend it climbed to the top
    await db.flush()

    await schedule_review(db, user, prob.id, 5, from_review=True)
    review = await _review_for(db, user, prob.id)
    assert review.archived is True


@pytest.mark.asyncio
async def test_top_box_pass_outside_review_does_not_archive(db, user):
    prob = await _problem(db, 1)
    review = await schedule_review(db, user, prob.id, 4)
    review.box = MAX_BOX
    await db.flush()

    # from_review defaults False (e.g. logged from the Library)
    await schedule_review(db, user, prob.id, 5, from_review=False)
    review = await _review_for(db, user, prob.id)
    assert review.archived is False


@pytest.mark.asyncio
async def test_pass_below_top_box_does_not_archive(db, user):
    prob = await _problem(db, 1)
    review = await schedule_review(db, user, prob.id, 4)
    review.box = 3
    await db.flush()

    await schedule_review(db, user, prob.id, 4, from_review=True)  # normal pass
    review = await _review_for(db, user, prob.id)
    assert review.archived is False
    assert review.box == 4  # promoted one box, not graduated


@pytest.mark.asyncio
async def test_archived_excluded_from_due_until_resolved(db, user):
    prob = await _problem(db, 1)
    await _solve(db, user, prob, days_ago=5)
    await seed_missing_reviews(db, user)
    review = await _review_for(db, user, prob.id)
    review.box = MAX_BOX
    await db.flush()

    # graduate it in review → leaves the queue
    await schedule_review(db, user, prob.id, 5, from_review=True)
    assert (await _review_for(db, user, prob.id)).archived is True
    assert await get_due_reviews(db, user) == []

    # re-solving reactivates it (a fail brings it straight back)
    await schedule_review(db, user, prob.id, 1, from_review=True)
    assert (await _review_for(db, user, prob.id)).archived is False


@pytest.mark.asyncio
async def test_fast_track_advances_two_boxes_in_review(db, user):
    prob = await _problem(db, 1)
    await schedule_review(db, user, prob.id, 4)  # land in box 1
    review = await _review_for(db, user, prob.id)
    assert review.box == 1

    await schedule_review(db, user, prob.id, 5, from_review=True)  # mastered
    review = await _review_for(db, user, prob.id)
    assert review.box == 3       # +2, not +1
    assert review.archived is False


@pytest.mark.asyncio
async def test_fast_track_from_box_four_graduates(db, user):
    prob = await _problem(db, 1)
    review = await schedule_review(db, user, prob.id, 4)
    review.box = 4
    await db.flush()

    await schedule_review(db, user, prob.id, 5, from_review=True)  # +2 overshoots top
    review = await _review_for(db, user, prob.id)
    assert review.archived is True


@pytest.mark.asyncio
async def test_mastered_outside_review_is_normal_promotion(db, user):
    prob = await _problem(db, 1)
    await schedule_review(db, user, prob.id, 4)  # box 1
    await schedule_review(db, user, prob.id, 5, from_review=False)  # not a review
    review = await _review_for(db, user, prob.id)
    assert review.box == 2  # only +1 — fast-track is review-only


# ── API endpoint ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_review_due_endpoint(client, db, user, auth_headers):
    prob = await _problem(db, 42)
    await _solve(db, user, prob, days_ago=5)
    imported = await _problem(db, 43)
    await _solve(db, user, imported, is_imported=True, days_ago=5)
    await db.commit()

    resp = await client.get("/api/leetcode/review/due", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert [d["problem"]["leetcode_id"] for d in data] == [42]

    resp2 = await client.get("/api/leetcode/review/due?include_imported=true", headers=auth_headers)
    assert resp2.status_code == 200
    ids = {d["problem"]["leetcode_id"] for d in resp2.json()}
    assert ids == {42, 43}
