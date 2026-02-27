from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.goal import Goal, GoalType
from app.models.user import User
from app.models.xp_event import XPSource
from app.schemas.goal import GoalCreate, GoalOut
from app.services.xp_service import award_xp
from app.services.goal_service import ensure_daily_goals, update_goal
from app.services import sse_service
from app.services.cache import cache_delete


router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/daily", response_model=list[GoalOut])
async def list_daily_goals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's daily quests, lazy-creating them if needed."""
    goals = await ensure_daily_goals(user, db)
    await db.commit()
    return goals


@router.get("/", response_model=list[GoalOut])
async def list_goals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the user's active custom goals."""
    result = await db.execute(
        select(Goal)
        .where(Goal.user_id == user.id, Goal.active == True, Goal.type == GoalType.CUSTOM)
        .order_by(Goal.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=GoalOut, status_code=201)
async def create_goal(
    payload: GoalCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = Goal(
        user_id=user.id,
        type=GoalType.CUSTOM,
        target=payload.target,
        label=payload.label,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    await sse_service.push(user.id, "goal_created", GoalOut.model_validate(goal).model_dump(mode="json"))
    return goal


@router.patch("/{goal_id}/complete", response_model=GoalOut)
async def complete_goal(
    goal_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.type != GoalType.CUSTOM:
        raise HTTPException(status_code=400, detail="Only custom goals can be manually completed")
    if goal.completed:
        return goal

    goal.completed = True
    goal.completed_at = datetime.now(timezone.utc)
    xp_awarded = await award_xp(db, user, XPSource.GOAL_COMPLETE, meta={"difficulty": goal.difficulty})
    await db.commit()
    await db.refresh(goal)
    await cache_delete(f"user:me:{user.id}")
    await sse_service.push(user.id, "goal_updated", {
        **GoalOut.model_validate(goal).model_dump(mode="json"),
        "xp_awarded": xp_awarded,
    })
    return goal


@router.patch("/{goal_id}/increment", response_model=GoalOut)
async def increment_goal(
    goal_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Increment a counter goal by 1 and award XP on completion."""
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.completed:
        return goal

    await update_goal(goal_id=goal.id, user=user, db=db, new_value=goal.current + 1)

    if goal.completed:
        await award_xp(db, user, XPSource.GOAL_COMPLETE, meta={"kind": "custom"})

    await db.commit()
    await db.refresh(goal)
    await sse_service.push(user.id, "goal_updated", GoalOut.model_validate(goal).model_dump(mode="json"))
    return goal


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.type != GoalType.CUSTOM:
        raise HTTPException(status_code=400, detail="Daily quests cannot be deleted")
    await db.delete(goal)
    await db.commit()
    await sse_service.push(user.id, "goal_deleted", {"id": goal_id})
