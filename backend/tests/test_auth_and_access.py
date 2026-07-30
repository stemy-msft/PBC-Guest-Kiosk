"""Batch 2 backend regression tests: authentication + endpoint access boundaries.

These tests protect the CURRENT behavior of the backend before Batch 3
introduces server-side authorization (roles / disabled-user token rejection).
They intentionally assert only what the code does today; forward-looking
authorization checks are added as explicit xfail placeholders below so the
suite is never "misleadingly green".
"""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app import auth, database


def _valid_token(username: str = "testadmin") -> str:
    return auth.create_access_token(username)


def _expired_token(username: str = "testadmin") -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
    }
    return jwt.encode(payload, auth.JWT_SECRET_KEY, algorithm=auth.JWT_ALGORITHM)


def test_operational_database_is_not_used():
    """Proves the app under test is bound to in-memory SQLite, never the file."""
    assert str(database.engine.url) == "sqlite://"


# 1
def test_login_succeeds_for_enabled_user_with_correct_password(client, seed_users):
    resp = client.post(
        "/api/auth/login",
        json={
            "username": seed_users["enabled_username"],
            "password": seed_users["password"],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["username"] == "testadmin"
    assert body["role"] == "Administrator"


# 2
def test_login_rejects_incorrect_password(client, seed_users):
    resp = client.post(
        "/api/auth/login",
        json={
            "username": seed_users["enabled_username"],
            "password": "definitely-the-wrong-password",
        },
    )
    assert resp.status_code == 401


# 3
def test_login_rejects_disabled_user(client, seed_users):
    resp = client.post(
        "/api/auth/login",
        json={
            "username": seed_users["disabled_username"],
            "password": seed_users["password"],
        },
    )
    assert resp.status_code == 403


# 4
def test_protected_endpoint_rejects_missing_token(client, seed_users):
    resp = client.get("/api/dashboard")
    assert resp.status_code == 401


# 5
def test_protected_endpoint_rejects_invalid_token(client, seed_users):
    resp = client.get(
        "/api/dashboard",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert resp.status_code == 401


# 6
def test_protected_endpoint_rejects_expired_token(client, seed_users):
    resp = client.get(
        "/api/dashboard",
        headers={"Authorization": f"Bearer {_expired_token()}"},
    )
    assert resp.status_code == 401


# 7
def test_dashboard_requires_auth_and_succeeds_with_valid_token(client, seed_users):
    assert client.get("/api/dashboard").status_code == 401
    resp = client.get(
        "/api/dashboard",
        headers={"Authorization": f"Bearer {_valid_token()}"},
    )
    assert resp.status_code == 200
    assert "active_visitors" in resp.json()


# 8
def test_active_visitors_requires_auth_and_succeeds_with_valid_token(client, seed_users):
    assert client.get("/api/visitors/active").status_code == 401
    resp = client.get(
        "/api/visitors/active",
        headers={"Authorization": f"Bearer {_valid_token()}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# 9
def test_public_kiosk_create_visitor_reachable_without_auth(client):
    """The kiosk check-in endpoint must remain usable without a staff JWT."""
    resp = client.post(
        "/api/visitors",
        json={
            "first_name": "Kiosk",
            "last_name": "Guest",
            "visitor_type": "Guest",
            "purpose": "Visit",
            "host_type": "Staff",
            "host_name": "Someone",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "Kiosk"


# 10
def test_print_agent_endpoints_reachable_under_current_trust_model(client):
    """Guards against ACCIDENTAL breakage of the print-agent workflow.

    NOTE: This asserts the CURRENT "network-trusted" behavior only. It does NOT
    endorse leaving these endpoints unauthenticated; hardening the kiosk/agent
    trust boundary is tracked separately (remediation plan Batch 5 / F-004).
    """
    pending = client.get("/api/print-jobs/pending")
    assert pending.status_code == 200
    assert isinstance(pending.json(), list)

    # A missing badge image returns 404 (endpoint reachable) rather than 401
    # (which would indicate an auth wall was added in front of the agent path).
    badge = client.get("/api/print-jobs/999999/badge-image")
    assert badge.status_code == 404


# --- Forward-looking authorization checks (Batch 3). Intentionally xfail so    ---
#     the suite honestly reports these are NOT yet enforced (no fake green).
@pytest.mark.xfail(
    reason="Batch 3: disabled users' already-issued tokens are still accepted "
    "(get_current_user does no DB/enabled lookup).",
    strict=True,
)
def test_disabled_user_token_is_rejected_on_protected_endpoint(client, seed_users):
    token = _valid_token(seed_users["disabled_username"])
    resp = client.get("/api/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code in (401, 403)


@pytest.mark.xfail(
    reason="Batch 3: no server-side role enforcement yet; any valid token can "
    "reach admin-only endpoints.",
    strict=True,
)
def test_non_admin_cannot_reach_admin_only_users_endpoint(client, seed_users):
    # A plausible non-admin token still succeeds today because roles are not
    # checked server-side. When Batch 3 enforces roles this should become 403.
    token = _valid_token("some-staff-user")
    resp = client.get("/api/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
