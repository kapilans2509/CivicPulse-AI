"""
Duplicate Detection Agent — geographic + semantic similarity implementation.

Detects whether a newly submitted issue is a duplicate of an existing open issue.

Algorithm:
  Phase 1 — Geographic filter
    Query all non-duplicate, non-resolved/rejected issues of the same category
    within a bounding box (roughly 200 m × 200 m).

  Phase 2 — Haversine distance
    For each candidate from Phase 1, compute exact distance.
    If distance ≤ GEO_THRESHOLD_M, candidate is a potential duplicate.

  Phase 3 — Title word overlap
    Compute Jaccard similarity on title tokens.
    If Jaccard ≥ TITLE_SIMILARITY_THRESHOLD, it is a near-duplicate even beyond
    the geo radius (up to EXTENDED_RADIUS_M).

  Decision:
    Duplicate if (geo ≤ GEO_THRESHOLD_M) OR
                 (geo ≤ EXTENDED_RADIUS_M AND title_jaccard ≥ TITLE_SIMILARITY_THRESHOLD)

    Returns the oldest matching canonical issue (lowest id).

Implementation type: deterministic (haversine + Jaccard)
IBM watsonx Orchestrate: NOT YET INTEGRATED — semantic embedding similarity
  would replace the Jaccard step in the production integration.
"""
import math
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session
from app.models.issue import Issue


# ─── Thresholds ───────────────────────────────────────────────────────────────

GEO_THRESHOLD_M         = 100   # issues within 100 m of same category = duplicate
EXTENDED_RADIUS_M       = 300   # extended radius if title is also similar
TITLE_SIMILARITY_THRESHOLD = 0.40  # Jaccard coefficient on title tokens

# Approximate lat/lon deltas for bounding box pre-filter (avoids full table scan)
# 200 m ≈ 0.0018 degrees latitude; 0.0022 degrees longitude at Bengaluru's latitude
LAT_DELTA  = 0.0025
LON_DELTA  = 0.0030


@dataclass
class DuplicateResult:
    is_duplicate: bool
    canonical_issue_id: int | None
    distance_m: float | None
    title_jaccard: float | None
    reason: str
    method: str = "haversine_jaccard"


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two lat/lon points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi   = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _title_tokens(title: str) -> set[str]:
    """Lowercase title → set of meaningful tokens (removes stop words)."""
    STOP = {
        "a", "an", "the", "on", "in", "at", "near", "of", "and", "or", "is",
        "are", "was", "been", "to", "for", "with", "this", "that", "there",
        "it", "by", "be", "has", "have", "not",
    }
    tokens = re.findall(r"[a-z]+", title.lower())
    return {t for t in tokens if t not in STOP and len(t) > 2}


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def check_duplicate(
    db: Session,
    category: str,
    latitude: float,
    longitude: float,
    title: str,
    exclude_id: int | None = None,
) -> DuplicateResult:
    """
    Deterministic duplicate detection using geographic distance + title similarity.

    Honest: Jaccard on title tokens is not semantic understanding. A future
    watsonx integration would use sentence embeddings for deeper similarity.
    """
    # Phase 1: bounding box pre-filter
    candidates = (
        db.query(Issue)
        .filter(
            Issue.category == category,
            Issue.is_duplicate == False,  # noqa: E712
            Issue.status.notin_(["resolved", "rejected"]),
            Issue.latitude.between(latitude - LAT_DELTA, latitude + LAT_DELTA),
            Issue.longitude.between(longitude - LON_DELTA, longitude + LON_DELTA),
        )
        .order_by(Issue.id)   # oldest canonical first
        .all()
    )

    best_canonical: Issue | None = None
    best_dist: float = float("inf")
    best_jaccard: float = 0.0

    new_tokens = _title_tokens(title)

    for cand in candidates:
        if exclude_id and cand.id == exclude_id:
            continue

        dist = _haversine_m(latitude, longitude, cand.latitude, cand.longitude)
        jac  = _jaccard(new_tokens, _title_tokens(cand.title))

        is_geo_dup      = dist <= GEO_THRESHOLD_M
        is_extended_dup = dist <= EXTENDED_RADIUS_M and jac >= TITLE_SIMILARITY_THRESHOLD

        if is_geo_dup or is_extended_dup:
            if best_canonical is None or dist < best_dist:
                best_canonical = cand
                best_dist      = dist
                best_jaccard   = jac

    if best_canonical is not None:
        reason = (
            f"Duplicate of issue #{best_canonical.id}. "
            f"Distance: {best_dist:.0f} m (threshold {GEO_THRESHOLD_M} m); "
            f"title Jaccard similarity: {best_jaccard:.0%}."
        )
        return DuplicateResult(
            is_duplicate=True,
            canonical_issue_id=best_canonical.id,
            distance_m=round(best_dist, 1),
            title_jaccard=round(best_jaccard, 3),
            reason=reason,
        )

    return DuplicateResult(
        is_duplicate=False,
        canonical_issue_id=None,
        distance_m=None,
        title_jaccard=None,
        reason=(
            f"No duplicate found. Checked {len(candidates)} candidate(s) in "
            f"{GEO_THRESHOLD_M} m radius for category '{category}'."
        ),
    )
