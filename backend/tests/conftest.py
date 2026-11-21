from __future__ import annotations

import os
import tempfile

import pytest

# Isolated, ephemeral environment before app modules import settings.
_tmp = tempfile.mkdtemp(prefix="opswarden_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["OPSWARDEN_ENV"] = "test"
# Never let a developer's .env reach real services from the test suite:
# environment variables take precedence over .env in pydantic-settings.
for _name in (
    "LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "GEMINI_API_KEY", "OCR_PROVIDER", "TTS_PROVIDER",
    "SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM",
    "S3_BUCKET", "S3_ENDPOINT_URL", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
    "R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_JURISDICTION",
    "SUPABASE_URL", "SUPABASE_JWT_SECRET", "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_PASSWORD",
):
    os.environ[_name] = ""
os.environ["STORAGE_BACKEND"] = "local"
os.environ["AUTH_PROVIDER"] = "local"


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.db import Base, engine
    from app.main import app

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)
