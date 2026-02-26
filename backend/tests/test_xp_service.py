import pytest
import pytest_asyncio
from app.models.user import User
from app.models.xp_event import XPSource
from app.services.xp_service import (
    award_xp,
    compute_level,
    xp_for_level,
    streak_multiplier,
    GOAL_DIFFICULTY_XP,
)


# --- Pure function tests (no DB needed) ---

def test_xp_for_level():
    assert xp_for_level(1) == 0
    assert xp_for_level(2) == 100
    assert xp_for_level(3) == 200
    assert xp_for_level(4) == 300


def test_compute_level():
    assert compute_level(0) == 1
    assert compute_level(99) == 1
    assert compute_level(100) == 2
    assert compute_level(199) == 2
    assert compute_level(200) == 3


def test_streak_multiplier():
    assert streak_multiplier(0) == 1.0
    assert streak_multiplier(6) == 1.0
    assert streak_multiplier(7) == 1.5
    assert streak_multiplier(14) == 2.0
    assert streak_multiplier(30) == 3.0


def test_goal_difficulty_xp():
    assert GOAL_DIFFICULTY_XP[1] == 10
    assert GOAL_DIFFICULTY_XP[3] == 30
    assert GOAL_DIFFICULTY_XP[5] == 50


# --- DB-backed tests ---

@pytest.mark.asyncio
async def test_award_xp_commit(db):
    user = User(github_id="123", username="testuser", xp=0, level=1, pending_level_up=False)
    db.add(user)
    await db.flush()

    awarded = await award_xp(db, user, XPSource.COMMIT)

    assert awarded == 10
    assert user.xp == 10
    assert user.level == 1


@pytest.mark.asyncio
async def test_award_xp_triggers_level_up(db):
    user = User(github_id="456", username="testuser2", xp=90, level=1, pending_level_up=False)
    db.add(user)
    await db.flush()

    await award_xp(db, user, XPSource.COMMIT)

    assert user.xp == 100
    assert user.level == 2
    assert user.pending_level_up is True


@pytest.mark.asyncio
async def test_award_xp_goal_difficulty(db):
    user = User(github_id="789", username="testuser3", xp=0, level=1, pending_level_up=False)
    db.add(user)
    await db.flush()

    awarded = await award_xp(db, user, XPSource.GOAL_COMPLETE, meta={"difficulty": 3})

    assert awarded == 30
    assert user.xp == 30


@pytest.mark.asyncio
async def test_award_xp_daily_cap(db):
    user = User(github_id="101", username="testuser4", xp=0, level=1, pending_level_up=False)
    db.add(user)
    await db.flush()

    # Award 15 commits (the daily cap)
    for _ in range(15):
        await award_xp(db, user, XPSource.COMMIT)

    xp_at_cap = user.xp

    # 16th commit should be capped
    awarded = await award_xp(db, user, XPSource.COMMIT)
    assert awarded == 0
    assert user.xp == xp_at_cap
