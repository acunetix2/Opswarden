from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.errors import ApiError, bad_request, unauthorized
from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    hash_one_time_token,
    hash_password,
    new_one_time_token,
    password_problem,
    verify_password,
)
from app.db import get_db, utcnow
from app.integrations.email.base import EmailMessage
from app.integrations.email.provider import get_email_provider
from app.models.access import PasswordResetToken
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.auth import LoginRequest, TokenResponse, UserOut, WorkspaceOut
from app.services import audit_service

router = APIRouter(tags=["auth"])
log = get_logger("opswarden.auth")


def require_local_auth() -> None:
    """Password endpoints only exist in local mode; with Supabase Auth the browser talks to Supabase."""
    if settings.uses_supabase_auth:
        raise bad_request("AUTH_EXTERNAL", "Sign-in, sign-up and password resets are handled by Supabase Auth.")


@router.get("/auth/config")
def auth_config() -> dict:
    """Public: tells the frontend which sign-in flow to use. Never exposes secrets."""
    return {"provider": "supabase" if settings.uses_supabase_auth else "local"}


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    require_local_auth()
    user = db.execute(
        select(User).where(User.email == payload.email.lower())
    ).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise unauthorized("Invalid email or password.")
    token = create_access_token(subject=user.id, extra={"email": user.email})
    return TokenResponse(access_token=token)


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user.id, email=user.email, full_name=user.full_name)


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[WorkspaceOut]:
    rows = db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
    ).all()
    return [WorkspaceOut(id=ws.id, name=ws.name, role=role) for ws, role in rows]


# ---- Password reset ----------------------------------------------------------

_RESET_WINDOW_SECONDS = 15 * 60
_RESET_MAX_PER_WINDOW = 3
_reset_attempts: dict[str, deque[float]] = defaultdict(deque)


def _throttled(key: str) -> bool:
    """Small in-process limiter so the reset endpoint can't be used to spam a mailbox."""
    now = time.monotonic()
    q = _reset_attempts[key]
    while q and now - q[0] > _RESET_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= _RESET_MAX_PER_WINDOW:
        return True
    q.append(now)
    return False


def reset_url(raw_token: str) -> str:
    return f"{settings.frontend_origin.rstrip('/')}/reset-password?token={raw_token}"


def issue_reset_token(db: Session, user: User, created_by: str | None = None) -> str:
    """Invalidate earlier unused tokens and issue a fresh one. Returns the raw token."""
    now = utcnow()
    for t in db.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
    ).scalars():
        t.used_at = now
    raw, digest = new_one_time_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=digest,
            expires_at=now + timedelta(minutes=settings.password_reset_ttl_minutes),
            created_by=created_by,
        )
    )
    return raw


class ResetRequest(BaseModel):
    email: EmailStr


class ResetRequestResponse(BaseModel):
    message: str
    # Development only: lets the demo complete without an email provider.
    dev_reset_url: str | None = None


GENERIC_RESET_MESSAGE = "If an account exists for that email, a reset link is on its way."


@router.post("/auth/password-reset/request", response_model=ResetRequestResponse, status_code=202)
def request_password_reset(payload: ResetRequest, db: Session = Depends(get_db)) -> ResetRequestResponse:
    require_local_auth()
    email = payload.email.lower()
    if _throttled(email):
        raise ApiError(429, "RATE_LIMITED", "Too many reset requests. Try again in a few minutes.")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    # Same response whether or not the account exists (no account enumeration).
    if user is None:
        return ResetRequestResponse(message=GENERIC_RESET_MESSAGE)

    raw = issue_reset_token(db, user)
    db.commit()
    url = reset_url(raw)

    provider = get_email_provider()
    if provider.configured:
        try:
            provider.send(
                EmailMessage(
                    recipient=user.email,
                    subject="Reset your OpsWarden password",
                    body=(
                        f"Use this link to set a new password. It expires in "
                        f"{settings.password_reset_ttl_minutes} minutes and works once.\n\n{url}\n\n"
                        "If you didn't ask for this, you can ignore this email."
                    ),
                ),
                idempotency_key=hash_one_time_token(raw),
            )
        except Exception:
            log.warning("Password reset email could not be sent")

    return ResetRequestResponse(
        message=GENERIC_RESET_MESSAGE,
        dev_reset_url=None if settings.is_production else url,
    )


class ResetConfirm(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.post("/auth/password-reset/confirm", response_model=TokenResponse)
def confirm_password_reset(payload: ResetConfirm, db: Session = Depends(get_db)) -> TokenResponse:
    require_local_auth()
    record = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_one_time_token(payload.token))
    ).scalar_one_or_none()
    if record is None or record.used_at is not None or _as_utc(record.expires_at) < datetime.now(timezone.utc):
        raise bad_request("RESET_LINK_INVALID", "This reset link is invalid or has expired. Request a new one.")

    problem = password_problem(payload.new_password)
    if problem:
        raise ApiError(422, "WEAK_PASSWORD", problem)

    user = db.get(User, record.user_id)
    if user is None:
        raise bad_request("RESET_LINK_INVALID", "This reset link is invalid or has expired. Request a new one.")

    user.hashed_password = hash_password(payload.new_password)
    record.used_at = utcnow()
    for m in db.execute(select(WorkspaceMember).where(WorkspaceMember.user_id == user.id)).scalars():
        audit_service.record_event(
            db,
            workspace_id=m.workspace_id,
            event_type="user.password_reset",
            actor_type="user",
            actor_id=user.id,
            payload={"admin_issued": record.created_by is not None},
            commit=False,
        )
    db.commit()
    return TokenResponse(access_token=create_access_token(subject=user.id, extra={"email": user.email}))
