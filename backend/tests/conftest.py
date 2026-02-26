import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.database import Base, get_db
from app.core.redis import get_redis
from app.core.security import create_access_token
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def db():
    engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def user(db: AsyncSession) -> User:
    u = User(github_id="test123", username="testuser", xp=0, level=1, pending_level_up=False)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest.fixture
def auth_headers(user: User) -> dict:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="function")
async def client(db: AsyncSession):
    from unittest.mock import AsyncMock
    from main import app

    async def override_get_db():
        yield db

    async def override_get_redis():
        mock = AsyncMock()
        mock.get.return_value = None
        mock.set.return_value = None
        mock.delete.return_value = None
        return mock

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
