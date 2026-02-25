import json
from typing import Any

from app.core.redis import get_redis

DEFAULT_TTL = 300  # 5 minutes


async def cache_get(key: str) -> Any | None:
    redis = await get_redis()
    value = await redis.get(key)
    return json.loads(value) if value else None


async def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    redis = await get_redis()
    await redis.set(key, json.dumps(value), ex=ttl)


async def cache_delete(key: str) -> None:
    redis = await get_redis()
    await redis.delete(key)
