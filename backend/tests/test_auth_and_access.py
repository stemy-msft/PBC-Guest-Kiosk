"""Backend regression tests: authentication + endpoint access boundaries.

Batch 2 established the isolated harness and asserted the then-current behavior.
Batch 3 adds server-side authentication (F-003: database-backed current-user
validation) and authorization (F-002: Administrator-only routes). The two
former xfail placeholders are now enforced and asserted as real behavior.
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
def test_print_agent_endpoints_require_a_token(client):
    """Print-agent endpoints are strictly authenticated (grace mode removed).

    Batch 5D closed the network-trust window: every print-agent endpoint now
    requires a valid agent token, so unauthenticated requests are rejected with
    401 before any resource lookup happens.
    """
    pending = client.get("/api/print-jobs/pending")
    assert pending.status_code == 401

    # Even a missing badge image is gated by auth now: 401 (not 404), proving
    # the auth wall sits in front of the agent path.
    badge = client.get("/api/print-jobs/999999/badge-image")
    assert badge.status_code == 401


# --- Batch 3: server-side authentication (F-003) + authorization (F-002). ---
#     The two checks below were xfail placeholders in Batch 2; they are now
#     enforced and asserted as real passing behavior.


# 11: disabled AFTER a token was issued -> that token is rejected (F-003).
def test_disabled_user_token_is_rejected_on_protected_endpoint(client, seed_users):
    token = _valid_token(seed_users["disabled_username"])
    resp = client.get("/api/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# 12: an enabled non-admin (Staff) is authenticated but NOT authorized (F-002).
def test_non_admin_cannot_reach_admin_only_users_endpoint(client, seed_users):
    token = _valid_token(seed_users["staff_username"])
    resp = client.get("/api/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# 13: a token for a user that no longer exists is rejected (F-003).
def test_deleted_or_unknown_user_token_is_rejected(client, seed_users):
    token = _valid_token("ghost-user-never-persisted")
    resp = client.get("/api/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# 14: an enabled Staff user CAN use ordinary protected staff routes (F-003).
def test_enabled_staff_can_use_protected_staff_routes(client, seed_users):
    token = _valid_token(seed_users["staff_username"])
    assert (
        client.get(
            "/api/dashboard", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 200
    )
    assert (
        client.get(
            "/api/me", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 200
    )


# 15: an Administrator CAN reach admin-only routes (F-002 positive path).
def test_admin_can_reach_admin_only_routes(client, seed_users):
    token = _valid_token(seed_users["enabled_username"])
    resp = client.get("/api/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# 16: role is read from the CURRENT DB record, not the token (F-002/F-003).
def test_current_database_role_is_authoritative(client, seed_users, db_session):
    from app.models import User

    token = _valid_token(seed_users["enabled_username"])
    # Admin token works today.
    assert (
        client.get(
            "/api/users", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 200
    )
    # Demote the same user to Staff in the database; the SAME token must now be
    # denied because authorization is re-evaluated per request from the DB.
    admin = (
        db_session.query(User)
        .filter(User.username == seed_users["enabled_username"])
        .first()
    )
    admin.role = "Staff"
    db_session.commit()
    assert (
        client.get(
            "/api/users", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 403
    )


# 17: a 403 on an admin route does NOT log the staff user out; they remain
#     authenticated for staff routes (supports the frontend 403-vs-401 split).
def test_non_admin_stays_authenticated_after_forbidden_response(client, seed_users):
    token = _valid_token(seed_users["staff_username"])
    forbidden = client.get(
        "/api/users", headers={"Authorization": f"Bearer {token}"}
    )
    assert forbidden.status_code == 403
    still_ok = client.get(
        "/api/dashboard", headers={"Authorization": f"Bearer {token}"}
    )
    assert still_ok.status_code == 200


# 18: ordinary staff are forbidden from every user-management + settings route.
@pytest.mark.parametrize(
    "method, path, body",
    [
        ("get", "/api/users", None),
        ("get", "/api/users/1", None),
        ("post", "/api/users", {
            "username": "newperson",
            "password": "Whatever-123",
            "display_name": "New Person",
            "role": "Staff",
        }),
        ("put", "/api/users/1", {"role": "Administrator"}),
        ("post", "/api/users/1/reset-password", {"new_password": "Another-123"}),
        ("put", "/api/users/1/status", {"enabled": False}),
        ("put", "/api/settings", {}),
    ],
)
def test_staff_forbidden_from_admin_routes(client, seed_users, method, path, body):
    token = _valid_token(seed_users["staff_username"])
    headers = {"Authorization": f"Bearer {token}"}
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    resp = getattr(client, method)(path, **kwargs)
    assert resp.status_code == 403


# 19: the bootstrapped default administrator can log in and perform admin ops.
def test_default_admin_can_login_and_perform_admin_ops(client, db_session):
    from app.bootstrap import create_default_admin
    from app.config import DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME

    create_default_admin(db_session)

    login = client.post(
        "/api/auth/login",
        json={
            "username": DEFAULT_ADMIN_USERNAME,
            "password": DEFAULT_ADMIN_PASSWORD,
        },
    )
    assert login.status_code == 200
    assert login.json()["role"] == "Administrator"

    token = login.json()["access_token"]
    listing = client.get(
        "/api/users", headers={"Authorization": f"Bearer {token}"}
    )
    assert listing.status_code == 200
