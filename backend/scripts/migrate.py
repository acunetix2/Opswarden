"""Create or update the OpsWarden schema on a Postgres database (e.g. Supabase).

Usage (from backend/):
  .venv\\Scripts\\python.exe scripts\\migrate.py            # read-only: compare database with the models
  .venv\\Scripts\\python.exe scripts\\migrate.py --apply    # create missing tables, add missing nullable columns

The database URL comes from MIGRATE_DATABASE_URL, else SUPABASE_DB_URL, else
DATABASE_URL (from the environment or .env). It never drops or rewrites
anything: existing tables, columns and rows are left as they are. Missing
NOT NULL columns without a default are reported, not added.
The URL and password are never printed.
"""
from __future__ import annotations

import os
import ssl
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _dotenv(name: str) -> str:
    """Last value of `name` in backend/.env (later lines win, like python-dotenv)."""
    env = ROOT / ".env"
    value = ""
    if env.exists():
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith(f"{name}="):
                value = line.split("=", 1)[1].strip()
    return value


def _url() -> str:
    for name in ("MIGRATE_DATABASE_URL", "SUPABASE_DB_URL", "DATABASE_URL"):
        v = os.environ.get(name) or _dotenv(name)
        if v and not v.startswith("sqlite"):
            return v
    raise SystemExit("No Postgres URL found (set SUPABASE_DB_URL or MIGRATE_DATABASE_URL).")


def _engine():
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url

    url = make_url(_url().replace("postgres://", "postgresql://", 1))
    try:
        import psycopg  # noqa: F401

        url = url.set(drivername="postgresql+psycopg")
        connect_args: dict = {"sslmode": "require", "prepare_threshold": None}
    except ImportError:
        # Pure-Python fallback (used where compiled drivers are blocked).
        url = url.set(drivername="postgresql+pg8000")
        ca_file = os.environ.get("SUPABASE_CA_FILE") or _dotenv("SUPABASE_CA_FILE")
        if ca_file:
            ctx = ssl.create_default_context(cafile=ca_file)  # full verification against Supabase's CA
        else:
            # Same guarantee as libpq sslmode=require (what the app uses): encrypted, CA not verified.
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        connect_args = {"ssl_context": ctx}
    print(f"Target: {url.host}:{url.port}/{url.database} as {url.username} via {url.drivername}")
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def main() -> int:
    apply = "--apply" in sys.argv
    # Import models without starting the app (no seed, no bootstrap).
    os.environ.setdefault("SEED_DEMO_DATA", "false")
    from sqlalchemy import inspect, text
    from sqlalchemy.schema import CreateTable

    from app import models  # noqa: F401
    from app.db import Base

    engine = _engine()
    with engine.connect() as conn:
        version = conn.execute(text("select version()")).scalar()
        print("Connected:", str(version).split(",")[0])

    insp = inspect(engine)
    existing = set(insp.get_table_names(schema="public"))
    wanted = Base.metadata.sorted_tables
    missing_tables = [t for t in wanted if t.name not in existing]
    add_columns: list[tuple[str, str, str]] = []
    blocked: list[str] = []
    for t in wanted:
        if t.name not in existing:
            continue
        have = {c["name"] for c in insp.get_columns(t.name, schema="public")}
        for col in t.columns:
            if col.name in have:
                continue
            ddl_type = col.type.compile(dialect=engine.dialect)
            if not col.nullable and col.server_default is None:
                blocked.append(f"{t.name}.{col.name} ({ddl_type} NOT NULL, no default)")
            else:
                add_columns.append((t.name, col.name, ddl_type))

    unknown = sorted(existing - {t.name for t in wanted})
    print(f"\nModel tables: {len(wanted)}. In database: {len(existing & {t.name for t in wanted})}. Missing: {len(missing_tables)}.")
    for t in missing_tables:
        print("  + create table", t.name)
    for table, col, typ in add_columns:
        print(f"  + add column {table}.{col} {typ}")
    for b in blocked:
        print("  ! needs a manual migration:", b)
    if unknown:
        print("  (other tables left untouched:", ", ".join(unknown) + ")")
    if not missing_tables and not add_columns:
        print("Schema is up to date.")

    if not apply:
        print("\nRead-only check. Re-run with --apply to make these changes.")
        return 1 if blocked else 0

    with engine.begin() as conn:
        for t in missing_tables:
            conn.execute(CreateTable(t, if_not_exists=True))
            for idx in t.indexes:
                idx.create(conn, checkfirst=True)
        for table, col, typ in add_columns:
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" {typ}'))
        # Supabase exposes `public` through its REST API to the anon/authenticated roles.
        # RLS with no policies denies them everything; the API server connects as the
        # table owner, which bypasses RLS, so the app itself is unaffected.
        for t in wanted:
            conn.execute(text(f'ALTER TABLE "{t.name}" ENABLE ROW LEVEL SECURITY'))
    print("\nApplied.")

    insp = inspect(engine)
    now = set(insp.get_table_names(schema="public"))
    still = [t.name for t in wanted if t.name not in now]
    print("Verification:", "all model tables present." if not still else f"still missing {still}")
    with engine.connect() as conn:
        open_tables = conn.execute(
            text("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                 "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")
        ).scalars().all()
    rls_gaps = sorted(set(open_tables) & {t.name for t in wanted})
    print("Row-level security:", "enabled on all model tables." if not rls_gaps else f"MISSING on {rls_gaps}")
    return 1 if still or blocked or rls_gaps else 0


if __name__ == "__main__":
    raise SystemExit(main())
