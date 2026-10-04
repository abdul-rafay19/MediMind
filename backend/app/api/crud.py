"""
MediMind CRUD API — Firebase Firestore
All data stored in Firestore. Auth still via SQLite JWT.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user, hash_password, verify_password
from app.core.firebase import (
    fs_sync_user, fs_delete_user,
    fs_create_medication, fs_get_medications, fs_get_medication,
    fs_update_medication, fs_delete_medication,
    fs_get_health_profile, fs_upsert_health_profile, fs_delete_health_profile,
    fs_create_note, fs_get_notes, fs_get_note, fs_update_note, fs_delete_note,
    fs_delete_all_user_data,
)
from app.models.user import User
from app.models.schemas import (
    MedicationCreate, MedicationUpdate,
    HealthProfileUpsert,
    MedicalNoteCreate, MedicalNoteUpdate,
    UserProfile, UserProfileUpdate, ChangePasswordRequest,
)

router = APIRouter()


# ══════════════════════════════════════════════════════════════
#  USER PROFILE
# ══════════════════════════════════════════════════════════════

@router.put("/profile", response_model=UserProfile)
async def update_profile(
    body: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.preferred_language is not None:
        current_user.preferred_language = body.preferred_language
    await db.flush()
    # Keep Firestore in sync
    await fs_sync_user(current_user.id, current_user.email, current_user.full_name)
    return UserProfile.model_validate(current_user)


@router.put("/profile/password", status_code=204)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(body.new_password)
    await db.flush()


@router.delete("/profile", status_code=204)
async def delete_account(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await fs_delete_all_user_data(current_user.id)
    await fs_delete_user(current_user.id)
    await db.delete(current_user)


# ══════════════════════════════════════════════════════════════
#  MEDICATIONS
# ══════════════════════════════════════════════════════════════

@router.post("/medications", status_code=201)
async def create_medication(
    body: MedicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await fs_create_medication(current_user.id, body.model_dump())


@router.get("/medications")
async def list_medications(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await fs_get_medications(current_user.id, active_only=active_only)


@router.get("/medications/{med_id}")
async def get_medication(
    med_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    med = await fs_get_medication(med_id, current_user.id)
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    return med


@router.put("/medications/{med_id}")
async def update_medication(
    med_id: str,
    body: MedicationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await fs_update_medication(
        med_id, current_user.id,
        {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Medication not found")
    return result


@router.delete("/medications/{med_id}", status_code=204)
async def delete_medication(
    med_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await fs_delete_medication(med_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Medication not found")


# ══════════════════════════════════════════════════════════════
#  HEALTH PROFILE
# ══════════════════════════════════════════════════════════════

@router.get("/health-profile")
async def get_health_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = await fs_get_health_profile(current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Health profile not created yet")
    return profile


@router.put("/health-profile")
async def upsert_health_profile(
    body: HealthProfileUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await fs_upsert_health_profile(
        current_user.id,
        {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    )


@router.delete("/health-profile", status_code=204)
async def delete_health_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await fs_delete_health_profile(current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Health profile not found")


# ══════════════════════════════════════════════════════════════
#  MEDICAL NOTES
# ══════════════════════════════════════════════════════════════

@router.post("/notes", status_code=201)
async def create_note(
    body: MedicalNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await fs_create_note(current_user.id, body.model_dump())


@router.get("/notes")
async def list_notes(
    category: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await fs_get_notes(current_user.id, category=category)


@router.get("/notes/{note_id}")
async def get_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await fs_get_note(note_id, current_user.id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.put("/notes/{note_id}")
async def update_note(
    note_id: str,
    body: MedicalNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await fs_update_note(
        note_id, current_user.id,
        {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Note not found")
    return result


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await fs_delete_note(note_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Note not found")
