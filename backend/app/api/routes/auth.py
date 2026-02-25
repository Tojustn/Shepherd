import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.models.user import User

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


@router.post("/logout")
async def logout():
    return {"detail": "Logged out"}