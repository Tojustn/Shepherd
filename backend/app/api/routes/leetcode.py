from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/leetcode", tags=["leetcode"])


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Return solved counts, difficulty breakdown, and recent submissions."""
    # TODO: scrape LeetCode GraphQL API
    return {"easy": 0, "medium": 0, "hard": 0, "total": 0, "recent": []}


@router.get("/streak")
async def get_streak():
    return {"current": 0, "longest": 0}


@router.get("/contests")
async def get_contests():
    return {"contests": []}
