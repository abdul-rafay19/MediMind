"""MediMind Database — Async SQLAlchemy setup"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

import ssl as _ssl
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


def _prepare_db_url(url: str):
    """
    Accepts SQLite (default) or a hosted Postgres URL such as the one Neon/Supabase
    gives you (postgres://... ?sslmode=require&channel_binding=require).
    asyncpg doesn't understand those query params, so translate them.
    Returns (clean_url, connect_args).
    """
    connect_args = {}
    if url.startswith(("postgres://", "postgresql://")):
        url = "postgresql+asyncpg://" + url.split("://", 1)[1]
    if url.startswith("postgresql+asyncpg://"):
        parts = urlsplit(url)
        q = dict(parse_qsl(parts.query))
        sslmode = q.pop("sslmode", None)
        q.pop("channel_binding", None)
        ssl_q = q.pop("ssl", None)
        if (sslmode and sslmode != "disable") or ssl_q in ("require", "true", "1"):
            connect_args["ssl"] = _ssl.create_default_context()
        url = urlunsplit(parts._replace(query=urlencode(q)))
    return url, connect_args


_db_url, _connect_args = _prepare_db_url(settings.DATABASE_URL)
_engine_kwargs = {"pool_pre_ping": True}
if not _db_url.startswith("sqlite"):
    _engine_kwargs.update(pool_size=5, max_overflow=2, pool_recycle=300)

engine = create_async_engine(
    _db_url,
    echo=settings.DEBUG,
    future=True,
    connect_args=_connect_args,
    **_engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables on startup."""
    # Import ALL models here so SQLAlchemy registers them
    from app.models import user, session, medication  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ Database tables initialized")


async def get_db():
    """Dependency: yields an async DB session, commits on success."""
    async with AsyncSessionLocal() as db_session:
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise
        finally:
            await db_session.close()
