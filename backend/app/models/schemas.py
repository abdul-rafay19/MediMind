"""
MediMind Pydantic Schemas — all plain strings, no Enums to avoid 422 errors
Includes CRUD schemas for Medications, Health Profile, Medical Notes
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ══════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════

class UserRegister(BaseModel):
    email:              EmailStr
    full_name:          str = Field(min_length=2, max_length=100)
    password:           str = Field(min_length=6)
    preferred_language: str = "en"
    id_token:           Optional[str] = None

class UserLogin(BaseModel):
    email:    EmailStr
    password: str
    id_token: Optional[str] = None

class UserProfile(BaseModel):
    id:                 int
    email:              str
    full_name:          str
    preferred_language: str
    created_at:         datetime
    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    full_name:          Optional[str] = Field(None, min_length=2, max_length=100)
    preferred_language: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str = Field(min_length=6)

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserProfile


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class GoogleSignInRequest(BaseModel):
    id_token: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    preferred_language: str = "en"


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    verification_code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=6)


# ══════════════════════════════════════════
#  TRIAGE
# ══════════════════════════════════════════

class TriageRequest(BaseModel):
    symptoms:            str
    language:            str = "en"
    age:                 Optional[int] = None
    gender:              Optional[str] = None
    existing_conditions: Optional[str] = None

class ExtractedSymptom(BaseModel):
    name:     str           = "symptom"
    severity: str           = "moderate"
    duration: Optional[str] = "unknown"
    location: Optional[str] = None

    def model_post_init(self, __context):
        if not self.duration: self.duration = "unknown"
        if not self.severity: self.severity = "moderate"
        if not self.name:     self.name     = "symptom"

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
    level:         str
    color:         str
    confidence:    float = 0.85
    headline:      str   = ""
    reasoning:     str   = ""
    response:      str   = ""
    actions:       List[str] = []
    warning_signs: List[str] = []
    sources:       List[Dict[str, Any]] = []

class TriageResponse(BaseModel):
    session_id:      str   # Firestore document ID
    session_token:   str
    symptom_profile: SymptomProfile
    triage_result:   TriageResult
    created_at:      datetime

class FollowUpRequest(BaseModel):
    session_id: str
    question:   str
    language:   str = "en"

class FollowUpResponse(BaseModel):
    question: str
    answer:   str
    sources:  List[Dict[str, Any]] = []


# ══════════════════════════════════════════
#  HISTORY
# ══════════════════════════════════════════

class SessionSummary(BaseModel):
    id:              int
    chief_complaint: str
    triage_level:    str
    triage_color:    str
    created_at:      datetime
    class Config:
        from_attributes = True

class SessionDetail(BaseModel):
    id:                 int
    chief_complaint:    str
    symptoms_raw:       str
    symptoms_extracted: Optional[Dict] = None
    triage_level:       str
    triage_color:       str
    triage_reasoning:   Optional[str] = None
    triage_response:    Optional[str] = None
    follow_up_qa:       Optional[List] = None
    language:           str
    created_at:         datetime
    class Config:
        from_attributes = True


# ══════════════════════════════════════════
#  REPORTS
# ══════════════════════════════════════════

class ReportRequest(BaseModel):
    session_id:   str
    patient_name: Optional[str] = "Patient"


# ══════════════════════════════════════════
#  MEDICATIONS — CRUD
# ══════════════════════════════════════════

class MedicationCreate(BaseModel):
    name:          str = Field(min_length=1, max_length=200)
    dosage:        str = Field(min_length=1, max_length=100)
    frequency:     str = Field(min_length=1, max_length=100)
    purpose:       Optional[str] = None
    prescribed_by: Optional[str] = None
    start_date:    Optional[str] = None
    end_date:      Optional[str] = None
    is_active:     bool = True
    notes:         Optional[str] = None

class MedicationUpdate(BaseModel):
    name:          Optional[str] = Field(None, max_length=200)
    dosage:        Optional[str] = Field(None, max_length=100)
    frequency:     Optional[str] = Field(None, max_length=100)
    purpose:       Optional[str] = None
    prescribed_by: Optional[str] = None
    start_date:    Optional[str] = None
    end_date:      Optional[str] = None
    is_active:     Optional[bool] = None
    notes:         Optional[str] = None

class MedicationOut(BaseModel):
    id:            int
    name:          str
    dosage:        str
    frequency:     str
    purpose:       Optional[str]
    prescribed_by: Optional[str]
    start_date:    Optional[str]
    end_date:      Optional[str]
    is_active:     bool
    notes:         Optional[str]
    created_at:    datetime
    updated_at:    datetime
    class Config:
        from_attributes = True


# ══════════════════════════════════════════
#  HEALTH PROFILE — CRUD (one per user)
# ══════════════════════════════════════════

class HealthProfileUpsert(BaseModel):
    date_of_birth:            Optional[str]   = None
    blood_group:              Optional[str]   = None
    height_cm:                Optional[float] = None
    weight_kg:                Optional[float] = None
    gender:                   Optional[str]   = None
    allergies:                Optional[str]   = None
    chronic_conditions:       Optional[str]   = None
    past_surgeries:           Optional[str]   = None
    family_history:           Optional[str]   = None
    emergency_contact_name:   Optional[str]   = None
    emergency_contact_phone:  Optional[str]   = None
    smoker:                   Optional[bool]  = None
    alcohol_use:              Optional[bool]  = None

class HealthProfileOut(BaseModel):
    id:                       int
    date_of_birth:            Optional[str]
    blood_group:              Optional[str]
    height_cm:                Optional[float]
    weight_kg:                Optional[float]
    gender:                   Optional[str]
    allergies:                Optional[str]
    chronic_conditions:       Optional[str]
    past_surgeries:           Optional[str]
    family_history:           Optional[str]
    emergency_contact_name:   Optional[str]
    emergency_contact_phone:  Optional[str]
    smoker:                   Optional[bool]
    alcohol_use:              Optional[bool]
    updated_at:               Optional[datetime]
    class Config:
        from_attributes = True


# ══════════════════════════════════════════
#  MEDICAL NOTES — CRUD
# ══════════════════════════════════════════

class MedicalNoteCreate(BaseModel):
    title:     str = Field(min_length=1, max_length=300)
    content:   str = Field(min_length=1)
    category:  Optional[str] = None
    note_date: Optional[str] = None

class MedicalNoteUpdate(BaseModel):
    title:     Optional[str] = Field(None, max_length=300)
    content:   Optional[str] = None
    category:  Optional[str] = None
    note_date: Optional[str] = None

class MedicalNoteOut(BaseModel):
    id:         int
    title:      str
    content:    str
    category:   Optional[str]
    note_date:  Optional[str]
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
