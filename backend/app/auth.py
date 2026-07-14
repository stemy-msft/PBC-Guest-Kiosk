from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pathlib import Path
import os

from dotenv import load_dotenv
from jose import jwt

env_path = Path(__file__).resolve().parents[2] / ".env"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

load_dotenv(env_path)

STAFF_USERNAME = os.getenv("STAFF_USERNAME")
STAFF_PASSWORD = os.getenv("STAFF_PASSWORD")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))


def create_access_token(username: str):
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=JWT_EXPIRE_MINUTES
    )

    payload = {
        "sub": username,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )





def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        username = payload.get("sub")

        if username != STAFF_USERNAME:
            raise HTTPException(
                status_code=401,
                detail="Invalid token",
            )

        return username

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )