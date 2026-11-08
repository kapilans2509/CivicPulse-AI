"""
Approvals router — human approval workflow for high-severity issues.

Access control (all endpoints): officer | admin only.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_role
from app.models.approval import Approval
from app.models.user import User
from app.schemas.approval import ApprovalDecision, ApprovalRead
from app.services.issue_service import get_issue

router = APIRouter(prefix="/approvals", tags=["approvals"])

_officer_or_admin = require_role("officer", "admin")


@router.get("/pending", response_model=list[ApprovalRead])
def list_pending_approvals(
    db: Session = Depends(get_db),
    _: User = Depends(_officer_or_admin),
):
    return (
        db.query(Approval)
        .filter(Approval.decision == "pending")
        .order_by(Approval.requested_at.desc())
        .all()
    )


@router.get("/{issue_id}", response_model=ApprovalRead)
def get_approval(
    issue_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(_officer_or_admin),
):
    approval = db.query(Approval).filter(Approval.issue_id == issue_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="No approval record for this issue.")
    return approval


@router.post("/{issue_id}/decide", response_model=ApprovalRead)
def decide_approval(
    issue_id: int,
    body: ApprovalDecision,
    db: Session = Depends(get_db),
    _: User = Depends(_officer_or_admin),
):
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'.")

    approval = db.query(Approval).filter(Approval.issue_id == issue_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="No approval record for this issue.")
    if approval.decision != "pending":
        raise HTTPException(status_code=409, detail="Approval already decided.")

    approval.decision = body.decision
    approval.notes = body.notes
    approval.decided_at = datetime.now(timezone.utc)

    issue = get_issue(db, issue_id)
    if issue:
        issue.status = "in_progress" if body.decision == "approved" else "rejected"

    db.commit()
    db.refresh(approval)
    return approval
