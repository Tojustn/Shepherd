from datetime import date, datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.goal import Goal, GoalType


async def update_goal(
    goal_id: int,
    user: User,
    db: AsyncSession,
    new_value: int | None = None,
    completed: bool | None = None,
    meta: dict | None = None,
) -> Goal:
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise ValueError(f"Goal {goal_id} not found for user {user.id}")

    if new_value is not None:  # don't overwrite with None if not passed
        goal.current = new_value


    if completed or (new_value is not None and new_value >= goal.target):
        if not goal.completed:
            goal.completed = True
            goal.completed_at = datetime.now(timezone.utc)

    return goal



async def ensure_daily_goals(user: User, db: AsyncSession) -> list[Goal]:
    """Lazily create today's daily goals if they don't exist yet. Returns all daily goals for today."""
    today = date.today()
    result = await db.execute(
        select(Goal).where(
            Goal.user_id == user.id,
            Goal.type.in_([GoalType.DAILY_COMMIT, GoalType.DAILY_LEETCODE]),
            Goal.goal_date == today,
        )
    )
    existing = {g.type: g for g in result.scalars().all()}

    to_create: list[Goal] = []
    if GoalType.DAILY_COMMIT not in existing:
        to_create.append(Goal(
            user_id=user.id,
            type=GoalType.DAILY_COMMIT,
            target=1,
            label="Push a commit",
            goal_date=today,
        ))
    if GoalType.DAILY_LEETCODE not in existing:
        to_create.append(Goal(
            user_id=user.id,
            type=GoalType.DAILY_LEETCODE,
            target=1,
            label="Solve a Leetcode problem",
            goal_date=today,
        ))

    if to_create:
        db.add_all(to_create)
        await db.flush()

    return list(existing.values()) + to_create


async def fetch_daily_commit_goal(user_id: int, db: AsyncSession) -> Goal | None:
    """Return today's daily commit goal, if it exists."""
    today = date.today()
    result = await db.execute(
        select(Goal).where(
            Goal.user_id == user_id,
            Goal.type == GoalType.DAILY_COMMIT,
            Goal.goal_date == today,
        )
    )
    return result.scalar_one_or_none()


async def fetch_daily_leetcode_goal(user_id: int, db: AsyncSession) -> Goal | None:
    """Return today's daily LeetCode goal, if it exists."""
    today = date.today()
    result = await db.execute(
        select(Goal).where(
            Goal.user_id == user_id,
            Goal.type == GoalType.DAILY_LEETCODE,
            Goal.goal_date == today,
        )
    )
    return result.scalar_one_or_none()


async def increment_commit_goals(
    user: User,
    db: AsyncSession,
) -> list[Goal]:
    """Complete today's daily commit goal (and return it) when a commit is pushed."""
    goal = await fetch_daily_commit_goal(user.id, db)
    if goal and not goal.completed:
        await update_goal(goal_id=goal.id, user=user, db=db, new_value=1)
        return [goal]
    return []