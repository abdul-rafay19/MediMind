"""MediMind Reports API — Firestore backed"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.firebase import fs_get_session
from app.models.user import User
from app.models.schemas import ReportRequest
from app.services.report_service import generate_pdf_report
from app.services.llm_service import LLMService

router      = APIRouter()
llm_service = LLMService()


@router.post("/generate")
async def generate_report(
    body: ReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await fs_get_session(str(body.session_id), current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        narrative = await llm_service.generate_report_narrative(
            session, body.patient_name or current_user.full_name
        )
    except Exception:
        narrative = ""

    pdf_bytes = generate_pdf_report(
        session,
        patient_name=body.patient_name or current_user.full_name,
        narrative=narrative,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="MediMind_Report_{body.session_id}.pdf"'},
    )
