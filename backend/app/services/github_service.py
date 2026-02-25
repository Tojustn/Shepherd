import httpx

GITHUB_API = "https://api.github.com"


async def fetch_user_profile(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_events(username: str, access_token: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/users/{username}/events",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()
