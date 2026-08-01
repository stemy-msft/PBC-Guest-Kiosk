from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pathlib import Path
import os
import secrets

from dotenv import load_dotenv
from jose import jwt

from pwdlib import PasswordHash

from sqlalchemy import func
from sqlalchemy.orm import Session

from .dependencies import get_db
from .models import PrintAgent, PrintAgentCredential, User

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

if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Copy .env.example to .env in the repo root "
        "and set JWT_SECRET_KEY to a long, random secret before starting the backend."
    )


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


# ---------------------------------------------------------------------------
# Print-agent credentials (Batch 5C foundation)
#
# Print agents authenticate with their own per-agent bearer token, never a
# staff JWT. A token has the form ``selector.verifier``: the selector is a
# public lookup handle stored in plaintext, and only a one-way hash of the
# verifier is persisted. During the Batch 5C migration grace period these
# helpers are AVAILABLE but no print-agent endpoint is required to call them —
# token enforcement is deferred to Batch 5D.
# ---------------------------------------------------------------------------


def generate_agent_token() -> tuple[str, str, str]:
    """Return ``(selector, verifier, token)`` for a freshly minted credential.

    Only ``verifier`` is secret (store its hash); ``selector`` is a public
    lookup handle. ``token`` is the plaintext returned to the agent once.
    """
    selector = secrets.token_urlsafe(9)
    verifier = secrets.token_urlsafe(32)
    return selector, verifier, f"{selector}.{verifier}"


def hash_agent_verifier(verifier: str) -> str:
    return password_hash.hash(verifier)


def _verify_agent_verifier(verifier: str, hashed: str) -> bool:
    try:
        return password_hash.verify(verifier, hashed)
    except Exception:
        return False


def resolve_print_agent_credential(token: str, db: Session):
    """Resolve a bearer token to its ``(PrintAgent, PrintAgentCredential)``.

    Returns ``None`` (not authenticated) when the token is absent/malformed, no
    matching unrevoked credential exists, the verifier does not match, or the
    owning agent is missing or disabled. This function has no side effects.
    """
    if not token or "." not in token:
        return None

    selector, verifier = token.split(".", 1)

    if not selector or not verifier:
        return None

    credential = (
        db.query(PrintAgentCredential)
        .filter(
            PrintAgentCredential.token_selector == selector,
            PrintAgentCredential.revoked.is_(False),
        )
        .first()
    )

    if credential is None:
        return None

    if not _verify_agent_verifier(verifier, credential.token_hash):
        return None

    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == credential.print_agent_id)
        .first()
    )

    if agent is None or not agent.enabled:
        return None

    return agent, credential


def require_print_agent(
    request: Request,
    db: Session = Depends(get_db),
):
    """Strict print-agent auth dependency (Batch 5D final hardening).

    A single deterministic model with no grace fallback:

    * No ``Authorization: Bearer`` header -> ``401`` (a token is required).
    * A well-formed token whose credential is missing/revoked/verifier-mismatch,
      or whose owning agent no longer exists -> ``401`` (invalid token).
    * A valid token whose owning agent is DISABLED -> ``403``.
    * A valid, unrevoked token for an ENABLED agent -> returns the ``PrintAgent``
      and stamps ``last_used_at``.
    """
    header = request.headers.get("Authorization", "")

    if not header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401, detail="Print-agent token required"
        )

    token = header[len("bearer ") :].strip()

    if not token or "." not in token:
        raise HTTPException(status_code=401, detail="Invalid print-agent token")

    selector, verifier = token.split(".", 1)

    if not selector or not verifier:
        raise HTTPException(status_code=401, detail="Invalid print-agent token")

    credential = (
        db.query(PrintAgentCredential)
        .filter(
            PrintAgentCredential.token_selector == selector,
            PrintAgentCredential.revoked.is_(False),
        )
        .first()
    )

    if credential is None or not _verify_agent_verifier(
        verifier, credential.token_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid print-agent token")

    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == credential.print_agent_id)
        .first()
    )

    if agent is None:
        raise HTTPException(status_code=401, detail="Invalid print-agent token")

    if not agent.enabled:
        raise HTTPException(
            status_code=403, detail="Print agent is disabled"
        )

    credential.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return agent