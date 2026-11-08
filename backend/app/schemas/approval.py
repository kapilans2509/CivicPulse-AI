from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ApprovalDecision(BaseModel):
    decision: str  # "approved" or "rejected"
    notes: Optional[str] = None


class ApprovalRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    issue_id: int
    requested_by: str
    decision: Optional[str]
    notes: Optional[str]
    requested_at: datetime
    decided_at: Optional[datetime]
