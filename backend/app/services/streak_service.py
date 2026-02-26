from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.streak import Streak, StreakType
from app.models.user import User


async def update_streak(db: AsyncSession, user: User, streak_type: StreakType) -> Streak:
    result = await db.execute(
        select(Streak).where(Streak.user_id == user.id, Streak.type == streak_type)
    )
    streak = result.scalar_one_or_none()
    today = date.today()

    if streak is None:
        streak = Streak(user_id=user.id, type=streak_type, current=1, longest=1, last_activity_date=today)
        db.add(streak)
        return streak

    if streak.last_activity_date == today:
        return streak

    if streak.last_activity_date is not None and (today - streak.last_activity_date).days == 1:
        streak.current += 1
    else:
        streak.current = 1

    streak.longest = max(streak.longest, streak.current)
    streak.last_activity_date = today
    return streak


async def get_streak(db: AsyncSession, user: User, streak_type: StreakType) -> Streak | None:
    result = await db.execute(
        select(Streak).where(Streak.user_id == user.id, Streak.type == streak_type)
    )
    return result.scalar_one_or_none()
