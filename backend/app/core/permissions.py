"""Role-based permission policy (deterministic, server-side).

This module is the authority for what each role may do. The governance
layer is ordinary application code, never an LLM decision.
"""
from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    admin = "admin"
    reviewer = "reviewer"
    contributor = "contributor"


class Permission(str, Enum):
    READ_CASE = "read_case"
    CREATE_CASE = "create_case"
    EDIT_CASE = "edit_case"
    UPLOAD_DOCUMENT = "upload_document"
    CORRECT_FIELDS = "correct_fields"
    REVIEW_FINDING = "review_finding"
    GENERATE_RECOMMENDATION = "generate_recommendation"
    REQUEST_APPROVAL = "request_approval"
    DECIDE_APPROVAL = "decide_approval"
    EXECUTE_ACTION = "execute_action"
    MANAGE_CASE_LIFECYCLE = "manage_case_lifecycle"  # archive / reopen
    MANAGE_WORKSPACE = "manage_workspace"


# Deterministic role -> permissions matrix (see SECURITY.md section 4).
_MATRIX: dict[Role, set[Permission]] = {
    Role.admin: set(Permission),
    Role.reviewer: {
        Permission.READ_CASE,
        Permission.CREATE_CASE,
        Permission.EDIT_CASE,
        Permission.UPLOAD_DOCUMENT,
        Permission.CORRECT_FIELDS,
        Permission.REVIEW_FINDING,
        Permission.GENERATE_RECOMMENDATION,
        Permission.REQUEST_APPROVAL,
        Permission.DECIDE_APPROVAL,
        Permission.EXECUTE_ACTION,
        Permission.MANAGE_CASE_LIFECYCLE,
    },
    Role.contributor: {
        Permission.READ_CASE,
        Permission.CREATE_CASE,
        Permission.EDIT_CASE,
        Permission.UPLOAD_DOCUMENT,
        Permission.CORRECT_FIELDS,
    },
}


def role_has_permission(role: Role | str, permission: Permission) -> bool:
    try:
        r = Role(role)
    except ValueError:
        return False
    return permission in _MATRIX.get(r, set())
