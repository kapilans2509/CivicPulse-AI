"""
Orchestrator — coordinates all agents in the correct sequence.

Pipeline (5 steps):
  1. Classification Agent    -> assigns category + confidence
  2. Severity Agent          -> assigns severity + score + reason
  3. Duplicate Detection     -> checks geo + title similarity
  4. Department Routing      -> assigns department, zone, SLA
  5. Dispatch Agent          -> creates Approval if needed, sets final status

Each step is isolated: a failure in one step is recorded and the pipeline
continues (degraded mode) rather than aborting the entire run.

Orchestrator contract:
  - NEVER automatically marks an issue as "resolved".
  - Writes every decision to the agent_logs table with status, duration_ms.
  - Returns a PipelineResult that is stored and surfaced via the API.
"""
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.agents.classifier   import classify_issue,   ClassificationResult
from app.agents.prioritiser  import assess_severity,   SeverityResult
from app.agents.deduplicator import check_duplicate,   DuplicateResult
from app.agents.dispatcher   import route_issue,       RoutingResult
from app.models.issue    import Issue
from app.models.approval import Approval
from app.services.agent_log_service import log_agent_action

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class StepResult:
    agent:       str
    action:      str
    status:      str        # success | error | skipped
    duration_ms: int
    payload:     dict
    error:       str | None = None


@dataclass
class PipelineResult:
    issue_id:     int
    steps:        list[StepResult] = field(default_factory=list)
    final_status: str = "pending"
    completed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def success_count(self) -> int:
        return sum(1 for s in self.steps if s.status == "success")

    @property
    def error_count(self) -> int:
        return sum(1 for s in self.steps if s.status == "error")

    @property
    def has_errors(self) -> bool:
        return self.error_count > 0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _elapsed_ms(start: float) -> int:
    """Return elapsed milliseconds since `start` (from time.perf_counter())."""
    return int((time.perf_counter() - start) * 1000)


def _fallback_routing() -> RoutingResult:
    """Emergency fallback used only when routing agent raises an exception."""
    return RoutingResult(
        department="BBMP General Services",
        division="BBMP Headquarters",
        zone="Unknown",
        contact="1533",
        sla_days=10,
        requires_approval=False,
        escalate_to_commissioner=False,
        reason="Routing agent error — assigned to General Services as fallback.",
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_pipeline(db: Session, issue: Issue) -> PipelineResult:
    """
    Run the full 5-step agent pipeline for a newly created issue.

    Each step times itself and catches exceptions independently so that a
    failure in one agent does not prevent subsequent agents from running.
    """
    logger.info("Orchestrator: pipeline started for issue #%s", issue.id)
    result = PipelineResult(issue_id=issue.id)

    # ── Step 1: Classification ──────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        clf = classify_issue(issue.title, issue.description)
        issue.category = clf.category
        payload = {
            "category":         clf.category,
            "confidence":       clf.confidence,
            "reason":           clf.reason,
            "matched_keywords": clf.matched_keywords,
            "scores":           clf.scores,
            "method":           clf.method,
        }
        step = StepResult("classifier_agent", "classify", "success", _elapsed_ms(t0), payload)
    except Exception as exc:
        logger.error("Classifier failed for issue #%s: %s", issue.id, exc, exc_info=True)
        step = StepResult("classifier_agent", "classify", "error", _elapsed_ms(t0), {}, str(exc))
        issue.category = "other"

    result.steps.append(step)
    log_agent_action(db, issue.id, step.agent, step.action, step.payload,
                     step.status, step.duration_ms, step.error)

    # ── Step 2: Severity Assessment ─────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        sev = assess_severity(issue.category, issue.title, issue.description)
        issue.severity = sev.severity
        issue.status   = "classified"
        payload = {
            "severity":      sev.severity,
            "score":         sev.score,
            "reason":        sev.reason,
            "signals_fired": sev.signals_fired,
            "method":        sev.method,
        }
        step = StepResult("severity_agent", "assess_severity", "success", _elapsed_ms(t0), payload)
    except Exception as exc:
        logger.error("Severity agent failed for issue #%s: %s", issue.id, exc, exc_info=True)
        step = StepResult("severity_agent", "assess_severity", "error", _elapsed_ms(t0), {}, str(exc))
        issue.severity = "medium"

    result.steps.append(step)
    log_agent_action(db, issue.id, step.agent, step.action, step.payload,
                     step.status, step.duration_ms, step.error)

    # ── Step 3: Duplicate Detection ─────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        dup = check_duplicate(
            db,
            category=issue.category,
            latitude=issue.latitude,
            longitude=issue.longitude,
            title=issue.title,
            exclude_id=issue.id,
        )
        issue.is_duplicate       = dup.is_duplicate
        issue.canonical_issue_id = dup.canonical_issue_id
        payload = {
            "is_duplicate":   dup.is_duplicate,
            "canonical_id":   dup.canonical_issue_id,
            "distance_m":     dup.distance_m,
            "title_jaccard":  dup.title_jaccard,
            "reason":         dup.reason,
            "method":         dup.method,
        }
        step = StepResult("deduplicator_agent", "check_duplicate", "success", _elapsed_ms(t0), payload)
    except Exception as exc:
        logger.error("Deduplicator failed for issue #%s: %s", issue.id, exc, exc_info=True)
        step = StepResult("deduplicator_agent", "check_duplicate", "error", _elapsed_ms(t0), {}, str(exc))

    result.steps.append(step)
    log_agent_action(db, issue.id, step.agent, step.action, step.payload,
                     step.status, step.duration_ms, step.error)

    # ── Step 4: Department Routing ──────────────────────────────────────────
    routing: RoutingResult | None = None
    t0 = time.perf_counter()
    try:
        routing = route_issue(
            category=issue.category,
            severity=issue.severity,
            latitude=issue.latitude,
            longitude=issue.longitude,
        )
        issue.department = routing.department
        issue.ward       = routing.division
        issue.status     = "dispatched"
        payload = {
            "department":               routing.department,
            "division":                 routing.division,
            "zone":                     routing.zone,
            "contact":                  routing.contact,
            "sla_days":                 routing.sla_days,
            "requires_approval":        routing.requires_approval,
            "escalate_to_commissioner": routing.escalate_to_commissioner,
            "reason":                   routing.reason,
            "method":                   routing.method,
        }
        step = StepResult("routing_agent", "route_issue", "success", _elapsed_ms(t0), payload)
    except Exception as exc:
        logger.error("Routing agent failed for issue #%s: %s", issue.id, exc, exc_info=True)
        step = StepResult("routing_agent", "route_issue", "error", _elapsed_ms(t0), {}, str(exc))
        routing = _fallback_routing()

    result.steps.append(step)
    log_agent_action(db, issue.id, step.agent, step.action, step.payload,
                     step.status, step.duration_ms, step.error)

    # ── Step 5: Dispatch ────────────────────────────────────────────────────
    # Approval gate: high/critical non-duplicate issues must be approved.
    # Duplicates inherit the canonical issue's workflow — no new approval.
    t0 = time.perf_counter()
    try:
        needs_approval = (
            routing is not None
            and routing.requires_approval
            and not issue.is_duplicate
        )
        if needs_approval:
            approval = Approval(
                issue_id=issue.id,
                decision="pending",
                requested_by="dispatch_agent",
            )
            db.add(approval)
            issue.status    = "awaiting_approval"
            dispatch_action = "request_approval"
            dispatch_reason = (
                f"Severity '{issue.severity}' requires admin approval. "
                f"Assigned to {issue.department}."
            )
        else:
            issue.status    = "in_progress"
            dispatch_action = "dispatch_direct"
            dispatch_reason = (
                (
                    "No approval required (severity allows direct dispatch). "
                    f"Assigned to {issue.department}."
                )
                if not issue.is_duplicate
                else f"Duplicate of issue #{issue.canonical_issue_id}; no new dispatch."
            )

        payload = {
            "final_status":   issue.status,
            "needs_approval": needs_approval,
            "department":     issue.department,
            "is_duplicate":   issue.is_duplicate,
            "reason":         dispatch_reason,
        }
        step = StepResult("dispatch_agent", dispatch_action, "success", _elapsed_ms(t0), payload)
    except Exception as exc:
        logger.error("Dispatch failed for issue #%s: %s", issue.id, exc, exc_info=True)
        step = StepResult("dispatch_agent", "dispatch", "error", _elapsed_ms(t0), {}, str(exc))
        issue.status = "in_progress"

    result.steps.append(step)
    log_agent_action(db, issue.id, step.agent, step.action, step.payload,
                     step.status, step.duration_ms, step.error)

    # ── Commit all model changes ────────────────────────────────────────────
    db.commit()

    result.final_status = issue.status
    logger.info(
        "Orchestrator: pipeline complete for issue #%s — status=%s steps=%d errors=%d",
        issue.id, issue.status, len(result.steps), result.error_count,
    )
    return result
