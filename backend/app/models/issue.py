from datetime import datetime, timezone
from sqlalchemy import Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Classification (set by Classifier Agent)
    category: Mapped[str | None] = mapped_column(String(80))   # pothole, garbage, flooding, road_damage, other
    severity: Mapped[str | None] = mapped_column(String(20))   # low, medium, high, critical

    # Routing (set by Department Routing Agent)
    department: Mapped[str | None] = mapped_column(String(200))

    # Location
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    ward: Mapped[str | None] = mapped_column(String(120))

    # Media
    photo_path: Mapped[str | None] = mapped_column(String(500))

    # Lifecycle
    status: Mapped[str] = mapped_column(String(50), default="pending")
    # pending → classified → dispatched → awaiting_approval → in_progress → resolved | rejected

    # Deduplication
    is_duplicate: Mapped[bool] = mapped_column(default=False)
    canonical_issue_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("issues.id"), nullable=True)

    # Reporter
    reporter_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # Worker assignment (set by officer/admin)
    assigned_to: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    logs = relationship("AgentLog", back_populates="issue", cascade="all, delete-orphan")
    approval = relationship("Approval", back_populates="issue", uselist=False, cascade="all, delete-orphan")
