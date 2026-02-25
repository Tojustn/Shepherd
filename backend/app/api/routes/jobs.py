from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.job import JobCreate, JobOut, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/", response_model=list[JobOut])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    # TODO: filter by authenticated user
    return []


@router.post("/", response_model=JobOut, status_code=201)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db)):
    # TODO: persist to DB
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.patch("/{job_id}", response_model=JobOut)
async def update_job(job_id: int, payload: JobUpdate, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented yet")
