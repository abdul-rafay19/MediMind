"""MediMind Triage API — Firestore backed"""
import uuid, logging
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.firebase import (
    fs_create_session, fs_get_session, fs_update_session
)
from app.models.user import User
from app.models.schemas import TriageRequest, TriageResponse, FollowUpRequest, FollowUpResponse
from app.services.llm_service import LLMService
from datetime import datetime, timezone

logger      = logging.getLogger(__name__)
router      = APIRouter()
llm_service = LLMService()


async def _run_triage(request_body: TriageRequest, user_id, rag_service):
    rag_sources = await rag_service.retrieve(request_body.symptoms, top_k=5)
    try:
        profile, triage = await llm_service.extract_and_triage(request_body, rag_sources)
    except Exception as e:
        logger.error(f"Triage failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    session_token = str(uuid.uuid4())
    doc = await fs_create_session(user_id, {
        "session_token":      session_token,
        "chief_complaint":    profile.chief_complaint,
        "symptoms_raw":       request_body.symptoms,
        "symptoms_extracted": profile.model_dump(),
        "triage_level":       triage.level,
        "triage_color":       triage.color,
        "triage_reasoning":   triage.reasoning,
        "triage_response":    triage.response,
        "rag_sources":        rag_sources,
        "follow_up_qa":       [],
        "language":           request_body.language,
    })

    return TriageResponse(
        session_id      = doc["id"],       # Firestore string ID
        session_token   = session_token,
        symptom_profile = profile,
        triage_result   = triage,
        created_at      = datetime.now(timezone.utc),
    )


@router.post("/analyze", response_model=TriageResponse)
async def analyze_symptoms(
    request_body: TriageRequest, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _run_triage(request_body, current_user.id, request.app.state.rag_service)


@router.post("/guest-analyze", response_model=TriageResponse)
async def guest_analyze(request_body: TriageRequest, request: Request):
    return await _run_triage(request_body, None, request.app.state.rag_service)


@router.post("/followup", response_model=FollowUpResponse)
async def followup_question(
    body: FollowUpRequest, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await fs_get_session(str(body.session_id), current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    rag_sources = await request.app.state.rag_service.retrieve(body.question, top_k=3)
    answer = await llm_service.answer_followup(
        body.question,
        {"chief_complaint": session.get("chief_complaint"),
         "triage_level":    session.get("triage_level"),
         "triage_response": session.get("triage_response")},
        rag_sources, body.language,
    )
    qa_list = list(session.get("follow_up_qa") or [])
    qa_list.append({"q": body.question, "a": answer})
    await fs_update_session(str(body.session_id), {"follow_up_qa": qa_list}, current_user.id)

    return FollowUpResponse(question=body.question, answer=answer, sources=rag_sources)
