from datetime import datetime, timezone
from sqlalchemy import Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    issue_id: Mapped[int] = mapped_column(Integer, ForeignKey("issues.id"), unique=True, nullable=False)
    requested_by: Mapped[str] = mapped_column(String(80), default="dispatch_agent")
    decision: Mapped[str | None] = mapped_column(String(20))  # approved | rejected | pending
    notes: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    issue = relationship("Issue", back_populates="approval")
