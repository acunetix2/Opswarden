"""Check a Render deployment's settings before pushing the button. Never prints secrets.

Usage (from backend/):
  .venv\\Scripts\\python.exe scripts\\preflight_render.py https://your-frontend.example.com

Reads backend/.env, applies the values render.yaml sets for production, and:
  1. lists anything that would stop the API starting in production,
  2. writes, reads and deletes one small test object in the R2 bucket,
  3. checks that the database URL is the Supabase pooler (Render has no IPv6).
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    origin = args[0].rstrip("/") if args else ""
    # --jurisdiction=none|eu overrides R2_JURISDICTION from .env, to test which endpoint the bucket lives on.
    override = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--jurisdiction=")), None)
    os.chdir(ROOT)
    from app.core.config import Settings

    base = Settings()
    db_url = os.environ.get("DATABASE_URL_RENDER") or (base.database_url if not base.database_url.startswith("sqlite") else "")
    if not db_url:
        from scripts.migrate import _dotenv  # type: ignore[import-not-found]

        db_url = _dotenv("SUPABASE_DB_URL")
    s = Settings(opswarden_env="production", storage_backend="r2", database_url=db_url, frontend_origin=origin or base.frontend_origin,
                 secret_key="x" * 44, auth_provider="local",
                 **({"r2_jurisdiction": "" if override == "none" else override} if override is not None else {}))

    failures = 0
    print("1. Production settings")
    problems = s.production_problems()
    for p in problems:
        print("   !", p)
    print("   ok" if not problems else f"   {len(problems)} problem(s)")
    failures += len(problems)

    print("2. Cloudflare R2")
    print(f"   endpoint host: {s.r2_endpoint_url.split('//')[-1] or '(missing)'}  bucket: {s.r2_bucket or '(missing)'}")
    try:
        from app.integrations.storage.provider import S3StorageProvider

        store = S3StorageProvider(s.r2_bucket, region="auto", endpoint_url=s.r2_endpoint_url,
                                  access_key_id=s.r2_access_key_id, secret_access_key=s.r2_secret_access_key, prefix=s.r2_prefix)
        key = f"preflight_{uuid.uuid4().hex}"
        store.put(key, b"opswarden preflight")
        ok = store.get(key) == b"opswarden preflight" and store.exists(key)
        store.delete(key)
        gone = not store.exists(key)
        print(f"   write/read: {'ok' if ok else 'MISMATCH'}   delete: {'ok' if gone else 'FAILED'}")
        failures += (not ok) + (not gone)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        for secret in (s.r2_secret_access_key, s.r2_access_key_id):
            if secret:
                msg = msg.replace(secret, "***")
        print(f"   FAILED: {type(exc).__name__}: {msg[:200]}")
        failures += 1

    print("3. Database URL")
    pooler = "pooler.supabase.com" in db_url
    print(f"   {'ok: Supabase pooler' if pooler else '! not the Supabase pooler; Render cannot reach IPv6-only db.<ref>.supabase.co'}")
    failures += not pooler

    print("\nREADY FOR RENDER" if not failures else f"\n{failures} issue(s) to fix before deploying")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
