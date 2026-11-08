# CivicPulse AI

> AI-powered civic intelligence platform for Bengaluru

## Overview

CivicPulse AI is a multi-agent platform that detects, classifies, prioritises, and coordinates responses to civic issues across Bengaluru. Citizens can report potholes, garbage, flooding, and road damage; AI agents then classify, deduplicate, and dispatch each report to the correct ward department — with a human-in-the-loop approval step for high-severity issues.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Python 3.11 + FastAPI + SQLite |
| Agent Orchestration | IBM watsonx Orchestrate _(integration pending)_ |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts |

## Project Structure

```
CivicPulse-AI/
├── frontend/          # React 18 + Vite SPA
│   ├── src/
│   │   ├── api/       # Axios client + endpoint modules
│   │   ├── components/
│   │   │   └── layout/
│   │   ├── pages/
│   │   └── store/     # React Context state
│   ├── index.html
│   └── package.json
└── backend/           # FastAPI application
    ├── app/
    │   ├── agents/    # Agent stubs + watsonx integration point
    │   ├── core/      # Config, database, security
    │   ├── models/    # SQLAlchemy ORM models
    │   ├── routers/   # FastAPI route handlers
    │   ├── schemas/   # Pydantic request/response schemas
    │   └── services/  # Business logic layer
    ├── requirements.txt
    └── alembic.ini
```

## Getting Started

### Frontend (dev)

```bash
cd frontend && npm install && npm run dev
```

The dev server starts on `http://localhost:5173` and proxies `/api` requests to the backend.

### Backend (dev)

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
```

The API starts on `http://localhost:8000`. Interactive docs at `http://localhost:8000/api/docs`.

## Agent Architecture

The multi-agent pipeline runs sequentially on each new issue submission:

```
IssueCreated → Classifier → Prioritiser → Deduplicator → Dispatch Agent
                                                               ↓
                                              (critical/high) Approval Request
```

| Agent | File | Responsibility |
|---|---|---|
| Classifier | `backend/app/agents/classifier.py` | Assigns category (pothole / garbage / flooding / road_damage / other) |
| Prioritiser | `backend/app/agents/prioritiser.py` | Assigns severity (low / medium / high / critical) |
| Deduplicator | `backend/app/agents/deduplicator.py` | Detects near-duplicate issues within 100 m |
| Dispatch Agent | `backend/app/agents/dispatcher.py` | Routes issue to correct ward/department |
| Agent Bus | `backend/app/agents/bus.py` | Orchestrates the sequential pipeline |

> **IBM watsonx Orchestrate** integration is stubbed and isolated in `backend/app/agents/`. All agents have deterministic keyword/rule-based fallbacks so the platform runs fully end-to-end without external credentials. See `backend/app/agents/README.md` for the integration task checklist.

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the existing code style (ESLint for frontend, PEP 8 for backend).
3. Add tests for any new service or agent logic.
4. Open a pull request with a clear description of the change.
