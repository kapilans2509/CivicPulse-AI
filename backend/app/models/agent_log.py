from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    issue_id: Mapped[int] = mapped_column(Integer, ForeignKey("issues.id"), nullable=False, index=True)
    agent_name: Mapped[str] = mapped_column(String(80), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)

    # Structured output from the agent (category, severity, department, etc.)
    payload: Mapped[dict | None] = mapped_column(JSON)

    # Execution metadata
    status: Mapped[str] = mapped_column(String(20), default="success")  # success | error | skipped
    duration_ms: Mapped[int | None] = mapped_column(Integer)            # wall-clock ms
    error_detail: Mapped[str | None] = mapped_column(Text)              # exception message if status=error

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    issue = relationship("Issue", back_populates="logs")
