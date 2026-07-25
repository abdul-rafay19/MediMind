"""
MediMind Auth API
SQLite = source of truth for JWT auth
Firestore = mirror for visibility in Firebase Console
"""

import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.core.firebase import fs_sync_user, get_firestore
from app.models.user import User
from app.models.schemas import (
    UserRegister, UserLogin, TokenResponse, UserProfile,
    ForgotPasswordRequest, GoogleSignInRequest, ResetPasswordRequest,
)

router = APIRouter()

_password_reset_codes = {}


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()

    if data.id_token:
        try:
            get_firestore()
            from firebase_admin import auth as firebase_auth

            decoded = firebase_auth.verify_id_token(data.id_token)
            token_email = str(decoded.get("email") or "").strip().lower()
            if not token_email:
                raise ValueError("Firebase token did not contain an email address")
            if token_email != email:
                raise ValueError("Firebase token email does not match registration email")
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}")

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email              = email,
        full_name          = data.full_name,
        hashed_password    = hash_password(data.password),
        preferred_language = data.preferred_language,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    # Mirror to Firestore — user is now visible in Firebase Console
    await fs_sync_user(user.id, user.email, user.full_name)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token = token,
        user         = UserProfile.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user   = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token = token,
        user         = UserProfile.model_validate(user),
    )


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserProfile.model_validate(current_user)


@router.post("/google-signin", response_model=TokenResponse)
async def google_signin(data: GoogleSignInRequest, db: AsyncSession = Depends(get_db)):
    email = None
    full_name = data.full_name or "Google User"

    if not data.id_token:
        raise HTTPException(status_code=400, detail="Google sign-in token is required")
    try:
        get_firestore()
        from firebase_admin import auth as firebase_auth

        decoded = firebase_auth.verify_id_token(data.id_token)
        email = str(decoded.get("email") or "").strip().lower()
        full_name = decoded.get("name") or full_name
        if not email:
            raise ValueError("Google account did not return an email address")
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google sign-in token: {exc}")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        token = create_access_token({"sub": str(user.id)})
        return TokenResponse(access_token=token, user=UserProfile.model_validate(user))

    temp_password = f"google-{random.randint(100000, 999999)}"
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(temp_password),
        preferred_language=data.preferred_language,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    await fs_sync_user(user.id, user.email, user.full_name)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserProfile.model_validate(user))


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user:
        code = f"{random.randint(100000, 999999)}"
        _password_reset_codes[data.email] = {"code": code, "user_id": user.id}
        return {"message": "Verification code generated", "verification_code": code}

    return {"message": "If the email exists, a verification code was generated"}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    reset_data = _password_reset_codes.get(str(data.email))
    if not reset_data or reset_data["code"] != data.verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    result = await db.execute(select(User).where(User.id == reset_data["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(data.new_password)
    await db.flush()
    _password_reset_codes.pop(str(data.email), None)
    return {"message": "Password updated successfully"}
