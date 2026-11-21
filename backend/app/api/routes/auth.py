from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
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
from app.models.access import PasswordResetToken, SignupVerification
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.auth import (
    LoginRequest,
    SignupRequest,
    SignupResendRequest,
    SignupResponse,
    SignupStartResponse,
    SignupVerifyRequest,
    TokenResponse,
    UserOut,
    WorkspaceCreate,
    WorkspaceOut,
)
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
    return {
        "provider": "supabase" if settings.uses_supabase_auth else "local",
        # The emailed-code sign-up uses built-in accounts; with Supabase Auth people join by invitation.
        "allow_signup": settings.allow_signup and not settings.uses_supabase_auth,
    }


# ---- Sign-up and workspace creation -----------------------------------------------

_SIGNUP_WINDOW_SECONDS = 60 * 60
_SIGNUP_MAX_PER_WINDOW = 30
_signup_attempts: dict[str, deque[float]] = defaultdict(deque)


def _signup_throttled(key: str) -> bool:
    """Caps sign-up attempts per client address so the endpoint can't mass-create accounts."""
    now = time.monotonic()
    q = _signup_attempts[key]
    while q and now - q[0] > _SIGNUP_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= _SIGNUP_MAX_PER_WINDOW:
        return True
    q.append(now)
    return False


def create_workspace_for(db: Session, user: User, name: str) -> Workspace:
    """New workspace with `user` as its first admin. Audited. Caller commits."""
    clean = " ".join(name.split())[:200]
    if not clean:
        raise ApiError(422, "WORKSPACE_NAME_REQUIRED", "Enter a workspace name.")
    owned = db.execute(
        select(WorkspaceMember).where(WorkspaceMember.user_id == user.id, WorkspaceMember.role == "admin")
    ).scalars().all()
    if len(owned) >= settings.max_workspaces_per_user:
        raise ApiError(409, "WORKSPACE_LIMIT", f"You can administer at most {settings.max_workspaces_per_user} workspaces.")
    workspace = Workspace(name=clean)
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="admin"))
    audit_service.record_event(
        db,
        workspace_id=workspace.id,
        event_type="workspace.created",
        actor_type="user",
        actor_id=user.id,
        payload={"name": clean},
        commit=False,
    )
    return workspace


def _code_hash(verification_id: str, code: str) -> str:
    """Keyed hash: a leaked table can't be brute-forced offline without SECRET_KEY."""
    return hmac.new(settings.secret_key.encode(), f"{verification_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _new_code() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def _send_code(email: str, name: str, code: str, idempotency_key: str) -> bool:
    """Emails the code. Returns True if sent. Production without email can't verify anyone."""
    provider = get_email_provider()
    if not provider.configured:
        if settings.is_production:
            raise ApiError(503, "EMAIL_NOT_CONFIGURED", "Sign-up is unavailable: email sending isn't set up on the server.")
        return False
    first = name.split()[0] if name.split() else "there"
    try:
        provider.send(
            EmailMessage(
                recipient=email,
                subject=f"{code} is your OpsWarden verification code",
                body=(
                    f"Hi {first},\n\n"
                    f"Your OpsWarden verification code is:\n\n    {code}\n\n"
                    f"Enter it on the sign-up page to finish creating your account. It expires in "
                    f"{settings.signup_code_ttl_minutes} minutes and can only be used once.\n\n"
                    "If you didn't try to sign up, you can ignore this email. No account has been created.\n\n"
                    "OpsWarden"
                ),
            ),
            idempotency_key=idempotency_key,
        )
        return True
    except Exception:
        log.warning("Sign-up code email could not be sent")
        if settings.is_production:
            raise ApiError(502, "EMAIL_SEND_FAILED", "We couldn't send the code. Check the address and try again.")
        return False


def _pending(db: Session, verification_id: str) -> SignupVerification:
    v = db.get(SignupVerification, verification_id)
    if v is None or v.used_at is not None:
        raise ApiError(400, "CODE_INVALID", "This sign-up has expired. Start again.")
    if _as_utc(v.expires_at) < datetime.now(timezone.utc):
        raise ApiError(400, "CODE_EXPIRED", "The code has expired. Send a new one.")
    return v


def _start_response(v: SignupVerification, code: str, sent: bool) -> SignupStartResponse:
    return SignupStartResponse(
        verification_id=v.id,
        email=v.email,
        expires_in_seconds=settings.signup_code_ttl_minutes * 60,
        resend_after_seconds=settings.signup_code_resend_seconds,
        dev_code=None if settings.is_production or sent else code,
    )


@router.post("/auth/signup/start", response_model=SignupStartResponse, status_code=202)
def signup_start(payload: SignupRequest, request: Request, db: Session = Depends(get_db)) -> SignupStartResponse:
    """Step 1: validate the details and email a 6-digit code. No account exists until step 2."""
    require_local_auth()
    if not settings.allow_signup:
        raise ApiError(403, "SIGNUP_DISABLED", "Sign-up is turned off. Ask a workspace admin for an invitation.")
    email = payload.email.lower()
    client = request.client.host if request.client else "unknown"
    # Per address: caps attempts (including "email in use" probing) from one client.
    if _signup_throttled(f"ip:{client}"):
        raise ApiError(429, "RATE_LIMITED", "Too many sign-up attempts. Try again later.")

    name = " ".join(payload.full_name.split())[:200]
    workspace_name = " ".join(payload.workspace_name.split())[:200]
    if not name:
        raise ApiError(422, "NAME_REQUIRED", "Enter your name.")
    if not workspace_name:
        raise ApiError(422, "WORKSPACE_NAME_REQUIRED", "Enter a workspace name.")
    problem = password_problem(payload.password)
    if problem:
        raise ApiError(422, "WEAK_PASSWORD", problem)
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none() is not None:
        raise ApiError(409, "EMAIL_IN_USE", "An account with this email already exists. Sign in instead, or reset your password.")
    # Per mailbox: only attempts that send a code count, so typos in the form don't lock anyone out.
    if _throttled(f"signup:{email}"):
        raise ApiError(429, "RATE_LIMITED", "Too many codes sent to this email. Try again in a few minutes.")

    # One pending sign-up per email: starting again replaces the earlier code.
    now = utcnow()
    for old in db.execute(
        select(SignupVerification).where(SignupVerification.email == email, SignupVerification.used_at.is_(None))
    ).scalars():
        old.used_at = now

    code = _new_code()
    v = SignupVerification(
        email=email,
        full_name=name,
        workspace_name=workspace_name,
        hashed_password=hash_password(payload.password),
        code_hash="",
        expires_at=now + timedelta(minutes=settings.signup_code_ttl_minutes),
        last_sent_at=now,
    )
    db.add(v)
    db.flush()
    v.code_hash = _code_hash(v.id, code)
    db.commit()
    sent = _send_code(email, name, code, idempotency_key=f"signup:{v.id}:1")
    return _start_response(v, code, sent)


@router.post("/auth/signup/resend", response_model=SignupStartResponse, status_code=202)
def signup_resend(payload: SignupResendRequest, db: Session = Depends(get_db)) -> SignupStartResponse:
    """Send a fresh code for a pending sign-up. The previous code stops working."""
    require_local_auth()
    v = db.get(SignupVerification, payload.verification_id)
    if v is None or v.used_at is not None:
        raise ApiError(400, "CODE_INVALID", "This sign-up has expired. Start again.")
    wait = settings.signup_code_resend_seconds - (datetime.now(timezone.utc) - _as_utc(v.last_sent_at)).total_seconds()
    if wait > 0:
        raise ApiError(429, "RESEND_TOO_SOON", f"Wait {int(wait) + 1} seconds before asking for another code.")
    if v.sends >= settings.signup_code_max_sends:
        raise ApiError(429, "TOO_MANY_CODES", "Too many codes requested. Start the sign-up again later.")

    code = _new_code()
    now = utcnow()
    v.code_hash = _code_hash(v.id, code)
    v.sends += 1
    v.attempts = 0
    v.last_sent_at = now
    v.expires_at = now + timedelta(minutes=settings.signup_code_ttl_minutes)
    db.commit()
    sent = _send_code(v.email, v.full_name, code, idempotency_key=f"signup:{v.id}:{v.sends}")
    return _start_response(v, code, sent)


@router.post("/auth/signup/verify", response_model=SignupResponse, status_code=201)
def signup_verify(payload: SignupVerifyRequest, db: Session = Depends(get_db)) -> SignupResponse:
    """Step 2: check the code, then create the account and its workspace and sign the person in."""
    require_local_auth()
    v = _pending(db, payload.verification_id)
    if v.attempts >= settings.signup_code_max_attempts:
        raise ApiError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Send a new code to try again.")

    code = "".join(ch for ch in payload.code if ch.isdigit())
    if len(code) != 6 or not hmac.compare_digest(_code_hash(v.id, code), v.code_hash):
        v.attempts += 1
        db.commit()
        left = settings.signup_code_max_attempts - v.attempts
        if left <= 0:
            raise ApiError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Send a new code to try again.")
        raise ApiError(400, "CODE_INCORRECT", f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left.")

    # Someone may have registered this email (e.g. via an invitation) while the code was pending.
    if db.execute(select(User).where(User.email == v.email)).scalar_one_or_none() is not None:
        v.used_at = utcnow()
        db.commit()
        raise ApiError(409, "EMAIL_IN_USE", "An account with this email already exists. Sign in instead.")

    user = User(email=v.email, full_name=v.full_name, hashed_password=v.hashed_password)
    db.add(user)
    db.flush()
    workspace = create_workspace_for(db, user, v.workspace_name)
    v.used_at = utcnow()
    db.commit()
    log.info("Verified sign-up created workspace %s", workspace.id)
    return SignupResponse(
        access_token=create_access_token(subject=user.id, extra={"email": user.email}),
        workspace_id=workspace.id,
    )


@router.post("/workspaces", response_model=WorkspaceOut, status_code=201)
def create_workspace(
    payload: WorkspaceCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> WorkspaceOut:
    """A signed-in person creates another workspace (or their first, after a Supabase sign-up)."""
    if not settings.allow_signup:
        raise ApiError(403, "SIGNUP_DISABLED", "Creating workspaces is turned off. Ask a workspace admin for an invitation.")
    workspace = create_workspace_for(db, user, payload.name)
    db.commit()
    return WorkspaceOut(id=workspace.id, name=workspace.name, role="admin")


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
