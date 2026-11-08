"""
Business logic for civic issue CRUD operations.
"""
from sqlalchemy.orm import Session

from app.models.issue import Issue
from app.schemas.issue import IssueCreate, IssueUpdate


def create_issue(
    db: Session,
    data: IssueCreate,
    photo_path: str | None = None,
    reporter_id: int | None = None,
) -> Issue:
    issue = Issue(
        title=data.title,
        description=data.description,
        latitude=data.latitude,
        longitude=data.longitude,
        address=data.address,
        photo_path=photo_path,
        status="pending",
        reporter_id=reporter_id,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


def list_issues(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    search: str | None = None,
) -> list[Issue]:
    query = db.query(Issue)
    if status:
        query = query.filter(Issue.status == status)
    if category:
        query = query.filter(Issue.category == category)
    if severity:
        query = query.filter(Issue.severity == severity)
    if search:
        term = f"%{search.lower()}%"
        from sqlalchemy import or_
        query = query.filter(
            or_(
                Issue.title.ilike(term),
                Issue.description.ilike(term),
                Issue.address.ilike(term),
            )
        )
    return query.order_by(Issue.reported_at.desc()).offset(skip).limit(limit).all()


def get_issue(db: Session, issue_id: int) -> Issue | None:
    return db.query(Issue).filter(Issue.id == issue_id).first()


def update_issue(db: Session, issue: Issue, data: IssueUpdate) -> Issue:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(issue, field, value)
    db.commit()
    db.refresh(issue)
    return issue
