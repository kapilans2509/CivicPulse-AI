"""
CivicPulse AI — FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import init_db
from app.routers import issues, agents, approvals, auth, health, stats

app = FastAPI(
    title="CivicPulse AI API",
    description="Backend API for the CivicPulse AI civic intelligence platform.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    init_db()

app.include_router(health.router,    prefix="/api")
app.include_router(auth.router,      prefix="/api")
app.include_router(issues.router,    prefix="/api")
app.include_router(agents.router,    prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(stats.router,     prefix="/api")

# Serve uploaded media (photos)
app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR, check_dir=False), name="media")
