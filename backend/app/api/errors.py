"""Typed API errors with the contract error shape (no stack traces/secrets)."""
from __future__ import annotations

from fastapi import HTTPException


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code=status_code, detail={"code": code, "message": message})
        self.code = code
        self.message = message


def not_found(resource: str = "Resource") -> ApiError:
    # Do not reveal whether an inaccessible foreign resource exists.
    return ApiError(404, f"{resource.upper()}_NOT_FOUND", f"The requested {resource.lower()} was not found.")


def forbidden(message: str = "You do not have permission to perform this action.") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def unauthorized(message: str = "Authentication required.") -> ApiError:
    return ApiError(401, "UNAUTHENTICATED", message)


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)


def unprocessable(code: str, message: str) -> ApiError:
    return ApiError(422, code, message)


def bad_request(code: str, message: str) -> ApiError:
    return ApiError(400, code, message)
