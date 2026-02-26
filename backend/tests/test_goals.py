import pytest


@pytest.mark.asyncio
async def test_create_goal(client, user, auth_headers):
    response = await client.post(
        "/api/goals/",
        json={"type": "commits_daily", "period": "daily", "target": 5, "difficulty": 2, "label": "Push 5 commits"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["label"] == "Push 5 commits"
    assert data["target"] == 5
    assert data["difficulty"] == 2
    assert data["current"] == 0
    assert data["active"] is True


@pytest.mark.asyncio
async def test_list_goals_empty(client, user, auth_headers):
    response = await client.get("/api/goals/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_goals_returns_own_goals(client, user, auth_headers):
    await client.post(
        "/api/goals/",
        json={"type": "commits_daily", "period": "daily", "target": 3, "difficulty": 1, "label": "Goal 1"},
        headers=auth_headers,
    )
    await client.post(
        "/api/goals/",
        json={"type": "custom", "period": "daily", "target": 1, "difficulty": 1, "label": "Goal 2"},
        headers=auth_headers,
    )

    response = await client.get("/api/goals/", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_complete_goal_awards_xp(client, db, user, auth_headers):
    create = await client.post(
        "/api/goals/",
        json={"type": "custom", "period": "daily", "target": 1, "difficulty": 3, "label": "Read docs"},
        headers=auth_headers,
    )
    goal_id = create.json()["id"]

    response = await client.patch(f"/api/goals/{goal_id}/complete", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["current"] == response.json()["target"]

    await db.refresh(user)
    assert user.xp == 30  # difficulty 3 = 30 XP


@pytest.mark.asyncio
async def test_complete_goal_no_double_xp(client, db, user, auth_headers):
    create = await client.post(
        "/api/goals/",
        json={"type": "custom", "period": "daily", "target": 1, "difficulty": 1, "label": "Test"},
        headers=auth_headers,
    )
    goal_id = create.json()["id"]

    await client.patch(f"/api/goals/{goal_id}/complete", headers=auth_headers)
    await client.patch(f"/api/goals/{goal_id}/complete", headers=auth_headers)

    await db.refresh(user)
    assert user.xp == 10  # only awarded once


@pytest.mark.asyncio
async def test_delete_goal(client, user, auth_headers):
    create = await client.post(
        "/api/goals/",
        json={"type": "custom", "period": "daily", "target": 1, "difficulty": 1, "label": "Delete me"},
        headers=auth_headers,
    )
    goal_id = create.json()["id"]

    response = await client.delete(f"/api/goals/{goal_id}", headers=auth_headers)
    assert response.status_code == 204

    list_response = await client.get("/api/goals/", headers=auth_headers)
    assert len(list_response.json()) == 0


@pytest.mark.asyncio
async def test_delete_goal_not_found(client, user, auth_headers):
    response = await client.delete("/api/goals/999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_goals_require_auth(client):
    response = await client.get("/api/goals/")
    assert response.status_code == 403
