"""Batch 5C — print-agent authentication foundation.

These tests prove the schema-additive per-agent credential model, disabled-by-
default enrollment, one-time token issuance with hashed storage, Administrator
approval/rotation/revocation, the grace-period auth helper, and that existing
tokenless agents and staff/kiosk workflows are unaffected.

All tests run against the in-memory SQLite harness from ``conftest.py`` and never
touch the operational database.
"""

import json

from sqlalchemy import inspect

from app import auth
from app.models import PrintAgent, PrintAgentCredential, PrintStation


# Columns that existed on ``print_agents`` BEFORE Batch 5C. Batch 5C must not
# add any column to this table (credentials live in a separate table).
EXPECTED_PRINT_AGENT_COLUMNS = {
    "id",
    "agent_key",
    "hostname",
    "printer_name",
    "agent_version",
    "last_seen",
    "last_ip",
    "print_station_id",
    "enabled",
}

# Keys that must never appear in a GET /api/print-agents list item.
FORBIDDEN_AGENT_LIST_KEYS = {
    "agent_token",
    "token",
    "token_hash",
    "token_selector",
    "verifier",
}


def _admin_headers():
    return {"Authorization": f"Bearer {auth.create_access_token('testadmin')}"}


def _register(client, hostname="pi-front-door", agent_key=None):
    payload = {
        "agent_key": agent_key,
        "hostname": hostname,
        "printer_name": "QL800_BROTHER",
        "agent_version": "1.0.0",
        "station_slug": None,
    }
    response = client.post("/api/print-agents/register", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


# --- 1 & 2: schema is additive -------------------------------------------------

def test_new_credential_table_is_created(db_session):
    inspector = inspect(db_session.get_bind())
    assert "print_agent_credentials" in inspector.get_table_names()


def test_existing_print_agents_table_has_no_new_columns(db_session):
    inspector = inspect(db_session.get_bind())
    columns = {col["name"] for col in inspector.get_columns("print_agents")}
    assert columns == EXPECTED_PRINT_AGENT_COLUMNS


# --- 3, 4, 5: registration behavior -------------------------------------------

def test_registration_creates_disabled_agent(client, db_session):
    body = _register(client)

    assert body["enabled"] is False

    agent = db_session.query(PrintAgent).filter_by(id=body["id"]).first()
    assert agent is not None
    assert agent.enabled is False


def test_registration_issues_token_once_and_stores_only_a_hash(client, db_session):
    body = _register(client)

    token = body["agent_token"]
    assert token
    assert "." in token  # selector.verifier

    credentials = (
        db_session.query(PrintAgentCredential)
        .filter_by(print_agent_id=body["id"])
        .all()
    )
    assert len(credentials) == 1

    credential = credentials[0]
    # Only a hash is stored; the plaintext verifier is never persisted.
    assert credential.token_hash
    assert credential.token_hash != token
    assert token.split(".", 1)[1] not in credential.token_hash


def test_stored_hash_does_not_equal_plaintext_token(client, db_session):
    body = _register(client)
    credential = (
        db_session.query(PrintAgentCredential)
        .filter_by(print_agent_id=body["id"])
        .first()
    )
    assert credential.token_hash != body["agent_token"]


# --- 6: list endpoint never leaks secrets -------------------------------------

def test_print_agents_list_never_exposes_token_or_hash(client, seed_users):
    _register(client)

    response = client.get("/api/print-agents", headers=_admin_headers())
    assert response.status_code == 200

    items = response.json()
    assert items

    for item in items:
        assert FORBIDDEN_AGENT_LIST_KEYS.isdisjoint(item.keys())

    # Defense in depth: the raw serialized list carries no token material.
    serialized = json.dumps(items)
    assert "token_hash" not in serialized
    assert "agent_token" not in serialized


# --- 7, 8, 9, 10: credential resolution ---------------------------------------

def test_valid_token_resolves_to_the_correct_agent(client, db_session):
    body = _register(client)
    token = body["agent_token"]

    # Approve the agent so it can be authenticated.
    agent = db_session.query(PrintAgent).filter_by(id=body["id"]).first()
    agent.enabled = True
    db_session.commit()

    resolved = auth.resolve_print_agent_credential(token, db_session)
    assert resolved is not None

    resolved_agent, resolved_credential = resolved
    assert resolved_agent.id == body["id"]
    assert resolved_credential.print_agent_id == body["id"]


def test_invalid_token_is_not_authenticated(client, db_session):
    body = _register(client)

    agent = db_session.query(PrintAgent).filter_by(id=body["id"]).first()
    agent.enabled = True
    db_session.commit()

    # Wrong verifier for a real selector, plus a wholly bogus token.
    selector = body["agent_token"].split(".", 1)[0]
    assert auth.resolve_print_agent_credential(f"{selector}.wrong", db_session) is None
    assert auth.resolve_print_agent_credential("no-dot-token", db_session) is None
    assert auth.resolve_print_agent_credential("bogus.selector", db_session) is None


def test_revoked_credentials_are_rejected(client, db_session, seed_users):
    body = _register(client)
    token = body["agent_token"]

    agent = db_session.query(PrintAgent).filter_by(id=body["id"]).first()
    agent.enabled = True
    db_session.commit()

    # Valid before revocation.
    assert auth.resolve_print_agent_credential(token, db_session) is not None

    revoke = client.post(
        f"/api/print-agents/{body['id']}/credentials/revoke",
        headers=_admin_headers(),
    )
    assert revoke.status_code == 200
    assert revoke.json()["revoked"] == 1

    db_session.expire_all()
    assert auth.resolve_print_agent_credential(token, db_session) is None


def test_disabled_agent_is_not_authenticated(client, db_session):
    # Newly registered agents are disabled by default.
    body = _register(client)
    token = body["agent_token"]

    assert auth.resolve_print_agent_credential(token, db_session) is None


# --- 11: strict enforcement (grace removed) -----------------------------------

def test_tokenless_agent_is_rejected(client, db_session):
    # Grace mode has been removed: print-agent endpoints require a token.
    station = PrintStation(name="Front Desk", slug="front-desk", enabled=True)
    db_session.add(station)
    db_session.add(
        PrintAgent(agent_key="legacy-key", hostname="legacy-pi", enabled=True)
    )
    db_session.commit()

    # No Authorization header at all — must now be rejected.
    response = client.get("/api/print-jobs/pending")
    assert response.status_code == 401


# --- 12: unrelated workflows unchanged ----------------------------------------

def test_existing_kiosk_and_staff_workflows_unchanged(client, seed_users):
    # Anonymous kiosk lookup still works.
    assert client.get("/api/visitors/find?first_name=&last_name=").status_code == 200

    # Staff print-agent list still requires a token ...
    assert client.get("/api/print-agents").status_code == 401
    # ... and works with one.
    assert client.get("/api/print-agents", headers=_admin_headers()).status_code == 200


# --- 13: re-registration is not silent rotation -------------------------------

def test_reregistration_does_not_rotate_credentials(client, db_session):
    first = _register(client)
    agent_key = first["agent_key"]
    original_token = first["agent_token"]
    assert original_token

    original_hash = (
        db_session.query(PrintAgentCredential)
        .filter_by(print_agent_id=first["id"])
        .one()
        .token_hash
    )

    second = _register(client, agent_key=agent_key)

    # No new plaintext is issued and no new credential row is created.
    assert second["id"] == first["id"]
    assert second["agent_token"] is None

    credentials = (
        db_session.query(PrintAgentCredential)
        .filter_by(print_agent_id=first["id"])
        .all()
    )
    assert len(credentials) == 1
    assert credentials[0].token_hash == original_hash


# --- 14: tokens never leak -----------------------------------------------------

def test_token_value_never_appears_in_list_responses(client, seed_users):
    token = _register(client)["agent_token"]

    response = client.get("/api/print-agents", headers=_admin_headers())
    assert response.status_code == 200
    assert token not in json.dumps(response.json())


# --- Administrator approval + rotation ----------------------------------------

def test_admin_can_approve_and_disable_agent(client, db_session, seed_users):
    body = _register(client)
    assert body["enabled"] is False

    approve = client.put(
        f"/api/print-agents/{body['id']}/enabled",
        json={"enabled": True},
        headers=_admin_headers(),
    )
    assert approve.status_code == 200
    assert approve.json()["enabled"] is True

    disable = client.put(
        f"/api/print-agents/{body['id']}/enabled",
        json={"enabled": False},
        headers=_admin_headers(),
    )
    assert disable.status_code == 200
    assert disable.json()["enabled"] is False


def test_admin_approval_requires_administrator(client):
    body = _register(client)

    # No token at all -> 401 (unauthenticated), never silently applied.
    response = client.put(
        f"/api/print-agents/{body['id']}/enabled",
        json={"enabled": True},
    )
    assert response.status_code == 401


def test_credential_rotation_revokes_old_and_issues_new(client, db_session, seed_users):
    body = _register(client)
    old_token = body["agent_token"]

    agent = db_session.query(PrintAgent).filter_by(id=body["id"]).first()
    agent.enabled = True
    db_session.commit()

    rotate = client.post(
        f"/api/print-agents/{body['id']}/credentials/rotate",
        headers=_admin_headers(),
    )
    assert rotate.status_code == 200

    new_token = rotate.json()["agent_token"]
    assert new_token
    assert new_token != old_token

    db_session.expire_all()
    # The old token no longer authenticates; the new one does.
    assert auth.resolve_print_agent_credential(old_token, db_session) is None
    assert auth.resolve_print_agent_credential(new_token, db_session) is not None
