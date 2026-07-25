"""MediMind — FastAPI Application Entry Point"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import logging

from app.api import auth, triage, history, reports, health, crud
from app.core.config import settings
from app.core.database import init_db
from app.core.firebase import get_firestore
from app.services.rag_service import RAGService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 MediMind starting up...")
    await init_db()           # SQLite — users table only
    get_firestore()           # Firebase — connect and verify
    rag = RAGService()
    await rag.initialize()
    app.state.rag_service = rag
    logger.info("✅ MediMind ready!")
    yield
    logger.info("👋 MediMind shutting down...")


app = FastAPI(
    title="MediMind API",
    description="AI-Powered Medical Triage — Firebase + NVIDIA NIM",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(auth.router,    prefix="/api/auth",    tags=["Auth"])
app.include_router(triage.router,  prefix="/api/triage",  tags=["Triage"])
app.include_router(history.router, prefix="/api/history", tags=["History"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(health.router,  prefix="/api",         tags=["Health"])
app.include_router(crud.router,    prefix="/api",         tags=["CRUD"])


@app.get("/")
async def root():
    return {"name": "MediMind API", "version": "3.0.0",
            "database": "Firebase Firestore + SQLite (auth)"}
