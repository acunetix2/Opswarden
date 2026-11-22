"""Application configuration loaded from environment variables.

Secrets never have hardcoded production defaults. See `.env.example`.
"""
from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
        case_sensitive=False,
    )

    # App
    opswarden_env: str = Field(default="development")
    secret_key: str = Field(default="dev-only-insecure-secret-change-me")
    access_token_expire_minutes: int = Field(default=720)

    # Database. SQLite locally; Postgres in production (Render gives postgres:// URLs, normalised below).
    database_url: str = Field(default="sqlite:///./opswarden.db")

    # Storage: "local" (STORAGE_DIR on disk), "r2" (Cloudflare R2, private bucket) or
    # "s3" (any other S3-compatible bucket).
    storage_backend: str = Field(default="local")
    # Cloudflare R2. Endpoint is derived: https://<account>.r2.cloudflarestorage.com
    # (or <account>.eu.r2... with R2_JURISDICTION=eu). The bucket must stay private;
    # the API streams files to signed-in users, so no public r2.dev URL is used.
    r2_account_id: str = Field(default="")
    r2_bucket: str = Field(default="")
    r2_access_key_id: str = Field(default="")
    r2_secret_access_key: str = Field(default="")
    r2_jurisdiction: str = Field(default="")
    r2_prefix: str = Field(default="documents/")
    storage_dir: str = Field(default="./_storage")
    max_upload_bytes: int = Field(default=15 * 1024 * 1024)
    s3_bucket: str = Field(default="")
    s3_region: str = Field(default="auto")
    s3_endpoint_url: str = Field(default="")  # required for R2/B2; leave blank for AWS
    s3_access_key_id: str = Field(default="")
    s3_secret_access_key: str = Field(default="")
    s3_prefix: str = Field(default="documents/")

    # Authentication: "local" (built-in email + password, used in development and tests) or
    # "supabase" (Supabase Auth issues the tokens; this API verifies them and maps users by email).
    auth_provider: str = Field(default="local")
    supabase_url: str = Field(default="")  # e.g. https://abcd1234.supabase.co
    # Only for projects still on the legacy shared JWT secret (HS256). New projects use
    # asymmetric signing keys, verified through the project's public JWKS; leave this blank for those.
    supabase_jwt_secret: str = Field(default="")
    supabase_jwt_audience: str = Field(default="authenticated")

    # First admin for a fresh production database (no demo seed there). Created once if the email doesn't exist.
    bootstrap_admin_email: str = Field(default="")
    bootstrap_admin_password: str = Field(default="")
    bootstrap_admin_name: str = Field(default="Administrator")
    bootstrap_workspace_name: str = Field(default="OpsWarden")

    # Comparison tolerances (strings in env -> Decimal)
    price_tolerance: Decimal = Field(default=Decimal("0.01"))
    quantity_tolerance: Decimal = Field(default=Decimal("0"))

    # LLM provider
    llm_provider: str = Field(default="")
    llm_api_key: str = Field(default="")
    # Blank means each provider's own default (see app/agents/llm_provider.py).
    llm_model: str = Field(default="")
    # Google Gemini key, shared by OCR and text-to-speech when they use the "gemini" provider.
    gemini_api_key: str = Field(default="")

    # OCR for scans and photos ("gemini" or blank to disable). The vision model only
    # transcribes what is printed; amounts are re-checked deterministically afterwards.
    ocr_provider: str = Field(default="gemini")
    ocr_model: str = Field(default="gemini-3.5-flash")

    # Text-to-speech ("gemini", "groq", or blank to disable). Groq uses LLM_API_KEY and
    # needs the Orpheus model terms accepted in the Groq console first.
    tts_provider: str = Field(default="gemini")
    tts_model: str = Field(default="")
    tts_voice: str = Field(default="")

    # Speech-to-text for talking to Warden ("groq" uses Whisper with LLM_API_KEY; blank disables).
    stt_provider: str = Field(default="groq")
    stt_model: str = Field(default="whisper-large-v3-turbo")
    stt_language: str = Field(default="")  # e.g. "en"; blank lets Whisper detect it

    # Call limits (see app/agents/llm_guard.py)
    llm_max_calls_per_hour: int = Field(default=60)
    llm_cache_ttl_seconds: int = Field(default=3600)
    llm_error_cooldown_seconds: int = Field(default=60)

    # Email (SMTP). Sending is enabled only when host and from-address are set.
    smtp_host: str = Field(default="")
    smtp_port: int = Field(default=587)
    smtp_username: str = Field(default="")
    smtp_password: str = Field(default="")
    smtp_from: str = Field(default="")
    # Display name inboxes show for SMTP_FROM, e.g. "OpsWarden <support@...>". Ignored if SMTP_FROM already has one.
    smtp_from_name: str = Field(default="OpsWarden")
    smtp_use_tls: bool = Field(default=True)
    # Invoices by email. Forwarded mail arrives at invoices+<token>@INBOUND_EMAIL_DOMAIN and is
    # posted to /api/v1/inbound/email by the Cloudflare Email Worker with AUTOMATION_SECRET.
    inbound_email_domain: str = Field(default="")
    # Shared secret for the inbound email webhook and the scheduled follow-up run. Empty disables both.
    automation_secret: str = Field(default="")

    # Self-service sign-up: anyone can create an account and a new workspace they
    # administer. It never grants access to an existing workspace; that needs an invitation.
    allow_signup: bool = Field(default=True)
    max_workspaces_per_user: int = Field(default=10)
    # Sign-up email verification: a 6-digit code, valid for this long, with limited guesses and resends.
    signup_code_ttl_minutes: int = Field(default=10)
    signup_code_max_attempts: int = Field(default=5)
    signup_code_max_sends: int = Field(default=5)
    signup_code_resend_seconds: int = Field(default=30)

    # One-time links
    password_reset_ttl_minutes: int = Field(default=30)
    invitation_ttl_days: int = Field(default=7)

    # CORS / frontend
    frontend_origin: str = Field(default="http://localhost:3000")

    # Demo
    seed_demo_data: bool = Field(default=True)

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, v: str) -> str:
        """Render and Heroku hand out postgres:// URLs; SQLAlchemy needs an explicit driver."""
        v = v.strip()
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def is_production(self) -> bool:
        return self.opswarden_env.lower() in {"production", "prod"}

    @property
    def uses_supabase_auth(self) -> bool:
        return self.auth_provider.lower().strip() == "supabase"

    def production_problems(self) -> list[str]:
        """Misconfigurations that must stop a production start rather than run insecurely or lose data."""
        problems: list[str] = []
        if not self.is_production:
            return problems
        if self.secret_key.startswith("dev-only") or self.secret_key.startswith("change-me") or len(self.secret_key) < 32:
            problems.append("SECRET_KEY must be set to a random value of at least 32 characters.")
        if self.database_url.startswith("sqlite") and "/var/data/" not in self.database_url:
            problems.append("DATABASE_URL points at a local SQLite file that is lost on redeploy. Use Postgres or a persistent disk path.")
        if self.storage_backend == "s3" and not (self.s3_bucket and self.s3_access_key_id and self.s3_secret_access_key):
            problems.append("STORAGE_BACKEND=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.")
        if self.storage_backend == "r2" and not (self.r2_account_id and self.r2_bucket and self.r2_access_key_id and self.r2_secret_access_key):
            problems.append("STORAGE_BACKEND=r2 needs R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.")
        if self.storage_backend == "local" and "/var/data/" not in str(self.storage_dir):
            problems.append("STORAGE_BACKEND=local keeps documents on the server's disk, which is wiped on redeploy. Use STORAGE_BACKEND=r2.")
        if self.frontend_origin.startswith("http://localhost"):
            problems.append("FRONTEND_ORIGIN must be your deployed frontend URL, e.g. https://opswarden.onrender.com.")
        if self.uses_supabase_auth and not self.supabase_url.startswith("https://"):
            problems.append("AUTH_PROVIDER=supabase needs SUPABASE_URL, e.g. https://<project>.supabase.co.")
        return problems

    @property
    def r2_endpoint_url(self) -> str:
        account = self.r2_account_id.strip()
        if not account:
            return ""
        jurisdiction = self.r2_jurisdiction.strip().lower()
        return f"https://{account}.{jurisdiction + '.' if jurisdiction else ''}r2.cloudflarestorage.com"

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
