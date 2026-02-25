from fastapi import APIRouter

from app.api.routes import auth, github, goals, insights, jobs, leetcode, webhooks

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(github.router)
api_router.include_router(leetcode.router)
api_router.include_router(jobs.router)
api_router.include_router(goals.router)
api_router.include_router(insights.router)
api_router.include_router(webhooks.router)
