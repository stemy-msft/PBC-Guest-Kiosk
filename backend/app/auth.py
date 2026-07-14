from datetime import datetime, timedelta, timezone
from pathlib import Path
import os

from dotenv import load_dotenv
from jose import jwt

env_path = Path(__file__).resolve().parents[2] / ".env"
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