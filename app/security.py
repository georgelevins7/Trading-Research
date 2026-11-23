from pwdlib import PasswordHash
import os
import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from uuid import UUID
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database.models import User
from app.database.session import AsyncSessionLocal

load_dotenv()

password_hasher = PasswordHash.recommended()

def hash_password(password: str):
    return password_hasher.hash(password)


def verify_password(password: str, hashed_password: str):
    return password_hasher.verify(password, hashed_password)


def create_access_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=1)

    return jwt.encode(
        {"sub": user_id, "exp": expires},
        os.environ["JWT_SECRET_KEY"],
        algorithm="HS256"
    )

bearer_scheme = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jwt.decode(
            credentials.credentials,
            os.environ["JWT_SECRET_KEY"],
            algorithms=["HS256"])
        user_id = UUID(payload["sub"])

    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)

    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(
    user: User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user