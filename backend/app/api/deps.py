"""Request dependencies: authentication, workspace scoping, and RBAC.

Every protected resource is resolved through these helpers so that workspace
membership and role are checked server-side on every request. Browser-supplied
workspace IDs are never trusted without a membership check.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import forbidden, not_found, unauthorized
from app.core.config import settings
from app.core.permissions import Permission, role_has_permission
from app.core.security import decode_access_token, decode_supabase_token, hash_password
from app.db import get_db
from app.models.case import Case
from app.models.document import Document
from app.models.user import User
from app.models.workspace import WorkspaceMember

_bearer = HTTPBearer(auto_error=False)


def _supabase_user(token: str, db: Session) -> User:
    """Resolve a verified Supabase identity to the local user record (matched by email).

    A first-time Supabase user gets a local account with no workspace access; an
    admin's invitation (claimed via /invitations/claim) or the bootstrap admin
    setting grants membership. Roles always live in this database, never in the token.
    """
    payload = decode_supabase_token(token)
    if not payload:
        raise unauthorized("Invalid or expired token.")
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise unauthorized("This sign-in has no email address.")
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        meta = payload.get("user_metadata") or {}
        name = str(meta.get("full_name") or meta.get("name") or email.split("@")[0])[:200]
        # Unusable local password: this account can only sign in through Supabase.
        user = User(email=email, full_name=name, hashed_password=hash_password(secrets.token_urlsafe(32)))
        db.add(user)
        db.commit()
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise unauthorized()
    if settings.uses_supabase_auth:
        return _supabase_user(creds.credentials, db)
    payload = decode_access_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise unauthorized("Invalid or expired token.")
    user = db.get(User, payload["sub"])
    if user is None:
        raise unauthorized("Invalid or expired token.")
    return user


@dataclass
class WorkspaceContext:
    workspace_id: str
    role: str
    user: User

    def require(self, permission: Permission) -> None:
        if not role_has_permission(self.role, permission):
            raise forbidden()


def _membership(db: Session, user_id: str, workspace_id: str) -> WorkspaceMember | None:
    return db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
    ).scalar_one_or_none()


def workspace_context(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceContext:
    member = _membership(db, user.id, workspace_id)
    if member is None:
        # Do not disclose whether the workspace exists.
        raise not_found("Workspace")
    return WorkspaceContext(workspace_id=workspace_id, role=member.role, user=user)


def load_case(
    case_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[Case, WorkspaceContext]:
    case = db.get(Case, case_id)
    if case is None:
        raise not_found("Case")
    member = _membership(db, user.id, case.workspace_id)
    if member is None:
        raise not_found("Case")  # hide existence from non-members
    return case, WorkspaceContext(workspace_id=case.workspace_id, role=member.role, user=user)


def load_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[Document, WorkspaceContext]:
    doc = db.get(Document, document_id)
    if doc is None:
        raise not_found("Document")
    member = _membership(db, user.id, doc.workspace_id)
    if member is None:
        raise not_found("Document")
    return doc, WorkspaceContext(workspace_id=doc.workspace_id, role=member.role, user=user)
