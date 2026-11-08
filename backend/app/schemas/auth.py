"""
Pydantic schemas for authentication endpoints.
hashed_password is intentionally excluded from all read/response models.
"""
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


# ── Request schemas ───────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    # role is intentionally absent — public registration always produces a
    # citizen account.  Privileged roles are assigned by an administrator
    # through a separate, protected process and never by the registrant.


# ── Response schemas ──────────────────────────────────────────────────────────

class UserRead(BaseModel):
    """Public user representation — never includes hashed_password."""
    model_config = {"from_attributes": True}

    id: int
    name: str
    email: str
    role: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
