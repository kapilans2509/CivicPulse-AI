"""
SQLAlchemy database engine and session factory.

Migration strategy (dev):
  - `create_all` creates missing *tables* on startup.
  - `_run_migrations` applies additive ALTER TABLE statements for any
    columns that were added after the DB was first created.
    Each statement is wrapped in its own try/except so that
    "duplicate column" errors are silently ignored on a fresh DB.
"""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Additive column migrations
# Add a new entry here whenever a column is added to an existing model.
# SQLite does not support DROP COLUMN so removals must be handled manually.
# ---------------------------------------------------------------------------
_MIGRATIONS: list[str] = [
    # issues.department  — added in phase 2 agent rewrite
    "ALTER TABLE issues ADD COLUMN department TEXT",
    # agent_logs — execution metadata added in phase 2 agent rewrite
    "ALTER TABLE agent_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'success'",
    "ALTER TABLE agent_logs ADD COLUMN duration_ms INTEGER",
    "ALTER TABLE agent_logs ADD COLUMN error_detail TEXT",
    # issues.assigned_to — added for worker assignment (phase 3 RBAC)
    "ALTER TABLE issues ADD COLUMN assigned_to INTEGER REFERENCES users(id)",
]


def _run_migrations() -> None:
    """Apply any pending additive column migrations."""
    with engine.connect() as conn:
        for stmt in _MIGRATIONS:
            try:
                conn.execute(text(stmt))
                conn.commit()
                logger.info("Migration applied: %s", stmt[:60])
            except Exception:
                # Duplicate column or other benign error on a fresh DB —
                # create_all already created the column correctly.
                pass


def init_db() -> None:
    """Create all tables and apply additive migrations on startup."""
    # Import order matters: user must precede issue (FK dependency).
    from app.models import user, issue, agent_log, approval  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def get_db():
    """FastAPI dependency — yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
