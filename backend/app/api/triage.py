"""MediMind Triage API"""
import uuid
import logging
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.session import TriageSession
from app.models.schemas import TriageRequest, TriageResponse, FollowUpRequest, FollowUpResponse
from app.services.llm_service import LLMService

logger     = logging.getLogger(__name__)
router     = APIRouter()
llm_service = LLMService()


async def _run_triage(request_body: TriageRequest, user_id, rag_service, db: AsyncSession):
    rag_sources = await rag_service.retrieve(request_body.symptoms, top_k=5)
    try:
        profile, triage = await llm_service.extract_and_triage(request_body, rag_sources)
    except Exception as e:
        logger.error(f"Triage failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    session_token = str(uuid.uuid4())
    session = TriageSession(
        user_id            = user_id,
        session_token      = session_token,
        chief_complaint    = profile.chief_complaint,
        symptoms_raw       = request_body.symptoms,
        symptoms_extracted = profile.model_dump(),
        triage_level       = triage.level,    # plain string now
        triage_color       = triage.color,
        triage_reasoning   = triage.reasoning,
        triage_response    = triage.response,
        rag_sources        = rag_sources,
        follow_up_qa       = [],
        language           = request_body.language,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)

    return TriageResponse(
        session_id      = session.id,
        session_token   = session_token,
        symptom_profile = profile,
        triage_result   = triage,
        created_at      = session.created_at,
    )


@router.post("/analyze", response_model=TriageResponse)
async def analyze_symptoms(
    request_body: TriageRequest, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _run_triage(request_body, current_user.id, request.app.state.rag_service, db)


@router.post("/guest-analyze", response_model=TriageResponse)
async def guest_analyze(
    request_body: TriageRequest, request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await _run_triage(request_body, None, request.app.state.rag_service, db)


@router.post("/followup", response_model=FollowUpResponse)
async def followup_question(
    body: FollowUpRequest, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TriageSession).where(
            TriageSession.id == body.session_id,
            TriageSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    rag_sources = await request.app.state.rag_service.retrieve(body.question, top_k=3)
    answer = await llm_service.answer_followup(
        body.question,
        {"chief_complaint": session.chief_complaint, "triage_level": session.triage_level, "triage_response": session.triage_response},
        rag_sources, body.language,
    )
    qa_list = list(session.follow_up_qa or [])
    qa_list.append({"q": body.question, "a": answer})
    session.follow_up_qa = qa_list
    await db.flush()

    return FollowUpResponse(question=body.question, answer=answer, sources=rag_sources)
