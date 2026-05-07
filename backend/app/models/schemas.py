"""
MediMind Pydantic Schemas
No Enum types — all plain strings to avoid 422 validation errors.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    email:              EmailStr
    full_name:          str = Field(min_length=2, max_length=100)
    password:           str = Field(min_length=6)
    preferred_language: str = "en"   # plain string, never an Enum

class UserLogin(BaseModel):
    email:    EmailStr
    password: str

class UserProfile(BaseModel):
    id:                 int
    email:              str
    full_name:          str
    preferred_language: str
    created_at:         datetime
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserProfile


# ── Triage ──────────────────────────────────────────────────────
class TriageLevel:
    EMERGENCY = "EMERGENCY"
    URGENT    = "URGENT"
    SELF_CARE = "SELF_CARE"
    # valid values list — used for validation
    VALUES = ("EMERGENCY", "URGENT", "SELF_CARE")

class TriageRequest(BaseModel):
    symptoms:            str
    language:            str = "en"
    age:                 Optional[int] = None
    gender:              Optional[str] = None
    existing_conditions: Optional[str] = None

class ExtractedSymptom(BaseModel):
    name:     str          = "symptom"
    severity: str          = "moderate"
    duration: Optional[str] = "unknown"
    location: Optional[str] = None

    def model_post_init(self, __context):
        if not self.duration:  self.duration = "unknown"
        if not self.severity:  self.severity = "moderate"
        if not self.name:      self.name     = "symptom"

class SymptomProfile(BaseModel):
    chief_complaint:     str
    symptoms:            List[ExtractedSymptom] = []
    duration_overall:    str = "unknown"
    severity_overall:    str = "moderate"
    red_flags:           List[str] = []
    patient_age:         Optional[int] = None
    patient_gender:      Optional[str] = None
    existing_conditions: List[str] = []

class TriageResult(BaseModel):
    level:         str              # plain string: EMERGENCY / URGENT / SELF_CARE
    color:         str              # red / amber / green
    confidence:    float = 0.85
    headline:      str   = ""
    reasoning:     str   = ""
    response:      str   = ""
    actions:       List[str] = []
    warning_signs: List[str] = []
    sources:       List[Dict[str, Any]] = []

class TriageResponse(BaseModel):
    session_id:      int
    session_token:   str
    symptom_profile: SymptomProfile
    triage_result:   TriageResult
    created_at:      datetime

class FollowUpRequest(BaseModel):
    session_id: int
    question:   str
    language:   str = "en"

class FollowUpResponse(BaseModel):
    question: str
    answer:   str
    sources:  List[Dict[str, Any]] = []


# ── History ─────────────────────────────────────────────────────
class SessionSummary(BaseModel):
    id:           int
    chief_complaint: str
    triage_level: str
    triage_color: str
    created_at:   datetime
    class Config:
        from_attributes = True

class SessionDetail(BaseModel):
    id:                  int
    chief_complaint:     str
    symptoms_raw:        str
    symptoms_extracted:  Optional[Dict] = None
    triage_level:        str
    triage_color:        str
    triage_reasoning:    Optional[str] = None
    triage_response:     Optional[str] = None
    follow_up_qa:        Optional[List] = None
    language:            str
    created_at:          datetime
    class Config:
        from_attributes = True


# ── Reports ─────────────────────────────────────────────────────
class ReportRequest(BaseModel):
    session_id:   int
    patient_name: Optional[str] = "Patient"
