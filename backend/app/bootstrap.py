"""Creates the first admin on a fresh production database.

Production never runs the demo seed, there is no public sign-up, and
invitations need an existing admin. Set BOOTSTRAP_ADMIN_EMAIL and
BOOTSTRAP_ADMIN_PASSWORD once, start the service, sign in, then remove the
password variable. Running again is a no-op: an existing user is never
modified, so this can't be used to reset someone's password.
"""
from __future__ import annotations

import secrets

from sqlalchemy import select

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import hash_password, password_problem
from app.db import SessionLocal
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember

log = get_logger("opswarden.bootstrap")


def ensure_bootstrap_admin() -> str | None:
    """Returns the created user's id, or None when nothing was created."""
    email = settings.bootstrap_admin_email.strip().lower()
    if not email:
        return None
    if settings.uses_supabase_auth:
        # Supabase owns the password: the admin signs up there with this email.
        # Locally they only need a record and an admin membership.
        password = secrets.token_urlsafe(32)
    else:
        password = settings.bootstrap_admin_password
        if not password:
            return None
        problem = password_problem(password)
        if problem:
            log.error("BOOTSTRAP_ADMIN_PASSWORD rejected: %s", problem)
            return None

    db = SessionLocal()
    try:
        if db.execute(select(User).where(User.email == email)).scalar_one_or_none() is not None:
            return None  # already exists: never touch an existing account
        workspace = db.execute(select(Workspace).order_by(Workspace.created_at)).scalars().first()
        if workspace is None:
            workspace = Workspace(name=settings.bootstrap_workspace_name.strip() or "OpsWarden")
            db.add(workspace)
            db.flush()
        user = User(email=email, full_name=settings.bootstrap_admin_name.strip() or "Administrator", hashed_password=hash_password(password))
        db.add(user)
        db.flush()
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="admin"))
        db.commit()
        if settings.uses_supabase_auth:
            log.info("Bootstrap admin record created for workspace %s. Sign up in the app with that email.", workspace.name)
        else:
            log.info("Bootstrap admin created for workspace %s. Remove BOOTSTRAP_ADMIN_PASSWORD now.", workspace.name)
        return user.id
    finally:
        db.close()
