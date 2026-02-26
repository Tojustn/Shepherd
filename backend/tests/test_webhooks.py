import hashlib
import hmac
import json

import pytest


def make_signature(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(client):
    body = json.dumps({"ref": "refs/heads/main"}).encode()
    response = await client.post(
        "/api/webhooks/github",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "push",
            "X-Hub-Signature-256": "sha256=invalidsignature",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_webhook_ignores_non_push_events(client, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.settings, "GITHUB_WEBHOOK_SECRET", "testsecret")

    body = json.dumps({}).encode()
    sig = make_signature(body, "testsecret")

    response = await client.post(
        "/api/webhooks/github",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "star",
            "X-Hub-Signature-256": sig,
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
