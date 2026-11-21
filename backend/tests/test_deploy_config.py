"""Deployment settings: URL normalisation, production guards, S3 storage, first-admin bootstrap."""

from __future__ import annotations

import io

from app.core.config import Settings


def test_render_postgres_urls_get_the_psycopg_driver():
    s = Settings(database_url="postgres://u:p@host:5432/db")
    assert s.database_url == "postgresql+psycopg://u:p@host:5432/db"
    s = Settings(database_url="postgresql://u:p@host/db")
    assert s.database_url == "postgresql+psycopg://u:p@host/db"
    assert Settings(database_url="sqlite:///./x.db").database_url == "sqlite:///./x.db"


def test_production_refuses_unsafe_settings():
    s = Settings(opswarden_env="production", secret_key="dev-only-insecure-secret-change-me", database_url="sqlite:///./opswarden.db", frontend_origin="http://localhost:3000")
    problems = " ".join(s.production_problems())
    assert "SECRET_KEY" in problems
    assert "DATABASE_URL" in problems
    assert "FRONTEND_ORIGIN" in problems


def test_production_accepts_safe_settings():
    s = Settings(
        opswarden_env="production",
        secret_key="x" * 48,
        database_url="postgres://u:p@h/db",
        frontend_origin="https://opswarden.onrender.com",
        storage_backend="s3",
        s3_bucket="b",
        s3_access_key_id="k",
        s3_secret_access_key="s",
    )
    assert s.production_problems() == []


def test_r2_settings_derive_endpoint_and_are_required_in_production():
    base = dict(opswarden_env="production", secret_key="x" * 48, database_url="postgres://u:p@h/db", frontend_origin="https://ops.example.com")
    incomplete = Settings(**base, storage_backend="r2", r2_bucket="docs")
    assert any("R2_ACCOUNT_ID" in p for p in incomplete.production_problems())
    ok = Settings(**base, storage_backend="r2", r2_account_id="abc123", r2_bucket="docs", r2_access_key_id="k", r2_secret_access_key="s")
    assert ok.production_problems() == []
    assert ok.r2_endpoint_url == "https://abc123.r2.cloudflarestorage.com"
    assert Settings(r2_account_id="abc123", r2_jurisdiction="EU").r2_endpoint_url == "https://abc123.eu.r2.cloudflarestorage.com"
    # Local disk storage is wiped on redeploy, so production refuses it.
    assert any("STORAGE_BACKEND=local" in p for p in Settings(**base, storage_backend="local").production_problems())


def test_development_has_no_production_problems():
    assert Settings(opswarden_env="development").production_problems() == []


class FakeS3:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}

    def head_object(self, Bucket, Key):
        from botocore.exceptions import ClientError

        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def test_s3_provider_round_trip_with_safe_keys():
    from app.integrations.storage.provider import S3StorageProvider

    fake = FakeS3()
    p = S3StorageProvider("bucket", prefix="documents/", client=fake)
    p.put("../evil/key", b"data")
    assert ("bucket", "documents/__evil_key") in fake.objects  # no path traversal into other prefixes
    assert p.exists("../evil/key")
    assert p.get("../evil/key") == b"data"
    p.delete("../evil/key")
    assert not p.exists("../evil/key")


def test_bootstrap_admin_created_once_and_can_sign_in(client, monkeypatch):
    from app import bootstrap
    from app.core.config import settings

    monkeypatch.setattr(settings, "bootstrap_admin_email", "Owner@Example.com")
    monkeypatch.setattr(settings, "bootstrap_admin_password", "A-very-long-Passw0rd!")
    first = bootstrap.ensure_bootstrap_admin()
    assert first is not None
    assert bootstrap.ensure_bootstrap_admin() is None  # second run is a no-op

    r = client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "A-very-long-Passw0rd!"})
    assert r.status_code == 200, r.text
    hdr = {"Authorization": f"Bearer {r.json()['access_token']}"}
    ws = client.get("/api/v1/workspaces", headers=hdr).json()
    assert ws and ws[0]["role"] == "admin"


def test_bootstrap_skipped_without_password(client, monkeypatch):
    from app import bootstrap
    from app.core.config import settings

    monkeypatch.setattr(settings, "bootstrap_admin_email", "someone@example.com")
    monkeypatch.setattr(settings, "bootstrap_admin_password", "")
    assert bootstrap.ensure_bootstrap_admin() is None
