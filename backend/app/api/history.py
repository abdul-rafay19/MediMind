"""MediMind History API — Firestore backed"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.firebase import fs_get_sessions, fs_get_session, fs_delete_session
from app.models.user import User

router = APIRouter()


@router.get("/")
async def get_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = await fs_get_sessions(current_user.id, limit=50)
    # Return summary fields only
    return [
        {
            "id":              s["id"],
            "chief_complaint": s.get("chief_complaint", ""),
            "triage_level":    s.get("triage_level", ""),
            "triage_color":    s.get("triage_color", ""),
            "created_at":      s.get("created_at", ""),
        }
        for s in sessions
    ]


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await fs_get_session(session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await fs_delete_session(session_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}
