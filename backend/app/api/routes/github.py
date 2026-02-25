from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/activity")
async def get_activity(db: AsyncSession = Depends(get_db)):
    """Return commit/PR/repo activity for the authenticated user."""
    # TODO: fetch from GitHub API, cache with Redis
    return {"commits": [], "pull_requests": [], "repos": []}


@router.get("/streak")
async def get_streak(db: AsyncSession = Depends(get_db)):
    """Return current GitHub commit streak."""
    return {"current": 0, "longest": 0}
