# app/schemas/leetcode.py
from datetime import datetime
from pydantic import BaseModel


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
    solved_at: datetime
    xp_awarded: int = 0
    is_imported: bool

    model_config = {"from_attributes": True}

class LCImportRequest(BaseModel):
    session_cookie: str | None = None


class LeetCodeSolveUpdate(BaseModel):
    notes: str | None = None
    code: str | None = None
    language: str | None = None
    time_complexity: str | None = None
    space_complexity: str | None = None
    confidence: int | None = None


class TopicStat(BaseModel):
    topic: str
    count: int


class LeetCodeStatsOut(BaseModel):
    total: int
    difficulty_breakdown: dict[str, int]
    topic_breakdown: dict[str, int]
    top_topics: list[TopicStat]
    weak_topics: list[TopicStat]
