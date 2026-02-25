from anthropic import AsyncAnthropic

from app.core.config import settings

client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def generate_weekly_digest(stats: dict) -> str:
    prompt = f"""You are a developer productivity coach. Given the following weekly stats, write a concise, encouraging digest (3-5 sentences) with one concrete focus recommendation.

Stats:
{stats}

Keep it direct, specific, and motivating."""

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
