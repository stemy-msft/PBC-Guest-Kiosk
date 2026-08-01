"""Pytest fixtures for the PBC Guest Kiosk backend regression-test foundation.

Isolation guarantees (Batch 2):

1. Deterministic JWT settings are injected into the process environment BEFORE
   the application package is imported. ``backend/app/auth.py`` calls
   ``load_dotenv(..., override=False)`` at import, so it will NOT overwrite the
   values set here. The suite therefore never depends on (or reads) the real
   ``.env`` ``JWT_SECRET_KEY``.

2. ``app.database.engine`` / ``app.database.SessionLocal`` are repointed to an
   in-memory SQLite database BEFORE ``app.main`` is imported. Because
   ``app/main.py`` runs ``Base.metadata.create_all(...)`` and
   ``create_default_admin(...)`` at *import time*, this guarantees the
   operational ``visitor_kiosk.db`` file is never opened, created, or modified
   by the test suite.

No production source file is modified to enable this isolation; the repointing
is done here in the test harness only.
"""

import os

# --- 1. Deterministic, test-only secrets/settings BEFORE importing the app. ---
# Forced (not setdefault) so a stray shell/.env value can never leak into tests.
os.environ["JWT_SECRET_KEY"] = "test-only-secret-not-for-production"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["JWT_EXPIRE_MINUTES"] = "480"

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

# --- 2. Repoint the database to an isolated in-memory engine BEFORE the app ---
#        package is imported. Importing app.database creates the real (lazy)
#        engine object but does NOT connect to any file; we replace it before
#        any use so create_all/create_default_admin run against memory.
from app import database as _database  # noqa: E402

_test_engine = create_engine(
    "sqlite://",  # in-memory; never touches disk or the operational DB file
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=_test_engine,
)

_database.engine = _test_engine
_database.SessionLocal = _TestingSessionLocal

# --- 3. Now import the application. Its import-time create_all /            ---
#        create_default_admin run against the in-memory test engine above.
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import auth  # noqa: E402
from app import main  # noqa: E402
from app.dependencies import get_db  # noqa: E402
from app.models import User  # noqa: E402


TEST_PASSWORD = "Correct-Horse-Battery-9"


@pytest.fixture
def db_session():
    """A fresh schema + session per test for full inter-test isolation."""
    _database.Base.metadata.drop_all(bind=_test_engine)
    _database.Base.metadata.create_all(bind=_test_engine)
    session = _TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def seed_users(db_session):
    """Deterministic enabled admin, enabled staff, and disabled staff users.

    All share a single known password so tests can exercise both authentication
    (login) and authorization (role/enabled) without hard-coding hashes.
    """
    enabled_admin = User(
        username="testadmin",
        password_hash=auth.hash_password(TEST_PASSWORD),
        display_name="Test Admin",
        email=None,
        role="Administrator",
        enabled=True,
    )
    enabled_staff = User(
        username="teststaff",
        password_hash=auth.hash_password(TEST_PASSWORD),
        display_name="Test Staff",
        email=None,
        role="Staff",
        enabled=True,
    )
    disabled_staff = User(
        username="disableduser",
        password_hash=auth.hash_password(TEST_PASSWORD),
        display_name="Disabled Staff",
        email=None,
        role="Staff",
        enabled=False,
    )
    db_session.add_all([enabled_admin, enabled_staff, disabled_staff])
    db_session.commit()
    return {
        "enabled_username": "testadmin",
        "staff_username": "teststaff",
        "disabled_username": "disableduser",
        "password": TEST_PASSWORD,
    }


@pytest.fixture
def client(db_session):
    """A TestClient whose ``get_db`` yields the isolated test session."""

    def _override_get_db():
        try:
            yield db_session
        finally:
            # Session lifecycle is owned by the db_session fixture.
            pass

    main.app.dependency_overrides[get_db] = _override_get_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()
