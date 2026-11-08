"""
Issues router — CRUD endpoints for civic issue reports.

Access control:
  POST /          — any authenticated user (citizen/officer/worker/admin)
  GET  /mine      — citizen: own issues only
  GET  /          — officer / admin: all issues
  GET  /{id}      — authenticated + ownership (citizen: own only; officer/admin: any)
  PATCH /{id}     — officer/admin: any field
                  — worker: status-only on their assigned issue
"""
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.issue import Issue
from app.models.user import User
from app.schemas.issue import IssueCreate, IssueRead, IssueUpdate
from app.services.issue_service import create_issue, list_issues, get_issue, update_issue
from app.agents.bus import run_pipeline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/issues", tags=["issues"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
# Browsers sometimes send an empty content-type for missing optional files
_EMPTY_CONTENT_TYPES = {"", "application/octet-stream"}


@router.post("/", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
async def submit_issue(
    title: str = Form(...),
    description: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    address: str | None = Form(None),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── Photo validation & persistence ────────────────────────────────────────
    photo_path: str | None = None
    if photo and photo.filename and photo.content_type not in _EMPTY_CONTENT_TYPES:
        if photo.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Photo must be JPEG, PNG or WebP.",
            )
        content = await photo.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"Photo exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit.",
            )
        media_dir = Path(settings.MEDIA_DIR)
        media_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(photo.filename).suffix.lower() or ".jpg"
        filename = f"{uuid.uuid4().hex}{suffix}"
        (media_dir / filename).write_bytes(content)
        photo_path = f"/media/{filename}"

    # ── Persist issue ──────────────────────────────────────────────────────────
    data = IssueCreate(
        title=title,
        description=description,
        latitude=latitude,
        longitude=longitude,
        address=address,
    )
    issue = create_issue(db, data, photo_path=photo_path, reporter_id=current_user.id)

    # ── Run agent pipeline ─────────────────────────────────────────────────────
    try:
        run_pipeline(db, issue)
    except Exception as exc:  # noqa: BLE001
        logger.error("Agent pipeline failed for issue #%s: %s", issue.id, exc, exc_info=True)

    db.refresh(issue)
    return issue


@router.get("/workers")
def get_workers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("officer", "admin")),
):
    """List active worker accounts for officer/admin assignment controls."""
    workers = (
        db.query(User)
        .filter(User.role == "worker")
        .order_by(User.name.asc())
        .all()
    )
    return [{"id": worker.id, "name": worker.name, "email": worker.email} for worker in workers]


@router.get("/mine", response_model=list[IssueRead])
def get_my_issues(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a citizen's own reports or a worker's assigned tasks."""
    owner_column = Issue.assigned_to if current_user.role == "worker" else Issue.reporter_id
    return (
        db.query(Issue)
        .filter(owner_column == current_user.id)
        .order_by(Issue.reported_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/", response_model=list[IssueRead])
def get_issues(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: str | None = Query(None),
    category: str | None = Query(None),
    severity: str | None = Query(None),
    search: str | None = Query(None, min_length=1, max_length=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("officer", "admin")),
):
    """List all issues. Officer and admin only."""
    return list_issues(
        db,
        skip=skip,
        limit=limit,
        status=status,
        category=category,
        severity=severity,
        search=search,
    )


@router.get("/{issue_id}", response_model=IssueRead)
def get_issue_by_id(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve a single issue.
    - Citizens: only their own issues.
    - Officers, workers, admins: any issue.
    """
    issue = get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found.")

    if current_user.role == "citizen" and issue.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own issues.")

    return issue


@router.patch("/{issue_id}", response_model=IssueRead)
def patch_issue(
    issue_id: int,
    data: IssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update an issue.
    - Officers and admins: may update any field.
    - Workers: may only update `status` on issues assigned to them.
    - Citizens: not permitted.
    """
    if current_user.role not in {"officer", "admin", "worker"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not permitted to update issues.",
        )

    issue = get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found.")

    # Only officer/admin may assign or unassign a worker. Validate the target
    # account so an arbitrary citizen/officer/admin ID cannot be assigned.
    if "assigned_to" in data.model_fields_set:
        if current_user.role not in {"officer", "admin"}:
            raise HTTPException(status_code=403, detail="Only officers and admins can assign workers.")
        if data.assigned_to is not None:
            worker = db.query(User).filter(User.id == data.assigned_to).first()
            if worker is None or worker.role != "worker":
                raise HTTPException(status_code=400, detail="Selected user is not a registered worker.")

    if current_user.role == "worker":
        # Workers may only update status, and only on their assigned issue
        if issue.assigned_to != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Workers can only update issues assigned to them.",
            )
        non_status = data.model_dump(exclude_unset=True, exclude={"status"})
        if non_status:
            raise HTTPException(
                status_code=403,
                detail="Workers may only update the status field.",
            )

    return update_issue(db, issue, data)
