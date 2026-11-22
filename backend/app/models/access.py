"""Account access records: password resets, invitations, workspace policy, notification state.

One-time tokens are stored only as SHA-256 hashes; the raw token exists solely
in the link given to the user.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(GUID, ForeignKey("users.id"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(GUID, nullable=True)  # admin who issued it, if any
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, ForeignKey("workspaces.id"), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    invited_by: Mapped[str] = mapped_column(GUID, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkspacePolicy(Base):
    """Per-workspace comparison and approval policy. Missing row = server defaults."""

    __tablename__ = "workspace_policies"

    workspace_id: Mapped[str] = mapped_column(GUID, ForeignKey("workspaces.id"), primary_key=True)
    # Decimals stored as strings to avoid any float round-trip.
    price_tolerance: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity_tolerance: Mapped[str] = mapped_column(String(32), nullable=False)
    reviewers_can_approve: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Automation switches. NULL means the default (on); stored nullable so the migration stays additive.
    auto_register: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    auto_draft_letters: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    auto_resolve_clean: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    notify_reviewers: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    send_on_approval: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    follow_up_reminders: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    record_credit_notes: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    follow_up_days: Mapped[int | None] = mapped_column(nullable=True)
    updated_by: Mapped[str | None] = mapped_column(GUID, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class NotificationState(Base):
    __tablename__ = "notification_states"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_notification_state"),)

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(GUID, index=True, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SignupVerification(Base):
    """A sign-up waiting for its emailed one-time code.

    The code is stored only as an HMAC (keyed with SECRET_KEY), so a database
    leak doesn't reveal it. The chosen password is already bcrypt-hashed here;
    the account itself is created only after the code is confirmed.
    """

    __tablename__ = "signup_verifications"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    workspace_name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    sends: Mapped[int] = mapped_column(default=1, nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
