from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.core.database import get_db
from app.models.leetcode import LeetCodeSolve, LeetCodeProblem
from app.models.user import User
from app.schemas.leetcode import LeetCodeSolveCreate, LeetCodeSolveOut, LCImportRequest
from app.services.cache import cache_delete
from app.services.sse_service import connect, disconnect, push
from app.schemas.leetcode import LeetCodeSolveUpdate
from app.services.leetcode_service import update_solve, delete_solve, get_stats, log_solve, get_solve, search_problems, import_historical_solves, validate_leetcode_username
from app.schemas.leetcode import LeetCodeStatsOut

router = APIRouter(prefix="/leetcode", tags=["leetcode"])


@router.get("/validate-username")
async def validate_lc_username(
    username: str = Query(..., min_length=1),
    _user: User = Depends(get_current_user),
):
    """Check if a LeetCode username exists (public profile)."""
    exists = await validate_leetcode_username(username)
    return {"valid": exists}


@router.post("/import")
async def import_lc_solves(
    payload: LCImportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Import historical LeetCode solves.
    Provide session_cookie (LEETCODE_SESSION) for full history
    """
    if not user.leetcode_username:
        raise HTTPException(status_code=400, detail="No LeetCode username set. Update your profile first.")
    try:
        await db.execute(
            delete(LeetCodeSolve).where(
                LeetCodeSolve.user_id == user.id,
                LeetCodeSolve.is_imported == True,
            )
        )
        count = await import_historical_solves(
            user.leetcode_username, db, user, session_cookie=payload.session_cookie
        )
        await db.commit()
        return {"imported": count}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=502, detail="LeetCode import failed. Please try again.")


@router.get("/search")
async def search_lc_problems(
    q: str = Query(..., min_length=1),
    _user: User = Depends(get_current_user),
):
    """Proxy search to LeetCode's public GraphQL API."""
    try:
        return await search_problems(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LeetCode search unavailable: {e}")


@router.post("/solves", response_model=LeetCodeSolveOut, status_code=201)
async def create_solve(
    payload: LeetCodeSolveCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        solve, xp_awarded = await log_solve(db, user, payload)
        await db.commit()
        reloaded = await db.execute(
            select(LeetCodeSolve).where(LeetCodeSolve.id == solve.id).options(selectinload(LeetCodeSolve.problem))
        )
        solve = reloaded.scalar_one()
        await cache_delete(f"user:me:{user.id}")
        await push(user.id, "xp_gained", {
            "amount": xp_awarded,
            "source": "leetcode_solve",
            "total_xp": user.xp,
            "level": user.level,
        })
        result = LeetCodeSolveOut.model_validate(solve)
        result.xp_awarded = xp_awarded
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/solves", response_model=list[LeetCodeSolveOut])
async def get_solves(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    difficulty: str | None = Query(None, description="easy | medium | hard"),
    language: str | None = Query(None, description="Python, JavaScript, etc."),
    confidence: int | None = Query(None, ge=1, le=5),
    topic: str | None = Query(None, description="e.g. Dynamic Programming"),
):
    stmt = (
        select(LeetCodeSolve)
        .where(LeetCodeSolve.user_id == user.id)
        .options(selectinload(LeetCodeSolve.problem))
        .order_by(LeetCodeSolve.solved_at.desc())
    )

    if difficulty is not None or topic is not None:
        subq = select(LeetCodeProblem.id)
        if difficulty is not None:
            subq = subq.where(LeetCodeProblem.difficulty == difficulty.lower())
        if topic is not None:
            subq = subq.where(LeetCodeProblem.topics.contains([topic]))
        stmt = stmt.where(LeetCodeSolve.problem_id.in_(subq))

    if language is not None:
        stmt = stmt.where(LeetCodeSolve.language == language)
    if confidence is not None:
        stmt = stmt.where(LeetCodeSolve.confidence == confidence)

    result = await db.execute(stmt)
    solves = result.scalars().all()
    return [LeetCodeSolveOut.model_validate(s) for s in solves]
    

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
        reloaded = await db.execute(
            select(LeetCodeSolve).where(LeetCodeSolve.id == solve.id).options(selectinload(LeetCodeSolve.problem))
        )
        solve = reloaded.scalar_one()
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