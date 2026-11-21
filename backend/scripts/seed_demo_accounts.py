"""Create the sign-in page's demo accounts on the hosted database (Supabase).

Usage (from backend/):  .venv\\Scripts\\python.exe scripts\\seed_demo_accounts.py

Creates the workspace "Northstar Procurement" and the three accounts listed on
the login page (admin, reviewer, contributor; password from app/seed.py) with
their roles. Accounts only, no demo cases. Safe to re-run: existing users and
memberships are left untouched, and existing passwords are never changed.
These accounts use built-in sign-in (AUTH_PROVIDER=local).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("SEED_DEMO_DATA", "false")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from migrate import _engine  # noqa: E402

from app.core.security import hash_password, verify_password  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.workspace import Workspace, WorkspaceMember  # noqa: E402
from app.seed import DEMO_PASSWORD, _USERS  # noqa: E402

WORKSPACE_NAME = "Northstar Procurement"


def main() -> int:
    engine = _engine()
    with Session(engine) as db:
        workspace = db.execute(select(Workspace).where(Workspace.name == WORKSPACE_NAME)).scalars().first()
        if workspace is None:
            workspace = Workspace(name=WORKSPACE_NAME)
            db.add(workspace)
            db.flush()
            print(f"created workspace {WORKSPACE_NAME}")
        else:
            print(f"workspace {WORKSPACE_NAME} exists")

        for email, name, role in _USERS:
            user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if user is None:
                user = User(email=email, full_name=name, hashed_password=hash_password(DEMO_PASSWORD))
                db.add(user)
                db.flush()
                print(f"created user {email}")
            else:
                print(f"user {email} exists (password unchanged)")
            member = db.execute(
                select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user.id)
            ).scalar_one_or_none()
            if member is None:
                db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=role))
                print(f"  added as {role}")
            else:
                print(f"  already a member ({member.role})")
        db.commit()

        count = db.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id)).scalars().all()
        print(f"Verified: {len(count)} members in {WORKSPACE_NAME}")
        for email, _, _ in _USERS:
            stored = db.execute(select(User.hashed_password).where(User.email == email)).scalar_one()
            print(f"  sign-in check {email}: {'ok' if verify_password(DEMO_PASSWORD, stored) else 'PASSWORD DIFFERS'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
