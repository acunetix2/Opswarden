"""Password hashing and JWT access tokens."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    # bcrypt operates on bytes and caps input at 72 bytes.
    pw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


# ---- Supabase Auth -------------------------------------------------------------------

_jwks_client: jwt.PyJWKClient | None = None


def _supabase_jwks() -> jwt.PyJWKClient:
    """Public signing keys of the Supabase project, cached in memory (PyJWKClient refreshes on unknown kid)."""
    global _jwks_client
    if _jwks_client is None:
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=10)
    return _jwks_client


def decode_supabase_token(token: str) -> dict[str, Any] | None:
    """Verify a Supabase access token: signature, expiry, audience and issuer.

    Uses the legacy shared secret (HS256) when SUPABASE_JWT_SECRET is set,
    otherwise the project's asymmetric keys from its JWKS endpoint.
    """
    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1"
    options = {"require": ["exp", "sub"]}
    try:
        if settings.supabase_jwt_secret:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
                issuer=issuer,
                options=options,
            )
        signing_key = _supabase_jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience=settings.supabase_jwt_audience,
            issuer=issuer,
            options=options,
        )
    except jwt.PyJWTError:  # includes PyJWKClientError (unknown key, JWKS unreachable)
        return None


MIN_PASSWORD_LENGTH = 10


def password_problem(password: str) -> str | None:
    """Server-side password policy. Returns a user-facing problem or None."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if len(password.encode("utf-8")) > 72:
        return "Use at most 72 bytes."
    if password.isalpha() or password.isdigit():
        return "Mix letters with numbers or symbols."
    return None


def new_one_time_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash). Only the hash is persisted."""
    import hashlib
    import secrets

    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode("utf-8")).hexdigest()


def hash_one_time_token(raw: str) -> str:
    import hashlib

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
