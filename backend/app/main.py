"""
MediMind — AI-Powered Medical Triage System
Main FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import logging

from app.api import auth, triage, history, reports, health
from app.core.config import settings
from app.core.database import init_db
from app.services.rag_service import RAGService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    logger.info("🚀 MediMind starting up...")
    await init_db()
    rag = RAGService()
    await rag.initialize()
    app.state.rag_service = rag
    logger.info("✅ MediMind ready!")
    yield
    logger.info("👋 MediMind shutting down...")


app = FastAPI(
    title="MediMind API",
    description="AI-Powered Medical Triage & Health Assistant",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Routers
app.include_router(auth.router,    prefix="/api/auth",    tags=["Authentication"])
app.include_router(triage.router,  prefix="/api/triage",  tags=["Triage"])
app.include_router(history.router, prefix="/api/history", tags=["History"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(health.router,  prefix="/api",         tags=["Health"])


@app.get("/")
async def root():
    return {
        "name": "MediMind API",
        "version": "1.0.0",
        "status": "operational",
        "message": "Intelligence in Every Symptom. Access for Everyone.",
    }
