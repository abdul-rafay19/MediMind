"""
MediMind Auth API
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.models.user import User
from app.models.schemas import UserRegister, UserLogin, TokenResponse, UserProfile

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check duplicate
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        preferred_language=data.preferred_language,
    )
    db.add(user)
    await db.flush()

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserProfile.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserProfile.model_validate(user),
    )


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserProfile.model_validate(current_user)
