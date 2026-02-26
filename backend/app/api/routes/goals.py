from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.goal import Goal
from app.models.user import User
from app.models.xp_event import XPSource
from app.schemas.goal import GoalCreate, GoalOut
from app.services.xp_service import award_xp

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/", response_model=list[GoalOut])
async def list_goals(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Goal).where(Goal.user_id == user.id, Goal.active == True).order_by(Goal.created_at.desc())
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
        type=payload.type,
        period=payload.period,
        target=payload.target,
        difficulty=payload.difficulty,
        label=payload.label,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
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
    if goal.current >= goal.target:
        return goal  # already completed, don't award XP again
    goal.current = goal.target
    await award_xp(db, user, XPSource.GOAL_COMPLETE, meta={"goal_id": goal.id, "difficulty": goal.difficulty})
    await db.commit()
    await db.refresh(goal)
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
    await db.delete(goal)
    await db.commit()
