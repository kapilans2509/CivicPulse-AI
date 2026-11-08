"""
Department Routing Agent — BBMP department lookup with zone enrichment.

Routes a classified issue to the appropriate BBMP department and ward zone.

Algorithm:
  1. Look up primary department by category.
  2. Look up sub-unit (division) by geographic zone (lat/lon bounding box).
  3. Generate routing explanation.
  4. Flag whether admin approval is required (high + critical severity).

BBMP zone boundaries are approximate (4 administrative zones).
Data source: public BBMP administrative structure.

Implementation type: deterministic rule-based
IBM watsonx Orchestrate: NOT YET INTEGRATED
"""
from dataclasses import dataclass


# ─── Department mapping ───────────────────────────────────────────────────────

DEPARTMENT_BY_CATEGORY: dict[str, dict] = {
    "pothole": {
        "department": "BBMP Roads & Infrastructure",
        "contact":    "1533 / bbmproads@bbmp.gov.in",
        "sla_days":   7,
    },
    "garbage": {
        "department": "BBMP Solid Waste Management",
        "contact":    "1533 / swm@bbmp.gov.in",
        "sla_days":   2,
    },
    "flooding": {
        "department": "BBMP Storm Water Drains (SWD)",
        "contact":    "1533 / swd@bbmp.gov.in",
        "sla_days":   3,
    },
    "road_damage": {
        "department": "BBMP Roads & Infrastructure",
        "contact":    "1533 / bbmproads@bbmp.gov.in",
        "sla_days":   14,
    },
    "other": {
        "department": "BBMP General Services",
        "contact":    "1533 / helpdesk@bbmp.gov.in",
        "sla_days":   10,
    },
}

# ─── Geographic zone definitions ──────────────────────────────────────────────
# Approximate bounding boxes for 5 BBMP administrative zones.
# Format: (min_lat, max_lat, min_lon, max_lon)

ZONE_BOXES: list[dict] = [
    {
        "zone": "South",
        "division": "South Division",
        "bounds": (12.85, 12.95, 77.55, 77.65),
    },
    {
        "zone": "East",
        "division": "East Division",
        "bounds": (12.95, 13.05, 77.65, 77.78),
    },
    {
        "zone": "West",
        "division": "West Division",
        "bounds": (12.95, 13.05, 77.48, 77.58),
    },
    {
        "zone": "North",
        "division": "North Division",
        "bounds": (13.00, 13.15, 77.55, 77.68),
    },
    {
        "zone": "Central",
        "division": "Central Division (Bruhat Bengaluru)",
        "bounds": (12.93, 13.02, 77.56, 77.68),
    },
]

# Escalation to BBMP Commissioner required at or above this severity
COMMISSIONER_ESCALATION_SEVERITY = {"critical"}

# Admin approval required (creates Approval record)
APPROVAL_REQUIRED_SEVERITY = {"high", "critical"}


@dataclass
class RoutingResult:
    department: str
    division: str
    zone: str
    contact: str
    sla_days: int
    requires_approval: bool
    escalate_to_commissioner: bool
    reason: str
    method: str = "deterministic_bbmp_routing"


def _lookup_zone(latitude: float, longitude: float) -> tuple[str, str]:
    """Return (zone, division) for a lat/lon, or ('Unknown', 'BBMP HQ') if outside all boxes."""
    for z in ZONE_BOXES:
        min_lat, max_lat, min_lon, max_lon = z["bounds"]
        if min_lat <= latitude <= max_lat and min_lon <= longitude <= max_lon:
            return z["zone"], z["division"]
    return "Unknown", "BBMP Headquarters"


def route_issue(
    category: str,
    severity: str,
    latitude: float,
    longitude: float,
) -> RoutingResult:
    """
    Deterministic BBMP routing.

    Determines department, geographic division, SLA, and approval requirements.
    """
    dept_info = DEPARTMENT_BY_CATEGORY.get(category, DEPARTMENT_BY_CATEGORY["other"])
    zone, division = _lookup_zone(latitude, longitude)

    requires_approval         = severity in APPROVAL_REQUIRED_SEVERITY
    escalate_to_commissioner  = severity in COMMISSIONER_ESCALATION_SEVERITY

    reason_parts = [
        f"Category '{category}' → {dept_info['department']}.",
        f"Geographic zone: {zone} ({division}).",
        f"SLA: {dept_info['sla_days']} day(s).",
    ]
    if requires_approval:
        reason_parts.append(
            f"Severity '{severity}' requires admin approval before dispatch."
        )
    if escalate_to_commissioner:
        reason_parts.append(
            "Critical severity — flagged for BBMP Commissioner escalation."
        )

    return RoutingResult(
        department=dept_info["department"],
        division=division,
        zone=zone,
        contact=dept_info["contact"],
        sla_days=dept_info["sla_days"],
        requires_approval=requires_approval,
        escalate_to_commissioner=escalate_to_commissioner,
        reason=" ".join(reason_parts),
    )
