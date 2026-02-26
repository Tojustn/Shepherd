import pytest
from datetime import date, timedelta

from app.models.streak import Streak, StreakType
from app.services.streak_service import update_streak, get_streak


@pytest.mark.asyncio
async def test_update_streak_creates_new(db, user):
    streak = await update_streak(db, user, StreakType.GITHUB)
    await db.flush()

    assert streak.current == 1
    assert streak.longest == 1
    assert streak.last_activity_date == date.today()


@pytest.mark.asyncio
async def test_update_streak_no_change_same_day(db, user):
    await update_streak(db, user, StreakType.GITHUB)
    await db.flush()
    streak = await update_streak(db, user, StreakType.GITHUB)
    await db.flush()

    assert streak.current == 1


@pytest.mark.asyncio
async def test_update_streak_increments_next_day(db, user):
    yesterday = date.today() - timedelta(days=1)
    streak = Streak(user_id=user.id, type=StreakType.GITHUB, current=3, longest=3, last_activity_date=yesterday)
    db.add(streak)
    await db.flush()

    updated = await update_streak(db, user, StreakType.GITHUB)
    await db.flush()

    assert updated.current == 4
    assert updated.longest == 4
    assert updated.last_activity_date == date.today()


@pytest.mark.asyncio
async def test_update_streak_resets_after_gap(db, user):
    old_date = date.today() - timedelta(days=3)
    streak = Streak(user_id=user.id, type=StreakType.GITHUB, current=10, longest=10, last_activity_date=old_date)
    db.add(streak)
    await db.flush()

    updated = await update_streak(db, user, StreakType.GITHUB)
    await db.flush()

    assert updated.current == 1
    assert updated.longest == 10  # longest preserved


@pytest.mark.asyncio
async def test_update_streak_longest_updates(db, user):
    yesterday = date.today() - timedelta(days=1)
    streak = Streak(user_id=user.id, type=StreakType.GITHUB, current=5, longest=5, last_activity_date=yesterday)
    db.add(streak)
    await db.flush()

    updated = await update_streak(db, user, StreakType.GITHUB)
    await db.flush()

    assert updated.current == 6
    assert updated.longest == 6


@pytest.mark.asyncio
async def test_get_streak_returns_none_when_missing(db, user):
    streak = await get_streak(db, user, StreakType.GITHUB)
    assert streak is None


@pytest.mark.asyncio
async def test_get_streak_returns_existing(db, user):
    s = Streak(user_id=user.id, type=StreakType.GITHUB, current=5, longest=5, last_activity_date=date.today())
    db.add(s)
    await db.flush()

    streak = await get_streak(db, user, StreakType.GITHUB)
    assert streak is not None
    assert streak.current == 5
