"""
Stats router — aggregated counts for the dashboard.
All numbers are computed live from the database; nothing is hardcoded.

Access control: officer | admin only.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.dependencies.auth import require_role
from app.models.issue import Issue
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])

_officer_or_admin = require_role("officer", "admin")


class CategoryCount(BaseModel):
    category: str
    count: int


class SeverityCount(BaseModel):
    severity: str
    count: int


class StatusCount(BaseModel):
    status: str
    count: int


class DashboardStats(BaseModel):
    total: int
    pending: int
    in_progress: int
    awaiting_approval: int
    resolved: int
    rejected: int
    high_severity: int       # high + critical combined
    duplicates: int
    by_category: list[CategoryCount]
    by_severity: list[SeverityCount]
    by_status: list[StatusCount]


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    _: User = Depends(_officer_or_admin),
):
    """
    Returns aggregate counts derived from the issues table.
    All values reflect the live database state.
    """
    total = db.query(func.count(Issue.id)).scalar() or 0

    def count_status(s: str) -> int:
        return db.query(func.count(Issue.id)).filter(Issue.status == s).scalar() or 0

    pending            = count_status("pending")
    in_progress        = count_status("in_progress")
    awaiting_approval  = count_status("awaiting_approval")
    resolved           = count_status("resolved")
    rejected           = count_status("rejected")

    high_severity = (
        db.query(func.count(Issue.id))
        .filter(Issue.severity.in_(["high", "critical"]))
        .scalar() or 0
    )

    duplicates = (
        db.query(func.count(Issue.id))
        .filter(Issue.is_duplicate == True)  # noqa: E712
        .scalar() or 0
    )

    # Per-category breakdown
    cat_rows = (
        db.query(Issue.category, func.count(Issue.id))
        .filter(Issue.category.isnot(None))
        .group_by(Issue.category)
        .all()
    )
    by_category = [CategoryCount(category=c, count=n) for c, n in cat_rows]

    # Per-severity breakdown
    sev_rows = (
        db.query(Issue.severity, func.count(Issue.id))
        .filter(Issue.severity.isnot(None))
        .group_by(Issue.severity)
        .all()
    )
    by_severity = [SeverityCount(severity=s, count=n) for s, n in sev_rows]

    # Per-status breakdown
    status_rows = (
        db.query(Issue.status, func.count(Issue.id))
        .group_by(Issue.status)
        .all()
    )
    by_status = [StatusCount(status=s, count=n) for s, n in status_rows]

    return DashboardStats(
        total=total,
        pending=pending,
        in_progress=in_progress,
        awaiting_approval=awaiting_approval,
        resolved=resolved,
        rejected=rejected,
        high_severity=high_severity,
        duplicates=duplicates,
        by_category=by_category,
        by_severity=by_severity,
        by_status=by_status,
    )
