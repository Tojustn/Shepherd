from datetime import date, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.xp_event import XPEvent, XPSource
from app.models.streak import Streak, StreakType
from app.services import sse_service

# --- XP values ---
XP_VALUES: dict[XPSource, int] = {
    XPSource.COMMIT: 10,
    XPSource.LEETCODE_SOLVE: 20, 
    XPSource.STREAK_BONUS: 5,
    XPSource.GOAL_COMPLETE: 50,
}

LEETCODE_XP = {"easy": 20, "medium": 40, "hard": 80}

GOAL_XP = {"daily": 30, "custom": 20}

DAILY_CAPS: dict[XPSource, int | None] = {
    
    # For exp is calculated with this formula 
    # 10 + 2 * files changed
    XPSource.LEETCODE_SOLVE: None,
    XPSource.STREAK_BONUS: None,
    XPSource.GOAL_COMPLETE: None,
}

def streak_multiplier(current_streak: int) -> float:
    if current_streak >= 30:
        return 3.0
    if current_streak >= 14:
        return 2.0
    if current_streak >= 7:
        return 1.5
    return 1.0


def xp_for_level(level: int) -> int:
    return 100 * (level - 1)


def compute_level(total_xp: int) -> int:
    level = 1
    while total_xp >= xp_for_level(level + 1):
        level += 1
    return level


async def _count_today(db: AsyncSession, user_id: int, source: XPSource) -> int:
    today_start = date.today()
    result = await db.execute(
        select(func.count()).where(
            XPEvent.user_id == user_id,
            XPEvent.source == source,
            func.date(XPEvent.created_at) == today_start,
        )
    )
    return result.scalar_one()


async def award_xp(
    db: AsyncSession,
    user: User,
    source: XPSource,
    meta: dict[str, Any] | None = None,
) -> int:
    """
    Award XP to a user for a given source. Returns the XP awarded (0 if capped).
    Automatically applies streak multiplier for commits and updates user level.
    """
    if source == XPSource.LEETCODE_SOLVE:
        difficulty = (meta or {}).get("difficulty", "easy").lower()
        base_xp = LEETCODE_XP.get(difficulty, 20)
    elif source == XPSource.GOAL_COMPLETE:
        goal_kind = (meta or {}).get("kind", "custom")  # "daily" or "custom"
        base_xp = GOAL_XP.get(goal_kind, 20)
    elif source == XPSource.COMMIT:
        base_xp = 10 + 2 * meta.get("files_changed", 0) 
    else:
        base_xp = XP_VALUES[source]

    cap = DAILY_CAPS.get(source)
    if cap is not None:
        count_today = await _count_today(db, user.id, source)
        if count_today >= cap:
            return 0

    if source == XPSource.COMMIT:
        streak = await _get_streak(db, user.id, StreakType.GITHUB)
        multiplier = streak_multiplier(streak)
        awarded = int(base_xp * multiplier)
    else:
        awarded = base_xp
        
    db.add(XPEvent(user_id=user.id, source=source, amount=awarded, meta=meta))

    user.xp += awarded
    new_level = compute_level(user.xp)
    leveled_up = new_level > user.level
    if leveled_up:
        user.pending_level_up = True
    user.level = new_level

    await db.flush()

    await sse_service.push(user.id, "xp_gained", {
        "amount": awarded,
        "source": source.value,
        "level_up": leveled_up,
        "new_level": user.level,
        "total_xp": user.xp,
    })

    return awarded


async def _get_streak(db: AsyncSession, user_id: int, streak_type: StreakType) -> int:
    result = await db.execute(
        select(Streak).where(Streak.user_id == user_id, Streak.type == streak_type)
    )
    streak = result.scalar_one_or_none()
    return streak.current if streak else 0
