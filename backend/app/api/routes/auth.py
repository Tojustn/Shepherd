import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.models.goal import Goal, GoalType
from app.schemas.goal import GoalOut
from app.models.streak import Streak, StreakType
from app.models.user import User
from app.schemas.user import StreakInfo, UserOut
from app.services.xp_service import xp_for_level
from app.services.cache import cache_get, cache_set, cache_delete
from app.services.goal_service import ensure_daily_goals

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/github/login")
async def github_login():
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_REDIRECT_URI}"
        "&scope=read:user,user:email,repo"
    )
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_response.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="GitHub auth failed")

        # Fetch user profile from GitHub
        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        github_user = user_response.json()

    # Upsert user
    github_id = str(github_user["id"])
    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    if user:
        user.username = github_user["login"]
        user.email = github_user.get("email")
        user.avatar_url = github_user.get("avatar_url")
        user.github_access_token = access_token
    else:
        user = User(
            github_id=github_id,
            username=github_user["login"],
            email=github_user.get("email"),
            avatar_url=github_user.get("avatar_url"),
            github_access_token=access_token,
        )
        db.add(user)

    await db.flush()
    await db.commit()

    jwt_token = create_access_token(user.id)
    return RedirectResponse(f"{settings.FRONTEND_URL}/auth/callback?token={jwt_token}")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cache_key = f"user:me:{user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(Streak).where(Streak.user_id == user.id))
    streaks = {s.type: s for s in result.scalars().all()}

    goals_result = await db.execute(
        select(Goal)
        .where(Goal.user_id == user.id, Goal.active == True, Goal.type == GoalType.CUSTOM)
        .order_by(Goal.created_at.desc())
        .limit(3)
    )
    recent_goals = goals_result.scalars().all()
    daily_quests = await ensure_daily_goals(user, db)
    await db.commit()

    def to_streak_info(s: Streak | None) -> StreakInfo:
        if not s:
            return StreakInfo(current=0, longest=0, last_activity_date=None)
        return StreakInfo(current=s.current, longest=s.longest, last_activity_date=s.last_activity_date)

    data = {
        "id": user.id,
        "github_id": user.github_id,
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "xp": user.xp,
        "level": user.level,
        "xp_current_level": xp_for_level(user.level) if user.level > 1 else 0,
        "xp_next_level": xp_for_level(user.level + 1),
        "github_streak": to_streak_info(streaks.get(StreakType.GITHUB)),
        "leetcode_streak": to_streak_info(streaks.get(StreakType.LEETCODE)),
        "recent_goals": [GoalOut.model_validate(g) for g in recent_goals],
        "daily_quests": [GoalOut.model_validate(g) for g in daily_quests],
        "pending_level_up": user.pending_level_up,
        "created_at": user.created_at,
    }

    serialized = UserOut(**data).model_dump(mode="json")
    await cache_set(cache_key, serialized, ttl=60 * 5)
    return data


@router.post("/clear-level-up", status_code=204)
async def clear_level_up(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.pending_level_up = False
    await db.commit()


@router.post("/logout")
async def logout():
    return {"detail": "Logged out"}