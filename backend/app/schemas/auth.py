from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    workspace_name: str = Field(min_length=1, max_length=200)


class SignupStartResponse(BaseModel):
    verification_id: str
    email: str
    expires_in_seconds: int
    resend_after_seconds: int
    # Development only, when no email provider is set up: lets the flow be completed locally.
    dev_code: str | None = None


class SignupVerifyRequest(BaseModel):
    verification_id: str = Field(min_length=1, max_length=64)
    code: str = Field(min_length=1, max_length=12)


class SignupResendRequest(BaseModel):
    verification_id: str = Field(min_length=1, max_length=64)


class SignupResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    workspace_id: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str


class WorkspaceOut(BaseModel):
    id: str
    name: str
    role: str
