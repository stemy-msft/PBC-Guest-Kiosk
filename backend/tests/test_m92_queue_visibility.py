"""M9.2 Batch 2 — queue visibility & operational diagnostics.

These tests prove the operator-facing queue-diagnostics contract:

* the pure ``queue_diagnostics.job_diagnostics`` helper derives the correct
  attention level and reasons from stored job fields (age, attempts, recovery,
  station liveness, failure);
* ``GET /api/print-jobs`` surfaces the previously-hidden operational fields and
  the derived diagnostics, and flags a pending job on an offline station as
  critical;
* ``GET /api/dashboard`` exposes the new queue metrics (oldest pending age,
  jobs requiring attention, recovering jobs) with correct values.

Everything runs against the in-memory SQLite harness from ``conftest.py``.
"""

from datetime import datetime, timedelta, timezone

from app import auth, queue_diagnostics
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

def test_healthy_pending_job_needs_no_attention():
    now = datetime.now(timezone.utc)
    result = queue_diagnostics.job_diagnostics(
        status="Pending",
        created_time=now,
        station_online=True,
        now=now,
    )
    assert result["attention"] is False
    assert result["attention_level"] == queue_diagnostics.ATTENTION_NONE
    assert result["attention_reasons"] == []
    assert result["age_seconds"] is not None


def test_pending_job_waiting_too_long_warns():
    now = datetime.now(timezone.utc)
    created = now - timedelta(
        seconds=queue_diagnostics.PENDING_STUCK_SECONDS + 60
    )
    result = queue_diagnostics.job_diagnostics(
        status="Pending",
        created_time=created,
        station_online=True,
        now=now,
    )
    assert result["attention_level"] == queue_diagnostics.ATTENTION_WARN
    assert any("Pending" in reason for reason in result["attention_reasons"])


def test_pending_job_on_offline_station_is_critical():
    now = datetime.now(timezone.utc)
    result = queue_diagnostics.job_diagnostics(
        status="Pending",
        created_time=now,
        station_online=False,
        now=now,
    )
    assert result["attention_level"] == queue_diagnostics.ATTENTION_CRITICAL
    assert any("offline" in reason for reason in result["attention_reasons"])


def test_stalled_printing_job_warns():
    now = datetime.now(timezone.utc)
    claimed = now - timedelta(
        seconds=queue_diagnostics.PRINTING_STUCK_SECONDS + 30
    )
    result = queue_diagnostics.job_diagnostics(
        status="Printing",
        created_time=claimed,
        claimed_time=claimed,
        station_online=True,
        now=now,
    )
    assert result["attention_level"] == queue_diagnostics.ATTENTION_WARN
    assert any("stalled" in reason for reason in result["attention_reasons"])


def test_repeatedly_retried_job_warns():
    now = datetime.now(timezone.utc)
    result = queue_diagnostics.job_diagnostics(
        status="Pending",
        created_time=now,
        attempt_count=queue_diagnostics.REPEATED_FAILURE_ATTEMPTS,
        station_online=True,
        now=now,
    )
    assert result["attention"] is True
    assert any("Retried" in reason for reason in result["attention_reasons"])


def test_recovering_job_warns():
    now = datetime.now(timezone.utc)
    result = queue_diagnostics.job_diagnostics(
        status="Pending",
        created_time=now,
        last_recovery_reason="Lease expired and agent unresponsive; requeued",
        station_online=True,
        now=now,
    )
    assert result["attention"] is True
    assert any("recovered" in reason.lower() for reason in result["attention_reasons"])


def test_failed_job_is_critical_and_surfaces_error():
    now = datetime.now(timezone.utc)
    result = queue_diagnostics.job_diagnostics(
        status="Failed",
        created_time=now,
        error_message="Printer offline",
        station_online=True,
        now=now,
    )
    assert result["attention_level"] == queue_diagnostics.ATTENTION_CRITICAL
    assert any("Printer offline" in reason for reason in result["attention_reasons"])


# --- 2: queue endpoint enrichment ---------------------------------------------

def test_print_jobs_list_exposes_operational_fields(client, db_session, seed_users):
    station = _make_station(db_session)
    _make_job(
        db_session,
        station.id,
        status="Failed",
        attempt_count=3,
        last_recovery_reason="Retry cap reached",
        error_message="Printer jam",
    )

    response = client.get("/api/print-jobs", headers=_admin_headers())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body

    job = body[0]
    for field in (
        "attempt_count",
        "claim_generation",
        "claim_expires_at",
        "last_recovery_reason",
        "agent_hostname",
        "station_status",
        "station_online",
        "age_seconds",
        "attention",
        "attention_level",
        "attention_reasons",
        "error_message",
        "completed_time",
    ):
        assert field in job

    assert job["attempt_count"] == 3
    assert job["last_recovery_reason"] == "Retry cap reached"
    assert job["error_message"] == "Printer jam"
    assert job["attention"] is True
    assert job["attention_level"] == "critical"


def test_print_jobs_list_flags_pending_on_offline_station(client, db_session, seed_users):
    # Station has an agent, but it went quiet long ago -> not online.
    station = _make_station(db_session)
    _make_agent(
        db_session,
        station.id,
        last_seen=datetime.utcnow() - timedelta(hours=1),
    )
    _make_job(db_session, station.id, status="Pending")

    response = client.get("/api/print-jobs", headers=_admin_headers())
    assert response.status_code == 200, response.text
    job = response.json()[0]

    assert job["station_online"] is False
    assert job["attention_level"] == "critical"
    assert any("offline" in reason for reason in job["attention_reasons"])


def test_print_jobs_list_healthy_job_needs_no_attention(client, db_session, seed_users):
    station = _make_station(db_session)
    _make_agent(db_session, station.id, last_seen=datetime.utcnow())
    _make_job(db_session, station.id, status="Pending")

    response = client.get("/api/print-jobs", headers=_admin_headers())
    assert response.status_code == 200, response.text
    job = response.json()[0]

    assert job["station_online"] is True
    assert job["attention"] is False
    assert job["attention_level"] == "none"


# --- 3: dashboard queue metrics -----------------------------------------------

def test_dashboard_exposes_queue_metrics(client, db_session, seed_users):
    station = _make_station(db_session)
    _make_agent(db_session, station.id, last_seen=datetime.utcnow())

    # An aged pending job (oldest) that is also recovering.
    _make_job(
        db_session,
        station.id,
        status="Pending",
        created_time=datetime.utcnow() - timedelta(minutes=10),
        last_recovery_reason="Lease expired; requeued",
    )
    # A failed job (requires attention).
    _make_job(
        db_session,
        station.id,
        status="Failed",
        error_message="Printer jam",
    )

    response = client.get("/api/dashboard", headers=_admin_headers())
    assert response.status_code == 200, response.text
    body = response.json()

    assert "oldest_pending_age_seconds" in body
    assert "jobs_requiring_attention" in body
    assert "recovering_jobs" in body

    assert body["oldest_pending_age_seconds"] is not None
    assert body["oldest_pending_age_seconds"] >= 60 * 10 - 5
    assert body["recovering_jobs"] == 1
    # Both the aged pending (stuck + recovering) and failed job need attention.
    assert body["jobs_requiring_attention"] >= 2


def test_dashboard_queue_metrics_default_when_empty(client, db_session, seed_users):
    response = client.get("/api/dashboard", headers=_admin_headers())
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["oldest_pending_age_seconds"] is None
    assert body["jobs_requiring_attention"] == 0
    assert body["recovering_jobs"] == 0
