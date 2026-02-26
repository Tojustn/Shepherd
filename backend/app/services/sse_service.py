import asyncio
from collections import defaultdict

# user_id -> list of active queues (one per open SSE connection)
_queues: dict[int, list[asyncio.Queue]] = defaultdict(list)


def connect(user_id: int) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _queues[user_id].append(q)
    return q


def disconnect(user_id: int, q: asyncio.Queue) -> None:
    try:
        _queues[user_id].remove(q)
    except ValueError:
        pass


async def push(user_id: int, event_type: str, data: dict) -> None:
    for q in list(_queues.get(user_id, [])):
        await q.put({"type": event_type, "data": data})
