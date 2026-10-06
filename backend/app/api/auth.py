"""
MediMind Auth API
Firebase Authentication proves WHO the user is (email/password or Google).
The backend verifies the Firebase ID token and issues its own JWT.
The users table (SQLite/Postgres) maps the verified email -> internal user id.
"""

import random
import secrets
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

_password_reset_codes = {}   # only used when Firebase is NOT configured (local dev)


def _firebase_enabled() -> bool:
    """True when Firebase Admin has been initialised (credentials were provided)."""
    try:
        import firebase_admin
        return bool(firebase_admin._apps)
    except Exception:
        return False


def _verify_firebase_token(id_token: str) -> dict:
    try:
        get_firestore()
        from firebase_admin import auth as firebase_auth
        decoded = firebase_auth.verify_id_token(id_token, clock_skew_seconds=30)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid sign-in token: {exc}")
    email = str(decoded.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Your account did not provide an email address")
    decoded["email"] = email
    return decoded


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()

    if _firebase_enabled() and not data.id_token:
        raise HTTPException(status_code=400, detail="Please create your account through the MediMind sign-up page")

    if data.id_token:
        try:
            get_firestore()
            from firebase_admin import auth as firebase_auth

            decoded = firebase_auth.verify_id_token(data.id_token, clock_skew_seconds=30)
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
    if _firebase_enabled():
        # Passwords live in Firebase. Accepting the (possibly stale) local hash here
        # would let an OLD password keep working after a reset / change.
        raise HTTPException(status_code=403, detail="Please sign in through the MediMind sign-in page")

    email  = str(data.email).strip().lower()
    result = await db.execute(select(User).where(User.email == email))
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


@router.post("/firebase-login", response_model=TokenResponse)
@router.post("/google-signin", response_model=TokenResponse)   # kept for backwards compatibility
async def firebase_login(data: GoogleSignInRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchange a verified Firebase ID token (email/password OR Google) for a MediMind JWT.
    The user row is created on first sign-in, so signing in always works even if the
    local users table was empty/reset.
    """
    if not data.id_token:
        raise HTTPException(status_code=400, detail="Sign-in token is required")

    decoded = _verify_firebase_token(data.id_token)
    email = decoded["email"]

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        full_name = (decoded.get("name") or data.full_name or email.split("@")[0]).strip()[:100] or "MediMind User"
        user = User(
            email=email,
            full_name=full_name,
            # Unguessable placeholder: real passwords are managed by Firebase.
            hashed_password=hash_password(secrets.token_urlsafe(32)),
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
    if _firebase_enabled():
        raise HTTPException(status_code=410, detail="Password reset is done with the e-mail link sent by Firebase")
    email = str(data.email).strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        code = f"{random.randint(100000, 999999)}"
        _password_reset_codes[email] = {"code": code, "user_id": user.id}
        return {"message": "Verification code generated", "verification_code": code}

    return {"message": "If the email exists, a verification code was generated"}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if _firebase_enabled():
        raise HTTPException(status_code=410, detail="Password reset is done with the e-mail link sent by Firebase")
    email = str(data.email).strip().lower()
    reset_data = _password_reset_codes.get(email)
    if not reset_data or reset_data["code"] != data.verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    result = await db.execute(select(User).where(User.id == reset_data["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(data.new_password)
    await db.flush()
    _password_reset_codes.pop(email, None)
    return {"message": "Password updated successfully"}
