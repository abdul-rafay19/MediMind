"""
MediMind — Medication & Health Profile Models
CRUD tables: medications, health_profile, medical_notes
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base


class Medication(Base):
    """
    Tracks a user's medications.
    Full CRUD: Create / Read / Update / Delete per user.
    """
    __tablename__ = "medications"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name        = Column(String(200), nullable=False)          # e.g. Paracetamol
    dosage      = Column(String(100), nullable=False)          # e.g. 500mg
    frequency   = Column(String(100), nullable=False)          # e.g. Twice daily
    purpose     = Column(String(300), nullable=True)           # e.g. Fever / pain relief
    prescribed_by = Column(String(200), nullable=True)         # e.g. Dr. Ahmed
    start_date  = Column(String(50),  nullable=True)           # e.g. 2024-01-15
    end_date    = Column(String(50),  nullable=True)           # null = ongoing
    is_active   = Column(Boolean, default=True)                # active vs archived
    notes       = Column(Text, nullable=True)

    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column(DateTime,
                         default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="medications")


class HealthProfile(Base):
    """
    One-to-one health profile per user.
    Create on first save, Update thereafter.
    """
    __tablename__ = "health_profiles"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, unique=True)

    # Basics
    date_of_birth  = Column(String(20),  nullable=True)
    blood_group    = Column(String(10),  nullable=True)   # A+, O-, etc.
    height_cm      = Column(Float,       nullable=True)
    weight_kg      = Column(Float,       nullable=True)
    gender         = Column(String(20),  nullable=True)

    # Medical history
    allergies          = Column(Text, nullable=True)   # comma-separated
    chronic_conditions = Column(Text, nullable=True)   # comma-separated
    past_surgeries     = Column(Text, nullable=True)
    family_history     = Column(Text, nullable=True)

    # Emergency
    emergency_contact_name  = Column(String(200), nullable=True)
    emergency_contact_phone = Column(String(50),  nullable=True)

    # Lifestyle
    smoker      = Column(Boolean, nullable=True)
    alcohol_use = Column(Boolean, nullable=True)

    updated_at = Column(DateTime,
                        default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="health_profile")


class MedicalNote(Base):
    """
    Personal medical notes — like a health journal.
    Full CRUD per user.
    """
    __tablename__ = "medical_notes"

    id       = Column(Integer, primary_key=True, index=True)
    user_id  = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    title      = Column(String(300), nullable=False)
    content    = Column(Text,        nullable=False)
    category   = Column(String(100), nullable=True)   # e.g. Lab Result, Doctor Visit
    note_date  = Column(String(50),  nullable=True)   # user-entered date

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime,
                        default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="medical_notes")
