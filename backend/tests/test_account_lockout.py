"""F-009 (M9.3.1) account-lockout regression tests.

Covers the required scenarios: threshold reached, lockout enforced (even with a
correct password), successful login resets the counter, lockout expiration
(auto-unlock), disabled-account behavior unchanged, and audit generation for
both lock and unlock events. The lockout logic is additive to the existing
authentication flow; these tests assert it without changing that architecture.
"""

import logging
from datetime import datetime, timedelta

from app import main
from app.models import User


def _login(client, username, password):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )


def _get_user(db_session, username):
    return db_session.query(User).filter(User.username == username).first()


# 1 - threshold reached sets the lock on the Nth consecutive failure.
def test_threshold_reached_sets_lock(client, seed_users, db_session, monkeypatch):
    monkeypatch.setattr(main, "_load_lockout_policy", lambda: (3, 15))
    for _ in range(2):
        assert _login(client, "teststaff", "wrong").status_code == 401
    user = _get_user(db_session, "teststaff")
    assert user.locked_until is None  # below threshold, not yet locked
    assert user.failed_login_count == 2

    resp = _login(client, "teststaff", "wrong")  # third failure trips the lock
    assert resp.status_code == 401
    user = _get_user(db_session, "teststaff")
    assert user.failed_login_count == 3
    assert user.locked_until is not None
    assert user.locked_until > datetime.now()


# 2 - an active lock rejects even the correct password.
def test_lockout_enforced_even_with_correct_password(
    client, seed_users, db_session, monkeypatch
):
    monkeypatch.setattr(main, "_load_lockout_policy", lambda: (3, 15))
    for _ in range(3):
        _login(client, "teststaff", "wrong")
    resp = _login(client, "teststaff", seed_users["password"])
    assert resp.status_code == 401
    assert "locked" in resp.json()["detail"].lower()


# 3 - a successful login below the threshold resets the failure counter.
def test_successful_login_resets_counter(client, seed_users, db_session):
    _login(client, "teststaff", "wrong")
    _login(client, "teststaff", "wrong")
    resp = _login(client, "teststaff", seed_users["password"])
    assert resp.status_code == 200
    user = _get_user(db_session, "teststaff")
    assert user.failed_login_count == 0
    assert user.locked_until is None


# 4 - an expired lock auto-unlocks and authentication then succeeds.
def test_lockout_expiration_auto_unlocks(client, seed_users, db_session):
    user = _get_user(db_session, "teststaff")
    user.failed_login_count = 5
    user.locked_until = datetime.now() - timedelta(minutes=1)  # already elapsed
    db_session.commit()

    resp = _login(client, "teststaff", seed_users["password"])
    assert resp.status_code == 200
    user = _get_user(db_session, "teststaff")
    assert user.locked_until is None
    assert user.failed_login_count == 0


# 5 - an unexpired lock blocks the attempt before password verification.
def test_active_lock_blocks_before_expiry(client, seed_users, db_session):
    user = _get_user(db_session, "teststaff")
    user.locked_until = datetime.now() + timedelta(minutes=10)
    db_session.commit()

    resp = _login(client, "teststaff", seed_users["password"])
    assert resp.status_code == 401
    assert "locked" in resp.json()["detail"].lower()


# 6 - disabled accounts still return 403 and are never locked.
def test_disabled_account_behavior_unchanged(client, seed_users, db_session):
    resp = _login(client, "disableduser", seed_users["password"])
    assert resp.status_code == 403
    user = _get_user(db_session, "disableduser")
    assert user.locked_until is None
    assert user.failed_login_count == 0


# 7 - lock and blocked-attempt events are written to the audit log.
def test_audit_events_generated(
    client, seed_users, db_session, monkeypatch, caplog
):
    monkeypatch.setattr(main, "_load_lockout_policy", lambda: (2, 15))
    with caplog.at_level(logging.INFO, logger="audit"):
        _login(client, "teststaff", "wrong")  # attempt #1
        _login(client, "teststaff", "wrong")  # attempt #2 -> trips the lock
        _login(client, "teststaff", "wrong")  # blocked while locked
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "ACCOUNT_LOCKED" in messages
    assert "LOGIN_LOCKED" in messages


# 8 - clearing an expired lock on success emits an unlock audit event.
def test_unlock_audit_on_successful_login_after_expiry(
    client, seed_users, db_session, caplog
):
    user = _get_user(db_session, "teststaff")
    user.failed_login_count = 5
    user.locked_until = datetime.now() - timedelta(minutes=1)
    db_session.commit()

    with caplog.at_level(logging.INFO, logger="audit"):
        resp = _login(client, "teststaff", seed_users["password"])
    assert resp.status_code == 200
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "ACCOUNT_UNLOCKED" in messages


# 9 - the effective policy comes from system_settings.json, with the env-derived
#     constants used only as the fallback default.
def test_policy_reads_from_settings_file(tmp_path, monkeypatch):
    settings_file = tmp_path / "system_settings.json"
    settings_file.write_text(
        '{"login_lockout_threshold": 2, "login_lockout_minutes": 30}',
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "SETTINGS_FILE", settings_file)
    assert main._load_lockout_policy() == (2, 30)


# 10 - a missing/invalid settings file falls back to the env-derived defaults.
def test_policy_falls_back_to_env_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "SETTINGS_FILE", tmp_path / "does-not-exist.json")
    monkeypatch.setattr(main, "LOGIN_LOCKOUT_THRESHOLD", 7)
    monkeypatch.setattr(main, "LOGIN_LOCKOUT_MINUTES", 11)
    assert main._load_lockout_policy() == (7, 11)


# 11 - the Settings screen round-trips the lockout policy for an admin.
def test_settings_endpoint_exposes_and_updates_lockout(
    client, seed_users, tmp_path, monkeypatch
):
    import json

    settings_file = tmp_path / "system_settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "theme": "defaultLight",
                "auto_refresh_seconds": 5,
                "base_checkin_url": "http://example.test",
                "visitor_types": ["Parent"],
                "visit_purposes": ["Dinner"],
                "required_checkin_fields": ["first_name"],
                "required_returning_checkin_fields": ["first_name"],
                "login_lockout_threshold": 5,
                "login_lockout_minutes": 15,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "SETTINGS_FILE", settings_file)

    token = main.create_access_token(seed_users["enabled_username"])
    headers = {"Authorization": f"Bearer {token}"}

    current = client.get("/api/settings").json()
    assert "login_lockout_threshold" in current
    assert "login_lockout_minutes" in current

    current["login_lockout_threshold"] = 8
    current["login_lockout_minutes"] = 20
    resp = client.put("/api/settings", json=current, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["login_lockout_threshold"] == 8
    assert body["login_lockout_minutes"] == 20
    # And the loader now reflects the persisted change.
    assert main._load_lockout_policy() == (8, 20)

