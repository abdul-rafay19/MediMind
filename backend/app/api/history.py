"""MediMind History API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.session import TriageSession
from app.models.schemas import SessionSummary, SessionDetail

router = APIRouter()


@router.get("/", response_model=List[SessionSummary])
async def get_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TriageSession)
        .where(TriageSession.user_id == current_user.id)
        .order_by(TriageSession.created_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return [SessionSummary.model_validate(s) for s in sessions]


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TriageSession).where(
            TriageSession.id == session_id,
            TriageSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetail.model_validate(session)


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TriageSession).where(
            TriageSession.id == session_id,
            TriageSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    return {"message": "Session deleted"}
