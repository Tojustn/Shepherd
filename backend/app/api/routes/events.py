import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.xp_event import XPEvent
from app.schemas.xp_event import XPEventOut
from app.services import sse_service
from app.services.sse_service import connect, disconnect

router = APIRouter(prefix="/events", tags=["events"])

KEEPALIVE_SECONDS = 25


async def _user_from_token(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    """JWT auth via query param — needed because EventSource can't set headers."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@router.get("/stream")
async def event_stream(current_user: User = Depends(_user_from_token)):
    q = connect(current_user.id)

    async def generate():
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=KEEPALIVE_SECONDS)
                    payload = json.dumps(event["data"])
                    yield f"event: {event['type']}\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            disconnect(current_user.id, q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/unread", response_model=list[XPEventOut])
async def get_unread_events(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return XP events that were earned while the user was offline."""
    result = await db.execute(
        select(XPEvent)
        .where(XPEvent.user_id == current_user.id, XPEvent.notified == False)  # noqa: E712
        .order_by(XPEvent.created_at.asc())
    )
    return result.scalars().all()


@router.post("/mark-read", status_code=204)
async def mark_events_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all unread XP events as notified."""
    await db.execute(
        update(XPEvent)
        .where(XPEvent.user_id == current_user.id, XPEvent.notified == False)  # noqa: E712
        .values(notified=True)
    )
    await db.commit()


@router.post("/dev/test-xp")
async def dev_test_xp(
    amount: int = 50,
    source: str = "commit",
    level_up: bool = False,
    current_user: User = Depends(get_current_user),
):
    if not settings.is_dev:
        raise HTTPException(status_code=404)
    await sse_service.push(current_user.id, "xp_gained", {
        "amount": amount,
        "source": source,
        "level_up": level_up,
        "new_level": current_user.level + (1 if level_up else 0),
        "total_xp": current_user.xp + amount,
    })
    return {"ok": True}


