import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models.user import User
from app.services.cache import cache_get, cache_set
from app.services.github_service import fetch_commit_detail, fetch_commits, fetch_events, fetch_repos

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

    try:
        raw = await fetch_repos(user.github_access_token)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token expired — please log in again")
        raise HTTPException(status_code=502, detail="GitHub API error")

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


@router.get("/repos/{repo_name}/commits")
async def get_repo_commits(repo_name: str, user: User = Depends(get_current_user)):
    if not user.github_access_token:
        raise HTTPException(status_code=400, detail="No GitHub token on file")

    cache_key = f"github:commits:{user.id}:{repo_name}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        raw = await fetch_commits(user.github_access_token, user.username, repo_name)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token expired — please log in again")
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Repo not found")
        raise HTTPException(status_code=502, detail="GitHub API error")

    commits = [
        {
            "sha": c["sha"],
            "message": c["commit"]["message"].splitlines()[0],
            "date": c["commit"]["author"]["date"],
            "author": c["commit"]["author"]["name"],
        }
        for c in raw
    ]

    await cache_set(cache_key, commits, ttl=REPOS_TTL)
    return commits


@router.get("/repos/{repo_name}/commits/{sha}")
async def get_commit_detail(repo_name: str, sha: str, user: User = Depends(get_current_user)):
    if not user.github_access_token:
        raise HTTPException(status_code=400, detail="No GitHub token on file")

    cache_key = f"github:repo:{user.username}/{repo_name}:commit:{sha}:{user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        raw = await fetch_commit_detail(user.github_access_token, user.username, repo_name, sha)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token expired — please log in again")
        raise HTTPException(status_code=502, detail="GitHub API error")

    stats = raw.get("stats", {})
    result = {
        "sha": raw["sha"],
        "message": raw["commit"]["message"],
        "date": raw["commit"]["author"]["date"],
        "author": raw["commit"]["author"]["name"],
        "additions": stats.get("additions", 0),
        "deletions": stats.get("deletions", 0),
        "files": [
            {
                "filename": f["filename"],
                "additions": f["additions"],
                "deletions": f["deletions"],
                "status": f["status"],
            }
            for f in raw.get("files", [])[:10]
        ],
    }

    await cache_set(cache_key, result, ttl=REPOS_TTL)
    return result


@router.get("/activity")
async def get_activity(user: User = Depends(get_current_user)):
    if not user.github_access_token:
        raise HTTPException(status_code=400, detail="No GitHub token on file")

    cache_key = f"github:activity:{user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    try:
        events = await fetch_events(user.username, user.github_access_token)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token expired — please log in again")
        raise HTTPException(status_code=502, detail="GitHub API error")

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
