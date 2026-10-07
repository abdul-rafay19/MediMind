"""
MediMind Triage Session Model
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone


def _utcnow() -> datetime:
    """UTC 'now' WITHOUT tzinfo.
    The columns are plain DateTime (no time zone). SQLite accepts aware datetimes but
    PostgreSQL (asyncpg) rejects them with "can't subtract offset-naive and offset-aware
    datetimes", which broke every sign-up/sign-in on Postgres."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
from app.core.database import Base


class TriageSession(Base):
    __tablename__ = "triage_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable = guest
    session_token = Column(String, unique=True, index=True)  # for guest sessions
    
    # Symptom data
    chief_complaint = Column(Text, nullable=False)
    symptoms_raw = Column(Text)             # original user input
    symptoms_extracted = Column(JSON)       # structured symptom object
    
    # Triage result
    triage_level = Column(String)           # EMERGENCY / URGENT / SELF_CARE
    triage_color = Column(String)           # red / yellow / green
    triage_reasoning = Column(Text)
    triage_response = Column(Text)          # patient-facing response
    
    # Medical context
    rag_sources = Column(JSON)              # RAG chunks used
    follow_up_qa = Column(JSON)             # list of {q, a} follow-ups
    
    # Meta
    language = Column(String, default="en")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow,
                        onupdate=_utcnow)

    user = relationship("User", back_populates="sessions")
