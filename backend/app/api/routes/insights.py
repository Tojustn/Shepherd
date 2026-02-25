from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/weekly")
async def weekly_digest(db: AsyncSession = Depends(get_db)):
    """Generate AI weekly digest summarising activity, streaks, and goals."""
    # TODO: aggregate stats → call Anthropic/OpenAI → return digest
    return {
        "summary": "Weekly digest not yet generated.",
        "recommendations": [],
        "generated_at": None,
    }


@router.get("/dashboard")
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Return all data needed for the 'week at a glance' screen."""
    return {
        "github": {},
        "leetcode": {},
        "jobs": {},
        "goals": [],
        "streaks": {},
    }
