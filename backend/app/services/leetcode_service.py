import httpx

LEETCODE_GRAPHQL = "https://leetcode.com/graphql"

STATS_QUERY = """
query getUserProfile($username: String!) {
  matchedUser(username: $username) {
    submitStats: submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
  }
}
"""


async def fetch_solved_stats(username: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            LEETCODE_GRAPHQL,
            json={"query": STATS_QUERY, "variables": {"username": username}},
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        counts = (
            data.get("data", {})
            .get("matchedUser", {})
            .get("submitStats", {})
            .get("acSubmissionNum", [])
        )
        result = {"easy": 0, "medium": 0, "hard": 0, "total": 0}
        for item in counts:
            diff = item["difficulty"].lower()
            if diff in result:
                result[diff] = item["count"]
            if diff == "all":
                result["total"] = item["count"]
        return result
