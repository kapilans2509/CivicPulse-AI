"""
Service for recording agent actions against an issue.
"""
from sqlalchemy.orm import Session
from app.models.agent_log import AgentLog


def log_agent_action(
    db: Session,
    issue_id: int,
    agent_name: str,
    action: str,
    payload: dict | None = None,
    status: str = "success",
    duration_ms: int | None = None,
    error_detail: str | None = None,
) -> AgentLog:
    entry = AgentLog(
        issue_id=issue_id,
        agent_name=agent_name,
        action=action,
        payload=payload or {},
        status=status,
        duration_ms=duration_ms,
        error_detail=error_detail,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
