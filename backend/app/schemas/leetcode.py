# app/schemas/leetcode.py
from datetime import datetime, timezone
from typing import Annotated
from pydantic import BaseModel, PlainSerializer


def _to_utc_iso(dt: datetime) -> str:
    """Serialize a datetime as UTC ISO 8601 with an explicit offset.

    SQLite (local dev) drops tzinfo, so DB datetimes come back naive even
    though they're stored as UTC. Without a 'Z'/offset the browser parses
    them as local time, shifting solve times and breaking "today" labels.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# datetime that always serializes with an explicit UTC offset
UtcDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]


class LeetCodeProblemOut(BaseModel):
    id: int
    leetcode_id: int
    title: str
    slug: str
    difficulty: str
    topics: list[str]

    model_config = {"from_attributes": True}


class LeetCodeSolveCreate(BaseModel):
    leetcode_id: int
    title: str
    slug: str
    difficulty: str  # easy, medium, hard
    topics: list[str] = []
    code: str          # required
    notes: str | None = None
    language: str | None = None
    time_complexity: str | None = None
    space_complexity: str | None = None
    confidence: int | None = None
    from_review: bool = False  # logged via the review queue (enables graduation/archive)


class LeetCodeSolveOut(BaseModel):
    id: int
    user_id: int
    problem: LeetCodeProblemOut
    notes: str | None
    code: str | None
    language: str | None
    time_complexity: str | None
    space_complexity: str | None
    confidence: int | None
    solved_at: UtcDateTime
    xp_awarded: int = 0
    is_imported: bool

    model_config = {"from_attributes": True}

class LCImportRequest(BaseModel):
    session_cookie: str | None = None


class LCJsonImportSolve(BaseModel):
    language: str | None = None
    time_complexity: str | None = None
    space_complexity: str | None = None
    confidence: int | None = None
    notes: str | None = None
    code: str | None = None
    solved_at: datetime
    is_imported: bool = False


class LCJsonImportProblem(BaseModel):
    leetcode_id: int
    title: str
    slug: str
    difficulty: str
    topics: list[str] = []
    solves: list[LCJsonImportSolve] = []


class LCJsonImportRequest(BaseModel):
    problems: list[LCJsonImportProblem]


class LCJsonImportResult(BaseModel):
    imported: int
    updated: int


class LeetCodeProblemUpdate(BaseModel):
    topics: list[str]


class LeetCodeSolveUpdate(BaseModel):
    notes: str | None = None
    code: str | None = None
    language: str | None = None
    time_complexity: str | None = None
    space_complexity: str | None = None
    confidence: int | None = None
    solved_at: datetime | None = None
    from_review: bool = False  # edited via the review queue → reschedule its Leitner box


class LeetCodeTodoListCreate(BaseModel):
    name: str


class LeetCodeTodoListOut(BaseModel):
    id: int
    name: str
    position: int

    model_config = {"from_attributes": True}


class LeetCodeTodoCreate(BaseModel):
    leetcode_id: int
    title: str
    slug: str
    difficulty: str
    topics: list[str] = []
    list_id: int | None = None  # null = Backlog


class LeetCodeTodoOut(BaseModel):
    id: int
    problem: LeetCodeProblemOut
    added_at: UtcDateTime
    list_id: int | None = None
    position: int = 0
    done: bool = False

    model_config = {"from_attributes": True}


class LCTodoImportRequest(BaseModel):
    slugs: list[str]
    list_id: int | None = None


class LeetCodeTodoMove(BaseModel):
    list_id: int | None = None


class LCTodoReorder(BaseModel):
    list_id: int | None = None
    problem_ids: list[int]


class LCTodoImportResult(BaseModel):
    added: int
    skipped: int
    failed: int


class ReviewDueItem(BaseModel):
    problem: LeetCodeProblemOut
    box: int
    next_review_at: UtcDateTime
    last_solve: LeetCodeSolveOut | None = None
    solve_count: int
    imported_only: bool = False

    model_config = {"from_attributes": True}


class ReviewStatsOut(BaseModel):
    done_today: int
    box_counts: dict[str, int]
    active: int
    graduated: int
    due_now: int
    due_tomorrow: int
    due_week: int


class TopicStat(BaseModel):
    topic: str
    count: int


class LeetCodeStatsOut(BaseModel):
    total: int
    difficulty_breakdown: dict[str, int]
    topic_breakdown: dict[str, int]
    top_topics: list[TopicStat]
    weak_topics: list[TopicStat]
