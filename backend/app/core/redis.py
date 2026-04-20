import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis | None:
    return redis_client


async def init_redis() -> None:
    global redis_client
    try:
        client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        await client.ping()
        redis_client = client
    except Exception as e:
        if settings.is_dev:
            print(f"[WARNING] Redis unavailable — caching disabled: {e}")
        else:
            raise


async def close_redis() -> None:
    if redis_client:
        await redis_client.aclose()
