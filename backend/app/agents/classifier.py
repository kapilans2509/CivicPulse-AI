"""
Classification Agent — deterministic multi-signal implementation.

Classifies a civic issue into one of:
  pothole | garbage | flooding | road_damage | other

Algorithm:
  1. Tokenise title + description (lowercase, strip punctuation).
  2. Score each category using a weighted keyword set.
     - Exact word match: weight 2
     - Partial / n-gram match: weight 1
  3. Normalise to [0, 1] confidence.
  4. Apply a minimum-confidence threshold; fall back to "other" if below it.
  5. Return the winner with a human-readable reason string.

Implementation type: deterministic rule-based
IBM watsonx Orchestrate: NOT YET INTEGRATED (see agents/README.md)
"""
import re
from dataclasses import dataclass, field


# ─── Keyword catalogue ────────────────────────────────────────────────────────
# Each entry is (keyword, weight).  Higher weights are stronger signals.

KEYWORD_CATALOGUE: dict[str, list[tuple[str, int]]] = {
    "pothole": [
        ("pothole", 3), ("potholes", 3), ("pit", 2), ("crater", 2),
        ("hole", 1), ("depression", 1), ("caved", 2), ("sinkhole", 3),
        ("dug up", 2), ("broken road", 1),
    ],
    "garbage": [
        ("garbage", 3), ("rubbish", 3), ("trash", 3), ("waste", 2),
        ("litter", 2), ("dump", 2), ("dumping", 3), ("refuse", 2),
        ("solid waste", 3), ("overflowing bin", 3), ("bin", 1),
        ("sanitation", 2), ("filth", 2), ("debris", 1),
    ],
    "flooding": [
        ("flood", 3), ("flooding", 3), ("waterlogging", 3), ("stagnant water", 3),
        ("water stagnation", 3), ("drainage", 2), ("clogged drain", 3),
        ("overflow", 2), ("inundated", 3), ("submerged", 3),
        ("water accumulation", 3), ("rain water", 2), ("puddle", 1),
    ],
    "road_damage": [
        ("road damage", 3), ("damaged road", 3), ("cracked road", 3),
        ("broken road", 3), ("tarmac", 2), ("asphalt", 2), ("road repair", 2),
        ("road condition", 1), ("uneven road", 2), ("road surface", 2),
        ("divider", 1), ("median", 1), ("guardrail", 2),
    ],
}

# Minimum score for a category to be chosen over "other"
MIN_CONFIDENCE = 0.15


@dataclass
class ClassificationResult:
    category: str
    confidence: float
    reason: str
    matched_keywords: list[str]
    scores: dict[str, float]
    method: str = "deterministic_keyword_weighted"


def _tokenise(text: str) -> str:
    """Lowercase and normalise whitespace; keep punctuation for phrase matching."""
    return re.sub(r"\s+", " ", text.lower().strip())


def classify_issue(title: str, description: str) -> ClassificationResult:
    """
    Deterministic weighted keyword classifier.

    Honest about implementation: this is rule-based, not an LLM.
    Returns a ClassificationResult with confidence and a reason string
    that explains which keywords drove the classification.
    """
    text = _tokenise(f"{title} {description}")
    raw_scores: dict[str, float] = {}
    all_matched: dict[str, list[str]] = {}

    for category, entries in KEYWORD_CATALOGUE.items():
        score = 0.0
        matched = []
        for keyword, weight in entries:
            # Use word-boundary aware matching for single words; phrase matching for multi-word
            if " " in keyword:
                if keyword in text:
                    score += weight
                    matched.append(keyword)
            else:
                if re.search(rf"\b{re.escape(keyword)}\b", text):
                    score += weight
                    matched.append(keyword)
        raw_scores[category] = score
        all_matched[category] = matched

    total = sum(raw_scores.values())
    if total == 0:
        return ClassificationResult(
            category="other",
            confidence=0.0,
            reason="No civic-issue keywords found in the complaint text.",
            matched_keywords=[],
            scores={k: 0.0 for k in raw_scores},
        )

    norm_scores = {k: round(v / total, 3) for k, v in raw_scores.items()}
    best = max(norm_scores, key=lambda k: norm_scores[k])
    best_conf = norm_scores[best]

    if best_conf < MIN_CONFIDENCE:
        reason = (
            f"Insufficient signal (best={best}, conf={best_conf:.0%}). "
            "Falling back to 'other'."
        )
        return ClassificationResult(
            category="other",
            confidence=best_conf,
            reason=reason,
            matched_keywords=[],
            scores=norm_scores,
        )

    matched_kws = all_matched[best]
    reason = (
        f"Classified as '{best}' with {best_conf:.0%} confidence. "
        f"Matched keywords: {', '.join(matched_kws) if matched_kws else 'none (default heuristic)'}."
    )

    return ClassificationResult(
        category=best,
        confidence=best_conf,
        reason=reason,
        matched_keywords=matched_kws,
        scores=norm_scores,
    )
