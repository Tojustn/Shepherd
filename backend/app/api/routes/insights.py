from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/weekly")
async def weekly_digest(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI weekly digest summarising activity, streaks, and goals."""
    # TODO: aggregate stats → call Anthropic/OpenAI → return digest
    return {
        "summary": "Weekly digest not yet generated.",
        "recommendations": [],
        "generated_at": None,
    }


@router.get("/dashboard")
async def dashboard_summary(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all data needed for the 'week at a glance' screen."""
    return {
        "github": {},
        "leetcode": {},
        "jobs": {},
        "goals": [],
        "streaks": {},
    }
