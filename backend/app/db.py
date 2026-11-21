"""Database engine, session, and base model."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import DateTime, String, TypeDecorator, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    kwargs: dict = {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 5, "pool_recycle": 300}
    if url.startswith("postgresql+psycopg"):
        connect_args: dict = {}
        # Supabase's transaction pooler (Supavisor, port 6543) doesn't support prepared statements.
        if ":6543/" in url or "pooler.supabase.com" in url:
            connect_args["prepare_threshold"] = None
        # Supabase requires TLS; add it unless the URL already sets an sslmode.
        if "supabase" in url and "sslmode=" not in url:
            connect_args["sslmode"] = "require"
        if connect_args:
            kwargs["connect_args"] = connect_args
    return kwargs


engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class GUID(TypeDecorator):
    """Portable UUID stored as a 36-char string (works on SQLite and Postgres)."""

    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        return value


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they register with Base.metadata before create_all.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    add_missing_nullable_columns()


def add_missing_nullable_columns() -> list[str]:
    """Additive schema upgrade: create_all never alters existing tables, so new
    nullable columns on existing tables are added here. Never drops or rewrites."""
    from sqlalchemy import inspect, text

    added: list[str] = []
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have or not col.nullable:
                    continue
                ddl = col.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl}'))
                added.append(f"{table.name}.{col.name}")
    return added
