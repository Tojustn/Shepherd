from fastapi import APIRouter

from app.api.routes import auth, events, github, goals, insights, leetcode, webhooks

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(events.router)
api_router.include_router(github.router)
api_router.include_router(leetcode.router)
api_router.include_router(goals.router)
api_router.include_router(insights.router)
api_router.include_router(webhooks.router)
