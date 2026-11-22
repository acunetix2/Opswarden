from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import GUID, Base, new_uuid, utcnow


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    case_seq: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Invoices by email. The address token is derived from SECRET_KEY and this nonce;
    # only its SHA-256 is stored, for lookup. Rotating the nonce retires the old address.
    inbound_nonce: Mapped[str | None] = mapped_column(String(32), nullable=True)
    inbound_token_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    # Documents arriving by email are filed as this member (the admin who turned the inbox on).
    inbound_owner_id: Mapped[str | None] = mapped_column(GUID, nullable=True)


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_member_workspace_user"),
    )

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("workspaces.id"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        GUID, ForeignKey("users.id"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="contributor")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
