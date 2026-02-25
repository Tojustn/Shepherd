from datetime import date, datetime

from pydantic import BaseModel

from app.models.job import JobStatus


class JobCreate(BaseModel):
    company: str
    role: str
    status: JobStatus = JobStatus.APPLIED
    url: str | None = None
    notes: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    follow_up_date: date | None = None
    applied_at: date | None = None


class JobUpdate(BaseModel):
    company: str | None = None
    role: str | None = None
    status: JobStatus | None = None
    url: str | None = None
    notes: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    follow_up_date: date | None = None
    applied_at: date | None = None


class JobOut(JobCreate):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
