from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from typing import Optional


class IssueCreate(BaseModel):
    title: str = Field(..., min_length=5, max_length=255)
    description: str = Field(..., min_length=10, max_length=2000)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: Optional[str] = Field(None, max_length=500)

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


VALID_STATUSES = {
    "pending", "classified", "dispatched",
    "awaiting_approval", "in_progress", "resolved", "rejected",
}

VALID_CATEGORIES = {"pothole", "garbage", "flooding", "road_damage", "other"}
VALID_SEVERITIES = {"low", "medium", "high", "critical"}


class IssueUpdate(BaseModel):
    status:      Optional[str] = None
    category:    Optional[str] = None
    severity:    Optional[str] = None
    address:     Optional[str] = Field(None, max_length=500)
    ward:        Optional[str] = Field(None, max_length=120)
    assigned_to: Optional[int] = None   # worker user id; set by officer/admin

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{v}'. Must be one of: {sorted(VALID_STATUSES)}")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category '{v}'.")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_SEVERITIES:
            raise ValueError(f"Invalid severity '{v}'.")
        return v


class IssueRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    title: str
    description: str
    category: Optional[str]
    severity: Optional[str]
    department: Optional[str]
    latitude: float
    longitude: float
    address: Optional[str]
    ward: Optional[str]
    photo_path: Optional[str]
    status: str
    is_duplicate: bool
    canonical_issue_id: Optional[int]
    reporter_id: Optional[int]
    assigned_to: Optional[int]
    reported_at: datetime
    updated_at: datetime
