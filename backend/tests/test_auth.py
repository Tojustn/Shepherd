import pytest
from datetime import date

from app.models.goal import Goal
from app.models.streak import Streak, StreakType


@pytest.mark.asyncio
async def test_me_returns_user(client, user, auth_headers):
    response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["xp"] == 0
    assert data["level"] == 1
    assert data["pending_level_up"] is False


@pytest.mark.asyncio
async def test_me_returns_streaks(client, db, user, auth_headers):
    db.add(Streak(user_id=user.id, type=StreakType.GITHUB, current=5, longest=10, last_activity_date=date.today()))
    await db.commit()

    response = await client.get("/api/auth/me", headers=auth_headers)
    data = response.json()
    assert data["github_streak"]["current"] == 5
    assert data["github_streak"]["longest"] == 10
    assert data["leetcode_streak"]["current"] == 0


@pytest.mark.asyncio
async def test_me_returns_empty_streaks_when_none(client, user, auth_headers):
    response = await client.get("/api/auth/me", headers=auth_headers)
    data = response.json()
    assert data["github_streak"]["current"] == 0
    assert data["leetcode_streak"]["current"] == 0


@pytest.mark.asyncio
async def test_me_returns_recent_goals(client, db, user, auth_headers):
    for i in range(3):
        db.add(Goal(user_id=user.id, type="custom", period="daily", target=1, difficulty=1, label=f"Goal {i}"))
    await db.commit()

    response = await client.get("/api/auth/me", headers=auth_headers)
    data = response.json()
    assert len(data["recent_goals"]) == 2  # capped at 2


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    response = await client.get("/api/auth/me")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_clear_level_up(client, db, user, auth_headers):
    user.pending_level_up = True
    await db.commit()

    response = await client.post("/api/auth/clear-level-up", headers=auth_headers)
    assert response.status_code == 204

    await db.refresh(user)
    assert user.pending_level_up is False


@pytest.mark.asyncio
async def test_me_xp_levels(client, db, user, auth_headers):
    user.xp = 150
    user.level = 2
    await db.commit()

    response = await client.get("/api/auth/me", headers=auth_headers)
    data = response.json()
    assert data["xp"] == 150
    assert data["level"] == 2
    assert data["xp_current_level"] == 100
    assert data["xp_next_level"] == 200
