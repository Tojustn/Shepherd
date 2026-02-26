from datetime import datetime, timezone  
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.goal import Goal
from app.schemas.goal import GoalType


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



async def fetch_commit_goal_ids(
    user_id: int,
    db: AsyncSession,
) -> list[int]:
    result = await db.execute(
        select(Goal.id).where(
            Goal.user_id == user_id,
            Goal.active == True,
            Goal.type.in_([GoalType.COMMITS_DAILY, GoalType.COMMITS_WEEKLY]),
        )
    )
    return result.scalars().all()


async def increment_commit_goals(
    user: User,
    db: AsyncSession,
) -> None:
    goal_ids = await fetch_commit_goal_ids(user.id, db)
    for goal_id in goal_ids:
        goal = await db.execute(select(Goal).where(Goal.id == goal_id))
        goal = goal.scalar_one_or_none()
        if goal:
            await update_goal(
                goal_id=goal_id,
                user=user,
                db=db,
                new_value=goal.current + 1,
            )