from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.is_dev,
    **({} if _is_sqlite else {"pool_pre_ping": True}),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def create_tables() -> None:
    """Create all tables if they don't exist. Used for SQLite local dev."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _sqlite_dev_migrations(conn)


async def _sqlite_dev_migrations(conn) -> None:
    """
    In-place column migrations for the SQLite dev database. create_all only
    creates missing tables; Alembic (the Postgres path) can't run against the
    async SQLite URL, so existing dev tables get patched here.
    """
    cols = {row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(leetcode_todos)")).fetchall()}
    if not cols:
        return
    if "list_id" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE leetcode_todos ADD COLUMN list_id INTEGER "
            "REFERENCES leetcode_todo_lists(id) ON DELETE CASCADE"
        )
    if "position" not in cols:
        await conn.exec_driver_sql("ALTER TABLE leetcode_todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
    if "section" in cols:
        # Old grouping labels become first-class lists, then the column goes away.
        await conn.exec_driver_sql(
            "INSERT INTO leetcode_todo_lists (user_id, name, position) "
            "SELECT user_id, section, 0 FROM leetcode_todos "
            "WHERE section IS NOT NULL GROUP BY user_id, section"
        )
        await conn.exec_driver_sql(
            "UPDATE leetcode_todos SET list_id = ("
            "  SELECT l.id FROM leetcode_todo_lists l"
            "  WHERE l.user_id = leetcode_todos.user_id AND l.name = leetcode_todos.section"
            ") WHERE section IS NOT NULL"
        )
        await conn.exec_driver_sql(
            "UPDATE leetcode_todos SET position = ("
            "  SELECT COUNT(*) FROM leetcode_todos t2"
            "  WHERE t2.user_id = leetcode_todos.user_id"
            "    AND t2.list_id IS leetcode_todos.list_id"
            "    AND (t2.added_at < leetcode_todos.added_at"
            "         OR (t2.added_at = leetcode_todos.added_at AND t2.id < leetcode_todos.id))"
            ")"
        )
        await conn.exec_driver_sql("ALTER TABLE leetcode_todos DROP COLUMN section")


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
