from uuid import UUID
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from app.database.models import User
from app.database.session import AsyncSessionLocal
from app.security import hash_password
from sqlalchemy import select
from app.security import verify_password, create_access_token
from fastapi import Depends
from app.security import get_current_user, require_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)

class UserResponse(BaseModel):
    id: UUID
    username: str
    role: str

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)

async def register(data: RegisterRequest):
    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        role="user"
    )

    async with AsyncSessionLocal() as session:
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=409,
                detail="Username already exists",
            )
        await session.refresh(user)

    return user

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(data: LoginRequest):
    async with AsyncSessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == data.username))

    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password")

    token = create_access_token(str(user.id))

    return {
        "access_token": token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user

@router.get("/admin-check")
async def admin_check(user: User = Depends(require_admin)):
    return {"message": "Admin access granted"}