"""M9.2 Batch 1 — canonical health, agent liveness & dashboard visibility.

Proves the single-source-of-truth contract introduced in Batch 1:

* ``/health`` performs REAL dependency checks and returns 503 (not a cheerful
  200) when the database or configuration is unavailable;
* ``/health/live`` is a cheap, always-200 liveness probe;
* agent liveness is computed on the backend from ``last_seen`` (no timezone
  math on the client) and decays after the online window;
* the dashboard reports online/offline agents and online/stale/offline/
  maintenance stations consistently from that same computation.

Runs against the in-memory SQLite harness from ``conftest.py``.
"""

from datetime import datetime, timedelta

from app import auth, main
from app.liveness import (
    AGENT_ONLINE_SECONDS,
    STATION_STATUS_MAINTENANCE,
    STATION_STATUS_OFFLINE,
    STATION_STATUS_ONLINE,
    STATION_STATUS_STALE,
    agent_is_online,
    station_status,
)
from app.models import PrintAgent, PrintStation


# --- helpers ------------------------------------------------------------------


def _admin_headers():
    return {"Authorization": f"Bearer {auth.create_access_token('testadmin')}"}


def _make_station(db, slug="front-desk", name="Front Desk", enabled=True):
    station = PrintStation(name=name, slug=slug, enabled=enabled)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _make_agent(db, station_id=None, enabled=True, hostname="pi-1", last_seen=None):
    agent = PrintAgent(
        agent_key=f"key-{hostname}",
        hostname=hostname,
        printer_name="QL800",
        agent_version="1.0.0",
        enabled=enabled,
        print_station_id=station_id,
        last_seen=last_seen,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


# --- liveness unit logic ------------------------------------------------------


def test_agent_online_within_window():
    recent = datetime.utcnow() - timedelta(seconds=AGENT_ONLINE_SECONDS - 5)
    assert agent_is_online(recent) is True


def test_agent_offline_past_window():
    stale = datetime.utcnow() - timedelta(seconds=AGENT_ONLINE_SECONDS + 30)
    assert agent_is_online(stale) is False


def test_agent_never_seen_is_offline():
    assert agent_is_online(None) is False


def test_station_status_online_when_agent_fresh():
    fresh = datetime.utcnow()
    assert (
        station_status(enabled=True, agent_last_seens=[fresh])
        == STATION_STATUS_ONLINE
    )


def test_station_status_stale_when_agent_seen_but_old():
    old = datetime.utcnow() - timedelta(seconds=AGENT_ONLINE_SECONDS + 60)
    assert (
        station_status(enabled=True, agent_last_seens=[old])
        == STATION_STATUS_STALE
    )


def test_station_status_offline_when_never_seen():
    assert (
        station_status(enabled=True, agent_last_seens=[None])
        == STATION_STATUS_OFFLINE
    )
    assert (
        station_status(enabled=True, agent_last_seens=[])
        == STATION_STATUS_OFFLINE
    )


def test_station_status_maintenance_when_disabled():
    fresh = datetime.utcnow()
    assert (
        station_status(enabled=False, agent_last_seens=[fresh])
        == STATION_STATUS_MAINTENANCE
    )


# --- /health & /health/live ---------------------------------------------------


def test_health_live_is_cheap_and_always_ok(client):
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}


def test_health_healthy_when_all_dependencies_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["version"] == "1.0.0-rc.1"
    assert body["release"] == "1.0.0 RC1"
    assert body["checks"]["database"]["ok"] is True
    assert body["checks"]["configuration"]["ok"] is True


def test_health_reports_unhealthy_when_database_unavailable(client, monkeypatch):
    class _BrokenEngine:
        def connect(self):
            raise RuntimeError("database is gone")

    monkeypatch.setattr(main, "engine", _BrokenEngine())

    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unhealthy"
    assert body["checks"]["database"]["ok"] is False


def test_health_reports_unhealthy_when_configuration_missing(client, monkeypatch, tmp_path):
    missing = tmp_path / "does-not-exist.json"
    monkeypatch.setattr(main, "SETTINGS_FILE", missing)

    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unhealthy"
    assert body["checks"]["configuration"]["ok"] is False


# --- dashboard visibility -----------------------------------------------------


def test_dashboard_counts_online_and_offline_agents(client, db_session, seed_users):
    station = _make_station(db_session)
    _make_agent(
        db_session,
        station_id=station.id,
        hostname="fresh",
        last_seen=datetime.utcnow(),
    )
    _make_agent(
        db_session,
        station_id=station.id,
        hostname="stale",
        last_seen=datetime.utcnow() - timedelta(seconds=AGENT_ONLINE_SECONDS + 120),
    )
    _make_agent(db_session, station_id=station.id, hostname="never", last_seen=None)

    resp = client.get("/api/dashboard", headers=_admin_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_agents"] == 3
    assert body["online_agents"] == 1
    assert body["offline_agents"] == 2


def test_dashboard_station_status_breakdown(client, db_session, seed_users):
    online_station = _make_station(db_session, slug="s-online", name="Online")
    stale_station = _make_station(db_session, slug="s-stale", name="Stale")
    offline_station = _make_station(db_session, slug="s-offline", name="Offline")
    maint_station = _make_station(
        db_session, slug="s-maint", name="Maint", enabled=False
    )

    _make_agent(
        db_session,
        station_id=online_station.id,
        hostname="a-online",
        last_seen=datetime.utcnow(),
    )
    _make_agent(
        db_session,
        station_id=stale_station.id,
        hostname="a-stale",
        last_seen=datetime.utcnow() - timedelta(seconds=AGENT_ONLINE_SECONDS + 120),
    )
    # offline_station has no agent at all; maint_station is disabled.

    resp = client.get("/api/dashboard", headers=_admin_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["online_stations"] == 1
    assert body["stale_stations"] == 1
    assert body["offline_stations"] == 1
    assert body["maintenance_stations"] == 1


def test_print_stations_endpoint_exposes_status(client, db_session):
    station = _make_station(db_session, slug="fd", name="Front Desk")
    _make_agent(
        db_session,
        station_id=station.id,
        hostname="live",
        last_seen=datetime.utcnow(),
    )

    resp = client.get("/api/print-stations")
    assert resp.status_code == 200
    payload = {s["slug"]: s for s in resp.json()}
    assert payload["fd"]["status"] == STATION_STATUS_ONLINE
    assert payload["fd"]["online"] is True


def test_dead_agent_does_not_keep_station_online(client, db_session, seed_users):
    """Regression: the previous implementation reported a station online forever
    once an agent had ever registered. A long-dead agent must now read offline.
    """
    station = _make_station(db_session, slug="dead", name="Dead")
    _make_agent(
        db_session,
        station_id=station.id,
        hostname="corpse",
        last_seen=datetime.utcnow() - timedelta(hours=6),
    )

    resp = client.get("/api/dashboard", headers=_admin_headers())
    body = resp.json()
    assert body["online_stations"] == 0
    assert body["stale_stations"] == 1
