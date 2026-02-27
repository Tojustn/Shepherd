import asyncio
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


async def fetch_commits(access_token: str, owner: str, repo: str, per_page: int = 50) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/commits",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"per_page": per_page},
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_commit_detail(access_token: str, owner: str, repo: str, sha: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/commits/{sha}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_branches(access_token: str, owner: str, repo: str) -> list[dict]:
    """Return each branch with its latest commit sha + date (parallel fetches)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/branches",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"per_page": 15},
        )
        resp.raise_for_status()
        branch_list = resp.json()[:10]

        async def get_head(name: str) -> dict | None:
            r = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/commits",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"sha": name, "per_page": 8},
            )
            if r.status_code == 200 and r.json():
                data = r.json()
                return {
                    "name": name,
                    "sha": data[0]["sha"],
                    "date": data[0]["commit"]["author"]["date"],
                    "commits": [
                        {
                            "sha": c["sha"],
                            "message": c["commit"]["message"].splitlines()[0],
                            "date": c["commit"]["author"]["date"],
                            "author": c["commit"]["author"]["name"],
                        }
                        for c in data
                    ],
                }
            return None

        results = await asyncio.gather(*[get_head(b["name"]) for b in branch_list])
        return [r for r in results if r is not None]


async def fetch_repos(access_token: str, per_page: int = 30) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user/repos",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"sort": "pushed", "per_page": per_page},
        )
        resp.raise_for_status()
        return resp.json()
