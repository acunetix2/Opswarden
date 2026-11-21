"""Workspace membership management (AUTH-04): invitations, roles, removal.

Admin-only, audited, and the workspace always keeps at least one admin.
Invitation links are the delivery channel when email isn't configured.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, get_current_user, workspace_context
from app.api.errors import ApiError, bad_request, conflict, not_found
from app.api.routes.auth import issue_reset_token, require_local_auth, reset_url
from app.core.config import settings
from app.core.logging import get_logger
from app.core.permissions import Permission
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
from app.models.access import Invitation
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.auth import TokenResponse
from app.services import audit_service

router = APIRouter(tags=["team"])
log = get_logger("opswarden.team")

RoleName = Literal["admin", "reviewer", "contributor"]


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _invite_url(raw: str) -> str:
    return f"{settings.frontend_origin.rstrip('/')}/invite?token={raw}"


def _admin_count(db: Session, workspace_id: str) -> int:
    return db.execute(
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == "admin"
        )
    ).scalar_one()


def _user_name(db: Session, user_id: str | None) -> str | None:
    u = db.get(User, user_id) if user_id else None
    return (u.full_name or u.email) if u else None


# ---- Invitations --------------------------------------------------------------


class InviteCreate(BaseModel):
    email: EmailStr
    role: RoleName


class InvitationOut(BaseModel):
    id: str
    email: str
    role: str
    status: str  # pending | accepted | revoked | expired
    invited_by_name: str | None
    expires_at: datetime
    created_at: datetime
    # Only returned when the invitation is created; the raw token isn't stored.
    invite_url: str | None = None
    email_sent: bool = False


def _status(inv: Invitation) -> str:
    if inv.accepted_at:
        return "accepted"
    if inv.revoked_at:
        return "revoked"
    if _utc(inv.expires_at) < datetime.now(timezone.utc):
        return "expired"
    return "pending"


def _inv_out(db: Session, inv: Invitation, **extra) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        email=inv.email,
        role=inv.role,
        status=_status(inv),
        invited_by_name=_user_name(db, inv.invited_by),
        expires_at=inv.expires_at,
        created_at=inv.created_at,
        **extra,
    )


@router.get("/workspaces/{workspace_id}/invitations", response_model=list[InvitationOut])
def list_invitations(
    workspace_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[InvitationOut]:
    ctx.require(Permission.MANAGE_WORKSPACE)
    rows = db.execute(
        select(Invitation).where(Invitation.workspace_id == workspace_id).order_by(Invitation.created_at.desc())
    ).scalars().all()
    return [_inv_out(db, i) for i in rows if _status(i) == "pending"]


@router.post("/workspaces/{workspace_id}/invitations", response_model=InvitationOut, status_code=201)
def create_invitation(
    workspace_id: str,
    payload: InviteCreate,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> InvitationOut:
    ctx.require(Permission.MANAGE_WORKSPACE)
    email = payload.email.lower()

    existing_user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing_user and db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == existing_user.id
        )
    ).first():
        raise conflict("ALREADY_MEMBER", "That person is already a member of this workspace.")

    # Replace any earlier pending invitation for the same address.
    now = utcnow()
    for old in db.execute(
        select(Invitation).where(Invitation.workspace_id == workspace_id, Invitation.email == email)
    ).scalars():
        if _status(old) == "pending":
            old.revoked_at = now

    raw, digest = new_one_time_token()
    inv = Invitation(
        workspace_id=workspace_id,
        email=email,
        role=payload.role,
        token_hash=digest,
        invited_by=ctx.user.id,
        expires_at=now + timedelta(days=settings.invitation_ttl_days),
    )
    db.add(inv)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        event_type="member.invited",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"email": email, "role": payload.role},
        commit=False,
    )
    db.commit()

    url = _invite_url(raw)
    email_sent = False
    provider = get_email_provider()
    if provider.configured:
        workspace = db.get(Workspace, workspace_id)
        try:
            provider.send(
                EmailMessage(
                    recipient=email,
                    subject=f"You're invited to {workspace.name if workspace else 'OpsWarden'}",
                    body=(
                        f"{ctx.user.full_name or ctx.user.email} invited you to join "
                        f"{workspace.name if workspace else 'a workspace'} on OpsWarden as {payload.role}.\n\n"
                        f"Accept the invitation: {url}\n\nThe link expires in {settings.invitation_ttl_days} days."
                    ),
                ),
                idempotency_key=digest,
            )
            email_sent = True
        except Exception:
            log.warning("Invitation email could not be sent")

    return _inv_out(db, inv, invite_url=url, email_sent=email_sent)


@router.delete("/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    invitation_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    inv = db.get(Invitation, invitation_id)
    if inv is None:
        raise not_found("Invitation")
    ctx = workspace_context(inv.workspace_id, user, db)
    ctx.require(Permission.MANAGE_WORKSPACE)
    if _status(inv) == "pending":
        inv.revoked_at = utcnow()
        audit_service.record_event(
            db,
            workspace_id=inv.workspace_id,
            event_type="member.invitation_revoked",
            actor_type="user",
            actor_id=user.id,
            payload={"email": inv.email},
            commit=False,
        )
        db.commit()
    return Response(status_code=204)


class InvitationLookup(BaseModel):
    workspace_id: str
    workspace_name: str
    email: str
    role: str
    invited_by_name: str | None
    expires_at: datetime
    account_exists: bool


def _valid_invitation(db: Session, token: str) -> Invitation:
    inv = db.execute(
        select(Invitation).where(Invitation.token_hash == hash_one_time_token(token))
    ).scalar_one_or_none()
    if inv is None or _status(inv) != "pending":
        raise bad_request("INVITATION_INVALID", "This invitation is invalid, expired, or has already been used.")
    return inv


@router.get("/invitations/lookup", response_model=InvitationLookup)
def lookup_invitation(token: str = Query(min_length=10, max_length=200), db: Session = Depends(get_db)) -> InvitationLookup:
    inv = _valid_invitation(db, token)
    workspace = db.get(Workspace, inv.workspace_id)
    return InvitationLookup(
        workspace_id=inv.workspace_id,
        workspace_name=workspace.name if workspace else "",
        email=inv.email,
        role=inv.role,
        invited_by_name=_user_name(db, inv.invited_by),
        expires_at=inv.expires_at,
        account_exists=db.execute(select(User.id).where(User.email == inv.email)).first() is not None,
    )


class InvitationAccept(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)


class InvitationAccepted(TokenResponse):
    workspace_id: str


@router.post("/invitations/accept", response_model=InvitationAccepted)
def accept_invitation(payload: InvitationAccept, db: Session = Depends(get_db)) -> InvitationAccepted:
    require_local_auth()
    inv = _valid_invitation(db, payload.token)
    user = db.execute(select(User).where(User.email == inv.email)).scalar_one_or_none()

    if user is not None:
        # Existing account: prove ownership with the current password.
        if not verify_password(payload.password, user.hashed_password):
            raise ApiError(401, "UNAUTHENTICATED", "That password doesn't match the existing account for this email.")
    else:
        if not payload.full_name or not payload.full_name.strip():
            raise ApiError(422, "NAME_REQUIRED", "Enter your name.")
        problem = password_problem(payload.password)
        if problem:
            raise ApiError(422, "WEAK_PASSWORD", problem)
        user = User(email=inv.email, full_name=payload.full_name.strip(), hashed_password=hash_password(payload.password))
        db.add(user)
        db.flush()

    if db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == inv.workspace_id, WorkspaceMember.user_id == user.id)
    ).first() is None:
        db.add(WorkspaceMember(workspace_id=inv.workspace_id, user_id=user.id, role=inv.role))
    inv.accepted_at = utcnow()
    audit_service.record_event(
        db,
        workspace_id=inv.workspace_id,
        event_type="member.joined",
        actor_type="user",
        actor_id=user.id,
        payload={"role": inv.role},
        commit=False,
    )
    db.commit()
    return InvitationAccepted(
        access_token=create_access_token(subject=user.id, extra={"email": user.email}),
        workspace_id=inv.workspace_id,
    )


class InvitationClaim(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class InvitationClaimed(BaseModel):
    workspace_id: str


@router.post("/invitations/claim", response_model=InvitationClaimed)
def claim_invitation(payload: InvitationClaim, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> InvitationClaimed:
    """Supabase Auth flow: an already signed-in user redeems an invitation.

    Needs both the one-time invitation token and a verified sign-in for the
    invited email address, so a leaked link alone can't be used by someone else.
    """
    inv = _valid_invitation(db, payload.token)
    if inv.email.lower() != user.email.lower():
        raise ApiError(403, "INVITATION_EMAIL_MISMATCH", f"This invitation is for {inv.email}. Sign in with that email address to accept it.")
    if db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == inv.workspace_id, WorkspaceMember.user_id == user.id)
    ).first() is None:
        db.add(WorkspaceMember(workspace_id=inv.workspace_id, user_id=user.id, role=inv.role))
    inv.accepted_at = utcnow()
    audit_service.record_event(
        db,
        workspace_id=inv.workspace_id,
        event_type="member.joined",
        actor_type="user",
        actor_id=user.id,
        payload={"role": inv.role},
        commit=False,
    )
    db.commit()
    return InvitationClaimed(workspace_id=inv.workspace_id)


# ---- Members --------------------------------------------------------------------


class RoleUpdate(BaseModel):
    role: RoleName


def _target_member(db: Session, workspace_id: str, user_id: str) -> WorkspaceMember:
    m = db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
    ).scalar_one_or_none()
    if m is None:
        raise not_found("Member")
    return m


@router.patch("/workspaces/{workspace_id}/members/{user_id}", status_code=204)
def update_member_role(
    workspace_id: str,
    user_id: str,
    payload: RoleUpdate,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> Response:
    ctx.require(Permission.MANAGE_WORKSPACE)
    if user_id == ctx.user.id:
        raise conflict("CANNOT_CHANGE_OWN_ROLE", "You can't change your own role. Ask another admin.")
    member = _target_member(db, workspace_id, user_id)
    if member.role == payload.role:
        return Response(status_code=204)
    if member.role == "admin" and _admin_count(db, workspace_id) <= 1:
        raise conflict("LAST_ADMIN", "A workspace needs at least one admin.")
    previous = member.role
    member.role = payload.role
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        event_type="member.role_changed",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"member": _user_name(db, user_id), "from": previous, "to": payload.role},
        commit=False,
    )
    db.commit()
    return Response(status_code=204)


@router.delete("/workspaces/{workspace_id}/members/{user_id}", status_code=204)
def remove_member(
    workspace_id: str,
    user_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> Response:
    ctx.require(Permission.MANAGE_WORKSPACE)
    if user_id == ctx.user.id:
        raise conflict("CANNOT_REMOVE_SELF", "You can't remove yourself. Ask another admin.")
    member = _target_member(db, workspace_id, user_id)
    if member.role == "admin" and _admin_count(db, workspace_id) <= 1:
        raise conflict("LAST_ADMIN", "A workspace needs at least one admin.")
    name = _user_name(db, user_id)
    db.delete(member)
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        event_type="member.removed",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"member": name, "role": member.role},
        commit=False,
    )
    db.commit()
    return Response(status_code=204)


class ResetLinkOut(BaseModel):
    reset_url: str
    expires_in_minutes: int


@router.post("/workspaces/{workspace_id}/members/{user_id}/password-reset", response_model=ResetLinkOut)
def member_reset_link(
    workspace_id: str,
    user_id: str,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> ResetLinkOut:
    """Admin-issued one-time reset link, for workspaces without email delivery."""
    ctx.require(Permission.MANAGE_WORKSPACE)
    require_local_auth()
    _target_member(db, workspace_id, user_id)
    user = db.get(User, user_id)
    if user is None:
        raise not_found("Member")
    raw = issue_reset_token(db, user, created_by=ctx.user.id)
    audit_service.record_event(
        db,
        workspace_id=workspace_id,
        event_type="member.reset_link_issued",
        actor_type="user",
        actor_id=ctx.user.id,
        payload={"member": user.full_name or user.email},
        commit=False,
    )
    db.commit()
    return ResetLinkOut(reset_url=reset_url(raw), expires_in_minutes=settings.password_reset_ttl_minutes)
