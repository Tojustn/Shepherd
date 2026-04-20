# Shepherd

**Live at [shepherd-app.dev](https://shepherd-app.dev)**

Personal developer command center with gamification. Earn XP and level up for pushing commits and solving LeetCode problems. Track GitHub and LeetCode streaks.

## What it does

Shepherd turns your daily dev work into a progression system. Every GitHub push and LeetCode solve earns XP toward a level — streaks multiply your momentum, and daily quests give you concrete targets to hit. The goal is to make the habit of shipping and practicing feel more tangible.

## Stack

- **Frontend** — Next.js, Tailwind CSS, shadcn/ui
- **Backend** — Python FastAPI, PostgreSQL, Redis
- **Auth** — GitHub OAuth + JWT

## Architecture

GitHub sends a webhook on every push → FastAPI verifies the signature, awards XP, and writes an `XPEvent` to Postgres → the event is pushed to the connected client over SSE → Next.js renders an XP toast in real time. If the user is offline, undelivered events are fetched on next login and shown as a "while you were away" summary.

LeetCode stats are polled on demand via their public GraphQL API. All hot data (user profile, streaks) is cached in Redis.

## Running locally

```bash
# Backend
cd backend
cp .env.example .env   # fill in DB, Redis, GitHub OAuth credentials
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev
```

In dev mode, skip GitHub OAuth by hitting `http://localhost:8000/api/auth/dev-login`.
