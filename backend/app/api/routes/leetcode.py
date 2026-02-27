from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.core.database import get_db
from app.models.leetcode import LeetCodeSolve
from app.models.user import User
from app.schemas.leetcode import LeetCodeSolveCreate, LeetCodeSolveOut
from app.services.cache import cache_delete
from app.services.sse_service import  connect, disconnect, push
from app.schemas.leetcode import LeetCodeSolveUpdate
from app.services.leetcode_service import update_solve, delete_solve, get_stats, log_solve, get_solve
from app.schemas.leetcode import LeetCodeStatsOut

router = APIRouter(prefix="/api/leetcode", tags=["leetcode"])


@router.post("/solves", response_model=LeetCodeSolveOut, status_code=201)
async def create_solve(
    payload: LeetCodeSolveCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        solve, xp_awarded = await log_solve(db, user, payload)
        await db.commit()
        await db.refresh(solve)
        await cache_delete(f"user:me:{user.id}")
        await push(user.id, "xp_gained", {
            "amount": xp_awarded,
            "source": "leetcode_solve",
            "total_xp": user.xp,
            "level": user.level,
        })
        # manually attach xp_awarded since it's not on the model
        result = LeetCodeSolveOut.model_validate(solve)
        result.xp_awarded = xp_awarded
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/solves", response_model=list[LeetCodeSolveOut])
async def get_solves(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeetCodeSolve)
        .where(LeetCodeSolve.user_id == user.id)
        .options(selectinload(LeetCodeSolve.problem))
        .order_by(LeetCodeSolve.solved_at.desc())
    )
    solves = result.scalars().all()
    return [LeetCodeSolveOut(xp_awarded=0, **LeetCodeSolveOut.model_validate(s).model_dump()) for s in solves]
    

@router.patch("/solves/{solve_id}", response_model=LeetCodeSolveOut)
async def patch_solve(
    solve_id: int,
    payload: LeetCodeSolveUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        solve = await update_solve(db, user, solve_id, payload)
        await db.commit()
        await db.refresh(solve)
        result = LeetCodeSolveOut.model_validate(solve)
        result.xp_awarded = 0
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/solves/{solve_id}", status_code=204)
async def remove_solve(
    solve_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_solve(db, user, solve_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))




@router.get("/stats", response_model=LeetCodeStatsOut)
async def get_leetcode_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_stats(db, user)


@router.get("/solves/{solve_id}", response_model=LeetCodeSolveOut)
async def get_solve_detail(
    solve_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        solve = await get_solve(db, user, solve_id)
        result = LeetCodeSolveOut.model_validate(solve)
        result.xp_awarded = 0
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))