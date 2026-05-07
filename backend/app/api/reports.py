"""MediMind Reports API — PDF generation"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.session import TriageSession
from app.models.schemas import ReportRequest
from app.services.report_service import generate_pdf_report
from app.services.llm_service import LLMService

router = APIRouter()
llm_service = LLMService()


@router.post("/generate")
async def generate_report(
    body: ReportRequest,
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

    session_dict = {
        "id": session.id,
        "chief_complaint": session.chief_complaint,
        "symptoms_raw": session.symptoms_raw,
        "symptoms_extracted": session.symptoms_extracted,
        "triage_level": session.triage_level,
        "triage_response": session.triage_response,
        "follow_up_qa": session.follow_up_qa or [],
        "created_at": str(session.created_at),
    }

    # Generate AI narrative
    try:
        narrative = await llm_service.generate_report_narrative(
            session_dict, body.patient_name or current_user.full_name
        )
    except Exception:
        narrative = ""

    pdf_bytes = generate_pdf_report(
        session_dict,
        patient_name=body.patient_name or current_user.full_name,
        narrative=narrative,
    )

    filename = f"MediMind_Report_{session.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
