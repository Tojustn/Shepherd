from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.goal import GoalCreate, GoalOut

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/", response_model=list[GoalOut])
async def list_goals(db: AsyncSession = Depends(get_db)):
    return []


@router.post("/", response_model=GoalOut, status_code=201)
async def create_goal(payload: GoalCreate, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: int, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented yet")
