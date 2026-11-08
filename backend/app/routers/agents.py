"""
Agents router — agent log access and pipeline summary for the dashboard.

Access control (all endpoints): officer | admin only.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from app.core.database import get_db
from app.dependencies.auth import require_role
from app.models.agent_log import AgentLog
from app.models.approval import Approval
from app.models.user import User
from app.services.issue_service import get_issue

router = APIRouter(prefix="/agents", tags=["agents"])

_officer_or_admin = require_role("officer", "admin")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AgentLogRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    issue_id: int
    agent_name: str
    action: str
    payload: Optional[dict]
    status: str
    duration_ms: Optional[int]
    error_detail: Optional[str]
    timestamp: datetime


class PipelineStepOut(BaseModel):
    """A single agent step in the pipeline summary."""
    agent_name:  str
    action:      str
    status:      str
    duration_ms: Optional[int]
    payload:     Optional[dict]
    error_detail: Optional[str]
    timestamp:   datetime

    # Convenience accessors computed from payload
    reason:      Optional[str] = None
    confidence:  Optional[float] = None

    model_config = {"from_attributes": True}


class PipelineSummaryOut(BaseModel):
    """Structured pipeline summary for the dashboard detail panel."""
    issue_id:     int
    total_steps:  int
    success_count: int
    error_count:  int
    final_status: str
    department:   Optional[str]
    zone:         Optional[str]
    sla_days:     Optional[int]
    approval_decision: Optional[str]
    steps:        list[PipelineStepOut]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/logs/{issue_id}", response_model=list[AgentLogRead])
def get_agent_logs(
    issue_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(_officer_or_admin),
):
    issue = get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found.")
    return (
        db.query(AgentLog)
        .filter(AgentLog.issue_id == issue_id)
        .order_by(AgentLog.timestamp)
        .all()
    )


@router.get("/pipeline/{issue_id}", response_model=PipelineSummaryOut)
def get_pipeline_summary(
    issue_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(_officer_or_admin),
):
    """
    Returns a structured pipeline summary for display in the dashboard.

    Assembles data from agent_logs + approvals for the given issue.
    """
    issue = get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found.")

    logs = (
        db.query(AgentLog)
        .filter(AgentLog.issue_id == issue_id)
        .order_by(AgentLog.timestamp)
        .all()
    )

    approval = (
        db.query(Approval)
        .filter(Approval.issue_id == issue_id)
        .first()
    )

    steps: list[PipelineStepOut] = []
    for log in logs:
        payload = log.payload or {}
        step = PipelineStepOut(
            agent_name=log.agent_name,
            action=log.action,
            status=log.status,
            duration_ms=log.duration_ms,
            payload=payload,
            error_detail=log.error_detail,
            timestamp=log.timestamp,
            reason=payload.get("reason"),
            confidence=payload.get("confidence"),
        )
        steps.append(step)

    # Derive summary fields from the routing_agent step payload
    routing_step = next(
        (s for s in steps if s.agent_name == "routing_agent"), None
    )
    department = routing_step.payload.get("department") if routing_step else None
    zone       = routing_step.payload.get("zone")       if routing_step else None
    sla_days   = routing_step.payload.get("sla_days")   if routing_step else None

    success_count = sum(1 for s in steps if s.status == "success")
    error_count   = sum(1 for s in steps if s.status == "error")

    return PipelineSummaryOut(
        issue_id=issue_id,
        total_steps=len(steps),
        success_count=success_count,
        error_count=error_count,
        final_status=issue.status,
        department=department,
        zone=zone,
        sla_days=sla_days,
        approval_decision=approval.decision if approval else None,
        steps=steps,
    )
