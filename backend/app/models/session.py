"""
MediMind Triage Session Model
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="sessions")
