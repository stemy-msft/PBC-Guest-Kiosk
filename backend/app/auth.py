from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pathlib import Path
import os

from dotenv import load_dotenv
from jose import jwt

from pwdlib import PasswordHash

from sqlalchemy import func
from sqlalchemy.orm import Session

from .dependencies import get_db
from .models import User

password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)

env_path = Path(__file__).resolve().parents[2] / ".env"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

load_dotenv(env_path)

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

def _decode_username(token: str) -> str:
    """Validate the JWT and return the ``sub`` (username) claim, or raise 401."""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    username = payload.get("sub")

    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")

    return username


def _load_enabled_user(username: str, db: Session) -> User:
    """Load an enabled user by username, or raise 401.

    A token can outlive the account it was issued for (the user was deleted or
    disabled after login). Treat both cases as an invalid session (401) so the
    client runs its existing session-expiry / logout flow.
    """
    user = (
        db.query(User)
        .filter(func.lower(User.username) == username.lower())
        .first()
    )

    if user is None or not user.enabled:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> str:
    """Database-backed current-user validation for protected routes.

    Returns the canonical stored username (a string, preserving all existing
    call sites) only after confirming the user still exists and is enabled.
    """
    username = _decode_username(token)
    return _load_enabled_user(username, db).username


def require_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Authorization dependency: require an enabled Administrator.

    Role is read from the user's current database record, never from the
    client. Enabled non-administrators receive 403; missing/disabled users and
    invalid tokens receive 401 (via the helpers above).
    """
    user = _load_enabled_user(_decode_username(token), db)

    if user.role != "Administrator":
        raise HTTPException(
            status_code=403,
            detail="Administrator privileges required",
        )

    return user