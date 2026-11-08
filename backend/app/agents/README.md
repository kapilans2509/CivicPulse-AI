# CivicPulse AI — Agent Architecture

## Overview

The agent pipeline runs synchronously on every new issue submission.
Each agent is isolated: a failure in one step is caught, logged, and the
pipeline continues in degraded mode. All decisions are written to the
`agent_logs` table and surfaced via `GET /api/agents/pipeline/{issue_id}`.

---

## Pipeline Steps

```
Issue submitted
      │
      ▼
┌─────────────────────┐
│ 1. Classification   │  classifier.py
│    Agent            │  Assigns category + confidence score
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. Severity         │  prioritiser.py
│    Assessment Agent │  Assigns severity (low/medium/high/critical)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. Duplicate        │  deduplicator.py
│    Detection Agent  │  Checks geo proximity + title similarity
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. Department       │  dispatcher.py
│    Routing Agent    │  Assigns BBMP department, zone, SLA
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 5. Dispatch Agent   │  bus.py (inline)
│                     │  Creates Approval if needed; sets final status
└─────────────────────┘
```

---

## Agent Implementations

### 1. Classification Agent — `classifier.py`
**Status: Implemented (deterministic)**

Assigns a category (`pothole`, `garbage`, `flooding`, `road_damage`, `other`)
using a weighted keyword scoring model.

- Each category has a keyword list with per-keyword weights
- The classifier scores all input tokens against all categories
- The winning category needs ≥ 1 matched keyword; ties go to `other`
- Returns `confidence` (0.0–1.0), `reason`, `matched_keywords`, `scores`
- `method` field is `"keyword_scoring"` — never claims to be an LLM

**IBM watsonx integration point:**
Replace `classify_issue()` with a call to a watsonx.ai text classification
model or a watsonx Orchestrate skill. The `ClassificationResult` dataclass
contract must be preserved.

---

### 2. Severity Assessment Agent — `prioritiser.py`
**Status: Implemented (deterministic)**

Assigns severity using a 5-signal multi-factor scoring model:

| Signal | Max points | Examples |
|--------|-----------|---------|
| Danger | 30 | "accident", "collapse", "electrocution" |
| Scale  | 20 | "large", "widespread", "entire road" |
| Urgency | 20 | "urgent", "emergency", "immediate" |
| Infrastructure | 15 | "hospital", "school", "main road" |
| Category base | 15 | pothole=12, flooding=15, road_damage=13 |

Score → severity mapping:

| Score | Severity |
|-------|----------|
| ≥ 65  | critical |
| ≥ 45  | high     |
| ≥ 25  | medium   |
| < 25  | low      |

Returns `severity`, `score`, `reason`, `signals_fired`.
`method` field is `"multi_factor_scoring"`.

**IBM watsonx integration point:**
Replace `assess_severity()` with a watsonx.ai prompt that receives the
issue title, description, and category, and returns a structured severity
assessment. The `SeverityResult` dataclass contract must be preserved.

---

### 3. Duplicate Detection Agent — `deduplicator.py`
**Status: Implemented (deterministic)**

Detects duplicate reports using two signals:

1. **Haversine distance** — finds issues of the same category within a
   configurable radius (default 100 m). Bounding-box pre-filter avoids
   full-table scans.
2. **Jaccard title similarity** — measures word-set overlap between issue
   titles. Threshold: 0.4.

An issue is a duplicate if **both** conditions are met.

Returns `is_duplicate`, `canonical_issue_id`, `distance_m`, `title_jaccard`,
`reason`. `method` field is `"haversine_jaccard"`.

**IBM watsonx integration point:**
Semantic embedding similarity (via watsonx.ai embeddings API) would improve
recall for paraphrased duplicate titles. The `DuplicateResult` dataclass
contract must be preserved.

---

### 4. Department Routing Agent — `dispatcher.py`
**Status: Implemented (deterministic)**

Maps issues to BBMP departments using two layers:

1. **Category → department** — static lookup table covering 5 issue types
2. **Geographic zone** — Bengaluru divided into 5 BBMP zones (North, South,
   East, West, Central) by lat/lon bounding boxes. Zone determines the
   division name and contact number.

SLA days and approval requirements are determined by severity:

| Severity | SLA (days) | Requires approval |
|----------|-----------|------------------|
| critical | 1         | Yes              |
| high     | 3         | Yes              |
| medium   | 7         | No               |
| low      | 14        | No               |

Returns `department`, `division`, `zone`, `contact`, `sla_days`,
`requires_approval`, `escalate_to_commissioner`, `reason`.
`method` field is `"rule_based_routing"`.

**IBM watsonx integration point:**
Replace with a watsonx Orchestrate skill that performs intelligent routing
based on real-time BBMP workload, officer availability, and issue priority
queues. The `RoutingResult` dataclass contract must be preserved.

---

### 5. Orchestrator — `bus.py`
**Status: Implemented**

Coordinates all agents in sequence with:

- Per-step timing using `time.perf_counter()`
- Per-step exception isolation (degraded mode on failure)
- Approval gate logic (high/critical non-duplicates → `awaiting_approval`)
- Full `agent_logs` writes for every step

The orchestrator enforces the contract: **it never automatically marks an
issue as "resolved"**.

**IBM watsonx Orchestrate integration point:**
The `run_pipeline()` function is the primary integration boundary. Replace
the sequential Python function calls with watsonx Orchestrate flow invocations.
Each agent becomes an Orchestrate skill. The orchestrator becomes an
Orchestrate flow that handles skill sequencing, retries, and human-in-the-loop
approval steps natively.

---

## Human Approval Workflow

High and critical severity issues (that are not duplicates) are placed in
`awaiting_approval` status and a record is created in the `approvals` table.

Operators act via:
- `GET /api/approvals/pending` — list all pending approvals
- `POST /api/approvals/{issue_id}/decide` — approve or reject with a note

The issue status updates to `in_progress` (approved) or `rejected` accordingly.
The orchestrator never auto-approves. Every decision requires a human action.

**IBM watsonx Orchestrate integration point:**
Replace the manual approval API with a watsonx Orchestrate human-in-the-loop
task that routes to the correct BBMP officer inbox based on department and
severity, with configurable escalation timers.

---

## What Is NOT an LLM

All agent logic in this codebase is **deterministic rule-based code**:

| Agent | Actual method |
|-------|--------------|
| classifier_agent | Weighted keyword scoring |
| severity_agent | Multi-factor signal scoring |
| deduplicator_agent | Haversine distance + Jaccard similarity |
| routing_agent | Rule-based department/zone lookup |

No agent in this codebase calls any external AI API. The `method` field in
each agent result explicitly identifies the algorithm used. This is honest
about what the system does.

The IBM watsonx integration tasks above describe exactly where and how real
LLM-backed agents should replace these deterministic implementations.

---

## Adding a New Agent

1. Create `backend/app/agents/my_agent.py` with a `@dataclass` result type
   and a top-level function that takes plain Python arguments.
2. Import and call it in `bus.py`, following the existing timing + error
   isolation pattern.
3. Add the step's `log_agent_action()` call to persist the decision.
4. If the new agent adds columns to the DB models, add `ALTER TABLE` entries
   to `_MIGRATIONS` in `database.py`.
