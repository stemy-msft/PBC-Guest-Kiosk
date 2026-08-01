"""M9.2 Batch 3 — station awareness & operator actionability.

These tests prove the operator-facing station-diagnostics contract:

* the pure ``station_diagnostics.station_diagnostics`` helper derives the
  correct operational state, attention level, specific reasons and a
  recommended action from a station's liveness status and queue signals;
* ``GET /api/print-stations`` surfaces each station's operational state and
  actionable diagnostics, and flags an offline station holding a pending job as
  critical with a redirect recommendation;
* ``GET /api/dashboard`` exposes the new station-awareness metrics
  (``stations_needing_attention``, ``stations_with_stuck_jobs``).

Everything runs against the in-memory SQLite harness from ``conftest.py``.
"""

from datetime import datetime, timedelta, timezone

from app import auth, station_diagnostics
from app.liveness import (
    STATION_STATUS_MAINTENANCE,
    STATION_STATUS_OFFLINE,
    STATION_STATUS_ONLINE,
    STATION_STATUS_STALE,
)
from app.models import PrintAgent, PrintJob, PrintStation, Visitor


# --- helpers ------------------------------------------------------------------

def _admin_headers():
    return {"Authorization": f"Bearer {auth.create_access_token('testadmin')}"}


def _make_station(db, slug="front-desk", name="Front Desk", enabled=True):
    station = PrintStation(name=name, slug=slug, enabled=enabled)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _make_agent(db, station_id, *, last_seen, enabled=True, hostname="pi-front"):
    agent = PrintAgent(
        agent_key=f"key-{hostname}-{station_id}",
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


def _make_visitor(db):
    visitor = Visitor(
        first_name="Ada",
        last_name="Lovelace",
        visitor_type="Guest",
        purpose="Visit",
        host_type="Staff",
        host_name="Someone",
        check_in_time=datetime.utcnow(),
    )
    db.add(visitor)
    db.commit()
    db.refresh(visitor)
    return visitor


def _make_job(db, station_id, status="Pending", created_time=None, **kwargs):
    job = PrintJob(
        visitor_id=_make_visitor(db).id,
        badge_path="/tmp/badge.png",
        status=status,
        print_station_id=station_id,
        created_time=created_time or datetime.utcnow(),
        **kwargs,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# --- 1: pure diagnostics ------------------------------------------------------

def test_online_idle_station_is_healthy():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_ONLINE,
    )
    assert result["operational_state"] == station_diagnostics.STATE_HEALTHY
    assert result["attention"] is False
    assert result["attention_level"] == station_diagnostics.ATTENTION_NONE
    assert result["attention_reasons"] == []
    assert result["recommended_action"] is None


def test_online_station_with_pending_is_busy_not_attention():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_ONLINE,
        pending_jobs=2,
        printing_jobs=1,
    )
    assert result["operational_state"] == station_diagnostics.STATE_BUSY
    assert result["attention"] is False
    assert result["attention_level"] == station_diagnostics.ATTENTION_NONE


def test_offline_station_with_pending_is_critical_and_recommends_redirect():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_OFFLINE,
        pending_jobs=3,
    )
    assert result["operational_state"] == station_diagnostics.STATE_OFFLINE
    assert result["attention"] is True
    assert result["attention_level"] == station_diagnostics.ATTENTION_CRITICAL
    assert any("offline" in r.lower() for r in result["attention_reasons"])
    assert "redirect" in result["recommended_action"].lower()


def test_offline_station_without_jobs_is_only_a_warning():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_OFFLINE,
    )
    assert result["operational_state"] == station_diagnostics.STATE_OFFLINE
    assert result["attention"] is True
    assert result["attention_level"] == station_diagnostics.ATTENTION_WARN


def test_stale_station_with_pending_is_critical():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_STALE,
        pending_jobs=1,
    )
    assert result["operational_state"] == station_diagnostics.STATE_ATTENTION
    assert result["attention_level"] == station_diagnostics.ATTENTION_CRITICAL
    assert any("quiet" in r.lower() for r in result["attention_reasons"])


def test_stale_station_without_jobs_is_a_warning():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_STALE,
    )
    assert result["attention_level"] == station_diagnostics.ATTENTION_WARN
    assert result["operational_state"] == station_diagnostics.STATE_ATTENTION


def test_multiple_failed_jobs_is_critical():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_ONLINE,
        failed_jobs=station_diagnostics.STATION_FAILED_JOBS_CRITICAL,
    )
    assert result["attention_level"] == station_diagnostics.ATTENTION_CRITICAL
    assert any("failed" in r.lower() for r in result["attention_reasons"])


def test_single_failed_job_is_only_a_warning():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_ONLINE,
        failed_jobs=1,
    )
    assert result["attention_level"] == station_diagnostics.ATTENTION_WARN


def test_aging_queue_on_online_station_warns():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_ONLINE,
        pending_jobs=1,
        oldest_pending_age_seconds=(
            station_diagnostics.STATION_QUEUE_AGE_WARN_SECONDS + 120
        ),
    )
    assert result["attention"] is True
    assert result["attention_level"] == station_diagnostics.ATTENTION_WARN
    assert any("aging" in r.lower() for r in result["attention_reasons"])


def test_repeated_recoveries_warn():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_ONLINE,
        recovering_jobs=station_diagnostics.STATION_REPEATED_RECOVERY_COUNT,
    )
    assert result["attention"] is True
    assert any("recover" in r.lower() for r in result["attention_reasons"])


def test_maintenance_station_never_raises_attention():
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_MAINTENANCE,
        pending_jobs=5,
        failed_jobs=5,
    )
    assert result["operational_state"] == station_diagnostics.STATE_MAINTENANCE
    assert result["attention"] is False
    assert result["attention_level"] == station_diagnostics.ATTENTION_NONE


def test_critical_action_wins_over_warning_action():
    # Offline with pending (critical) AND a single failed job (warn): the
    # recommended action must come from the critical signal.
    result = station_diagnostics.station_diagnostics(
        status=STATION_STATUS_OFFLINE,
        pending_jobs=1,
        failed_jobs=1,
    )
    assert result["attention_level"] == station_diagnostics.ATTENTION_CRITICAL
    assert "redirect" in result["recommended_action"].lower()


# --- 2: GET /api/print-stations enrichment -----------------------------------

def test_print_stations_expose_operational_diagnostics(client, db_session, seed_users):
    _make_station(db_session, slug="s1", name="Idle Station")

    resp = client.get("/api/print-stations", headers=_admin_headers())
    assert resp.status_code == 200
    row = resp.json()[0]
    for key in (
        "operational_state",
        "attention",
        "attention_level",
        "attention_reasons",
        "recommended_action",
        "summary",
        "pending_jobs",
        "printing_jobs",
        "failed_jobs",
        "jobs_requiring_attention",
        "oldest_pending_age_seconds",
    ):
        assert key in row


def test_offline_station_with_pending_job_flagged_critical(client, db_session, seed_users):
    station = _make_station(db_session, slug="offline-desk", name="Offline Desk")
    # No agent has ever reported -> station is offline; add a pending job.
    _make_job(db_session, station.id, status="Pending")

    resp = client.get("/api/print-stations", headers=_admin_headers())
    assert resp.status_code == 200
    row = next(r for r in resp.json() if r["slug"] == "offline-desk")
    assert row["operational_state"] == "offline"
    assert row["attention"] is True
    assert row["attention_level"] == "critical"
    assert row["pending_jobs"] == 1
    assert row["recommended_action"]
    assert "redirect" in row["recommended_action"].lower()


def test_online_idle_station_reports_healthy(client, db_session, seed_users):
    station = _make_station(db_session, slug="live-desk", name="Live Desk")
    _make_agent(db_session, station.id, last_seen=datetime.utcnow())

    resp = client.get("/api/print-stations", headers=_admin_headers())
    row = next(r for r in resp.json() if r["slug"] == "live-desk")
    assert row["status"] == "online"
    assert row["operational_state"] == "healthy"
    assert row["attention"] is False


# --- 3: GET /api/dashboard station-awareness metrics -------------------------

def test_dashboard_exposes_station_awareness_metrics(client, db_session, seed_users):
    resp = client.get("/api/dashboard", headers=_admin_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert "stations_needing_attention" in body
    assert "stations_with_stuck_jobs" in body


def test_dashboard_counts_station_needing_attention(client, db_session, seed_users):
    # An offline station holding a pending job needs attention and has a stuck job.
    station = _make_station(db_session, slug="attn-desk", name="Attn Desk")
    old = datetime.utcnow() - timedelta(minutes=30)
    _make_job(db_session, station.id, status="Pending", created_time=old)

    resp = client.get("/api/dashboard", headers=_admin_headers())
    body = resp.json()
    assert body["stations_needing_attention"] >= 1
    assert body["stations_with_stuck_jobs"] >= 1
