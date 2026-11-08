"""
Severity Assessment Agent — deterministic multi-factor implementation.

Assigns a severity level: low | medium | high | critical

Algorithm:
  Scores five independent signals; sums them to produce a severity index.

  Signal 1 — Danger keywords  (max 40 pts)
    Words indicating life risk, injury, accidents, structural collapse.

  Signal 2 — Scale keywords   (max 20 pts)
    Words indicating area / number of people affected.

  Signal 3 — Urgency keywords (max 20 pts)
    Words indicating how long the issue has existed / how acute it is.

  Signal 4 — Category default (max 10 pts)
    Some categories carry inherent severity (e.g. flooding > garbage).

  Signal 5 — Infrastructure keywords (max 10 pts)
    Main road, hospital, school, market → higher impact.

  Total → mapped to severity band:
    ≥ 50 → critical   (life-safety risk)
    ≥ 30 → high       (significant public danger)
    ≥ 15 → medium     (noticeable disruption)
    <  15 → low       (minor inconvenience)

Implementation type: deterministic rule-based
IBM watsonx Orchestrate: NOT YET INTEGRATED (see agents/README.md)
"""
from dataclasses import dataclass, field


# ─── Signal catalogues ────────────────────────────────────────────────────────

DANGER_SIGNALS: list[tuple[str, int]] = [
    ("accident", 15), ("accidental", 10), ("fatal", 20), ("death", 20),
    ("injury", 15), ("injured", 15), ("emergency", 15), ("collapse", 20),
    ("collapsed", 20), ("fire", 12), ("electrocution", 20), ("electric", 8),
    ("dangerous", 10), ("hazardous", 10), ("life risk", 20), ("life-threatening", 20),
    ("toxic", 12), ("disease", 10), ("epidemic", 15), ("contamination", 12),
]

SCALE_SIGNALS: list[tuple[str, int]] = [
    ("large", 5), ("huge", 8), ("massive", 10), ("entire", 8), ("whole", 6),
    ("kilometre", 10), ("km", 6), ("several", 6), ("multiple", 6),
    ("many residents", 10), ("thousands", 12), ("hundreds", 8),
    ("entire ward", 12), ("whole area", 10), ("widespread", 10),
    ("major", 8), ("significant", 5), ("severe", 8), ("extensive", 8),
]

URGENCY_SIGNALS: list[tuple[str, int]] = [
    ("weeks", 8), ("months", 10), ("long time", 8), ("days", 5),
    ("immediate", 10), ("urgent", 10), ("asap", 12), ("immediately", 12),
    ("escalated", 8), ("repeated", 7), ("ignored", 8), ("no action", 8),
    ("worsening", 8), ("getting worse", 10), ("unattended", 7),
]

CATEGORY_BASE_SCORES: dict[str, int] = {
    "flooding":    20,   # direct public safety risk
    "road_damage": 10,
    "pothole":     10,
    "garbage":     5,
    "other":       5,
}

INFRASTRUCTURE_SIGNALS: list[tuple[str, int]] = [
    ("main road", 8), ("highway", 8), ("national highway", 10),
    ("hospital", 10), ("school", 8), ("market", 6), ("flyover", 10),
    ("bridge", 10), ("metro", 8), ("bus stop", 6), ("junction", 6),
    ("ring road", 8), ("outer ring road", 10), ("arterial", 8),
]

# Band thresholds
CRITICAL_THRESHOLD = 50
HIGH_THRESHOLD     = 30
MEDIUM_THRESHOLD   = 15


@dataclass
class SeverityResult:
    severity: str
    score: int
    reason: str
    signals_fired: list[str]
    method: str = "deterministic_multi_factor"


def _score_signals(text: str, signals: list[tuple[str, int]]) -> tuple[int, list[str]]:
    """Return (total_score, list_of_matched_phrases)."""
    total = 0
    matched = []
    for phrase, pts in signals:
        if phrase in text:
            total += pts
            matched.append(phrase)
    return total, matched


def assess_severity(category: str, title: str, description: str) -> SeverityResult:
    """
    Deterministic multi-factor severity assessment.

    Honest about implementation: this is rule-based, not an LLM.
    The score is reproducible and explainable.
    """
    text = f"{title} {description}".lower()

    danger_score,   danger_matched   = _score_signals(text, DANGER_SIGNALS)
    scale_score,    scale_matched    = _score_signals(text, SCALE_SIGNALS)
    urgency_score,  urgency_matched  = _score_signals(text, URGENCY_SIGNALS)
    infra_score,    infra_matched    = _score_signals(text, INFRASTRUCTURE_SIGNALS)
    base_score = CATEGORY_BASE_SCORES.get(category, 5)

    total_score = danger_score + scale_score + urgency_score + infra_score + base_score

    # Cap individual contributions to avoid a single signal dominating
    total_score = min(total_score, 100)

    if total_score >= CRITICAL_THRESHOLD:
        severity = "critical"
    elif total_score >= HIGH_THRESHOLD:
        severity = "high"
    elif total_score >= MEDIUM_THRESHOLD:
        severity = "medium"
    else:
        severity = "low"

    all_matched = danger_matched + scale_matched + urgency_matched + infra_matched

    # Build reason explanation
    parts = []
    if danger_matched:
        parts.append(f"danger signals [{', '.join(danger_matched[:3])}]")
    if scale_matched:
        parts.append(f"scale signals [{', '.join(scale_matched[:2])}]")
    if urgency_matched:
        parts.append(f"urgency signals [{', '.join(urgency_matched[:2])}]")
    if infra_matched:
        parts.append(f"infrastructure [{', '.join(infra_matched[:2])}]")
    parts.append(f"category base ({category}={base_score}pts)")

    reason = (
        f"Severity '{severity}' — total score {total_score}/100. "
        f"Contributing factors: {'; '.join(parts)}."
    )

    return SeverityResult(
        severity=severity,
        score=total_score,
        reason=reason,
        signals_fired=all_matched,
    )
