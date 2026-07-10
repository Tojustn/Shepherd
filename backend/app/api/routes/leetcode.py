from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.core.database import get_db
from app.models.leetcode import LeetCodeSolve, LeetCodeProblem
from app.models.user import User
from app.schemas.leetcode import LeetCodeSolveCreate, LeetCodeSolveOut, LCImportRequest, LeetCodeProblemUpdate, LeetCodeProblemOut, LCJsonImportRequest, LCJsonImportResult, ReviewDueItem, ReviewStatsOut, LeetCodeTodoCreate, LeetCodeTodoOut, LCTodoImportRequest, LCTodoImportResult, LeetCodeTodoMove, LCTodoReorder, LeetCodeTodoListCreate, LeetCodeTodoListOut
from app.services.cache import cache_delete
from app.services.sse_service import connect, disconnect, push
from app.schemas.leetcode import LeetCodeSolveUpdate
from app.services.leetcode_service import update_solve, delete_solve, clear_solves, get_stats, log_solve, get_solve, search_problems, import_historical_solves, import_solves_from_json, validate_leetcode_username, get_due_reviews, snooze_review, archive_review, rebalance_reviews, get_review_stats, sync_topics, get_todos, add_todo, remove_todo, import_todos_by_slugs, move_todo_to_list, reorder_todos, get_todo_lists, create_todo_list, rename_todo_list, delete_todo_list
from app.services.goal_service import increment_leetcode_goals
from app.schemas.goal import GoalOut
from app.models.xp_event import XPSource
from app.services.xp_service import award_xp
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


@router.post("/import-json", response_model=LCJsonImportResult)
async def import_lc_json(
    payload: LCJsonImportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore solves from a previously exported Shepherd JSON backup."""
    imported, updated = await import_solves_from_json(db, user, payload.problems)
    await db.commit()
    await cache_delete(f"user:me:{user.id}")
    return {"imported": imported, "updated": updated}


@router.post("/sync-topics")
async def sync_lc_topics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-sync topic tags for all solved problems from LeetCode, overwriting existing ones."""
    result = await sync_topics(db, user)
    await db.commit()
    await cache_delete(f"user:me:{user.id}")
    return result


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
        updated_goals = await increment_leetcode_goals(user, db)
        for goal in updated_goals:
            if goal.completed:
                await award_xp(db, user, XPSource.GOAL_COMPLETE, meta={"kind": "daily"})
        await db.commit()
        reloaded = await db.execute(
            select(LeetCodeSolve).where(LeetCodeSolve.id == solve.id).options(selectinload(LeetCodeSolve.problem))
        )
        solve = reloaded.scalar_one()
        await cache_delete(f"user:me:{user.id}")
        for goal in updated_goals:
            await db.refresh(goal)
            await push(user.id, "goal_updated", GoalOut.model_validate(goal).model_dump(mode="json"))
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


@router.delete("/solves", status_code=204)
async def remove_all_solves(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all of the current user's logged solves."""
    await clear_solves(db, user)
    await db.commit()
    await cache_delete(f"user:me:{user.id}")




@router.patch("/problems/{problem_id}", response_model=LeetCodeProblemOut)
async def patch_problem_topics(
    problem_id: int,
    payload: LeetCodeProblemUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    solve_check = await db.execute(
        select(LeetCodeSolve).where(
            LeetCodeSolve.problem_id == problem_id,
            LeetCodeSolve.user_id == user.id,
        ).limit(1)
    )
    if not solve_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Problem not found")
    result = await db.execute(select(LeetCodeProblem).where(LeetCodeProblem.id == problem_id))
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    problem.topics = payload.topics
    await db.commit()
    await db.refresh(problem)
    return LeetCodeProblemOut.model_validate(problem)


@router.get("/review/due", response_model=list[ReviewDueItem])
async def get_review_due(
    include_imported: bool = Query(False, description="Also include imported-only problems (no recorded solution)"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Problems due for spaced-repetition review, most-overdue first."""
    items = await get_due_reviews(db, user, include_imported=include_imported)
    return [ReviewDueItem.model_validate(item) for item in items]


@router.get("/review/stats", response_model=ReviewStatsOut)
async def review_stats(
    tz_offset: int = Query(0, ge=-840, le=840, description="Minutes, as JS Date.getTimezoneOffset()"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Review pipeline overview: box distribution, forecast, done-today."""
    return await get_review_stats(db, user, tz_offset)


@router.post("/review/rebalance")
async def rebalance_review_backlog(
    per_day: int = Query(15, ge=5, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Keep `per_day` most-fragile problems due now; spread the rest over coming days."""
    result = await rebalance_reviews(db, user, per_day)
    await db.commit()
    return result


@router.post("/review/{problem_id}/snooze", status_code=204)
async def snooze_due_review(
    problem_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Push one due problem to tomorrow without changing its box."""
    try:
        await snooze_review(db, user, problem_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/review/{problem_id}/archive", status_code=204)
async def archive_review_route(
    problem_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop reviewing a problem. Logging a new solve for it reactivates review."""
    try:
        await archive_review(db, user, problem_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/todo", response_model=list[LeetCodeTodoOut])
async def list_todos(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The user's to-do backlog of problems to solve, newest first."""
    return await get_todos(db, user)


@router.post("/todo", response_model=LeetCodeTodoOut, status_code=201)
async def create_todo(
    payload: LeetCodeTodoCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        todo = await add_todo(db, user, payload)
        await db.commit()
        return LeetCodeTodoOut.model_validate(todo)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/todo/import", response_model=LCTodoImportResult)
async def import_todos(
    payload: LCTodoImportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-add problems to a list from pasted slugs or LeetCode URLs."""
    try:
        result = await import_todos_by_slugs(db, user, payload.slugs, payload.list_id)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/todo/reorder", status_code=204)
async def reorder_todo_list(
    payload: LCTodoReorder,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist a manual ordering of problems within one list."""
    try:
        await reorder_todos(db, user, payload.list_id, payload.problem_ids)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/todo/lists", response_model=list[LeetCodeTodoListOut])
async def list_todo_lists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The user's named study lists (the Backlog pseudo-list isn't stored)."""
    return await get_todo_lists(db, user)


@router.post("/todo/lists", response_model=LeetCodeTodoListOut, status_code=201)
async def create_list(
    payload: LeetCodeTodoListCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        lst = await create_todo_list(db, user, payload.name)
        await db.commit()
        return LeetCodeTodoListOut.model_validate(lst)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/todo/lists/{list_id}", response_model=LeetCodeTodoListOut)
async def rename_list(
    list_id: int,
    payload: LeetCodeTodoListCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        lst = await rename_todo_list(db, user, list_id, payload.name)
        await db.commit()
        return LeetCodeTodoListOut.model_validate(lst)
    except ValueError as e:
        code = 404 if str(e) == "List not found" else 400
        raise HTTPException(status_code=code, detail=str(e))


@router.delete("/todo/lists/{list_id}", status_code=204)
async def delete_list(
    list_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a list along with the problems on it."""
    try:
        await delete_todo_list(db, user, list_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/todo/{problem_id}", status_code=204)
async def move_todo(
    problem_id: int,
    payload: LeetCodeTodoMove,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Move a single to-do into a different list (null = Backlog)."""
    try:
        await move_todo_to_list(db, user, problem_id, payload.list_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/todo/{problem_id}", status_code=204)
async def delete_todo(
    problem_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await remove_todo(db, user, problem_id)
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