from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models.user import User
from app.services.cache import cache_get, cache_set
from app.services.github_service import fetch_events, fetch_repos

router = APIRouter(prefix="/github", tags=["github"])

REPOS_TTL = 60 * 5  # 5 minutes


@router.get("/repos")
async def get_repos(user: User = Depends(get_current_user)):
    if not user.github_access_token:
        raise HTTPException(status_code=400, detail="No GitHub token on file")

    cache_key = f"github:repos:{user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    raw = await fetch_repos(user.github_access_token)
    repos = [
        {
            "id": r["id"],
            "name": r["name"],
            "full_name": r["full_name"],
            "description": r.get("description"),
            "url": r["html_url"],
            "language": r.get("language"),
            "stars": r["stargazers_count"],
            "forks": r["forks_count"],
            "pushed_at": r.get("pushed_at"),
            "private": r["private"],
        }
        for r in raw
    ]

    await cache_set(cache_key, repos, ttl=REPOS_TTL)
    return repos


@router.get("/activity")
async def get_activity(user: User = Depends(get_current_user)):
    if not user.github_access_token:
        raise HTTPException(status_code=400, detail="No GitHub token on file")

    cache_key = f"github:activity:{user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    events = await fetch_events(user.username, user.github_access_token)

    pushes = []
    for event in events:
        if event.get("type") != "PushEvent":
            continue
        payload = event.get("payload", {})
        commits = [
            {"message": c["message"].splitlines()[0], "sha": c.get("sha", c.get("id", ""))[:7]}
            for c in payload.get("commits", [])
        ]
        pushes.append({
            "repo": event["repo"]["name"],
            "commits": commits,
            "count": payload.get("size", len(commits)),
            "date": event["created_at"],
        })
        if len(pushes) >= 10:
            break

    await cache_set(cache_key, pushes, ttl=60 * 5)
    return pushes
