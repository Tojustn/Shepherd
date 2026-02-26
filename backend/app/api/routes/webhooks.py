import hashlib
import hmac
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.streak import StreakType
from app.models.user import User
from app.models.xp_event import XPSource
from app.services.cache import cache_delete
from app.services.streak_service import update_streak
from app.services.xp_service import award_xp

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Registry: event type -> handler(data, db, user) -> result dict
EventHandler = Callable[[dict, AsyncSession, User], Awaitable[dict[str, Any]]]
_handlers: dict[str, EventHandler] = {}


def github_event(event_type: str):
    def decorator(fn: EventHandler) -> EventHandler:
        _handlers[event_type] = fn
        return fn
    return decorator


def _verify_signature(body: bytes, signature_header: str | None) -> bool:
    if not signature_header or not settings.GITHUB_WEBHOOK_SECRET:
        return False
    expected = "sha256=" + hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)



async def _resolve_user(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()



# @github_event("push") calls github_event("push"), which returns decorator.
# Python then calls decorator(handle_push), registering _handlers["push"] = handle_push.
@github_event("push")
async def handle_push(data: dict, db: AsyncSession, user: User) -> dict[str, Any]:
    commits = data.get("commits", [])
    repo = data.get("repository", {}).get("full_name", "")

    for commit in commits:
        added_files = commit.get("added", [])
        removed_files = commit.get("removed", [])
        modified_files = commit.get("modified", [])

        meta = {
            "sha": commit.get("id"),
            "repo": repo,
            "added_files": added_files,
            "removed_files": removed_files,
            "modified_files": modified_files,
            "files_changed": len(added_files) + len(removed_files) + len(modified_files),
        }

        await award_xp(
            db,
            user,
            XPSource.COMMIT,
            meta=meta, 
        )

    await update_streak(db, user, StreakType.GITHUB)
    await db.commit()
    await cache_delete(f"github:repos:{user.id}")

    return {"status": "ok", "commits_processed": len(commits)}

@router.post("/github")
async def github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
):
    body = await request.body()

    if not _verify_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()

    handler = _handlers.get(x_github_event)
    if handler is None:
        return {"status": "ignored", "event": x_github_event}

    pusher_name = data.get("pusher", {}).get("name") or data.get("sender", {}).get("login")
    if not pusher_name:
        return {"status": "no sender"}

    user = await _resolve_user(db, pusher_name)
    if user is None:
        return {"status": "user not found"}

    return await handler(data, db, user)
