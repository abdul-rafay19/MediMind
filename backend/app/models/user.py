"""MediMind User Model"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone


def _utcnow() -> datetime:
    """UTC 'now' WITHOUT tzinfo.
    The columns are plain DateTime (no time zone). SQLite accepts aware datetimes but
    PostgreSQL (asyncpg) rejects them with "can't subtract offset-naive and offset-aware
    datetimes", which broke every sign-up/sign-in on Postgres."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
import secrets
from app.core.database import Base


def _new_user_id() -> int:
    """
    Random (non-sequential) user id.
    All per-user data in Firestore is stored under users/{id}/..., so an id must NEVER
    be reused. With sequential ids (1, 2, 3...) a fresh/reset database hands out id 1
    again and the new user would see the old user 1's history. Random ids make that
    impossible (they also never collide with the small ids used by earlier databases).
    """
    return 10_000_000 + secrets.randbelow(2_000_000_000 - 10_000_000)  # fits in int4


class User(Base):
    __tablename__ = "users"

    id                 = Column(Integer, primary_key=True, index=True, default=_new_user_id)
    email              = Column(String, unique=True, index=True, nullable=False)
    full_name          = Column(String, nullable=False)
    hashed_password    = Column(String, nullable=False)
    preferred_language = Column(String, default="en")
    is_active          = Column(Boolean, default=True)
    created_at         = Column(DateTime, default=_utcnow)

    # Relationships
    sessions       = relationship("TriageSession", back_populates="user", cascade="all, delete-orphan")
    medications    = relationship("Medication",    back_populates="user", cascade="all, delete-orphan")
    health_profile = relationship("HealthProfile", back_populates="user", cascade="all, delete-orphan",
                                  uselist=False)
    medical_notes  = relationship("MedicalNote",  back_populates="user", cascade="all, delete-orphan")
