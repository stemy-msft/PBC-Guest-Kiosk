"""Batch 5D — print-agent enforcement, atomic claim, ownership & recovery.

These tests prove the ratified ownership/lease/recovery contract (remediation
plan §§20-21):

* the inline, idempotent Step 0 migration adds the ownership columns safely;
* print endpoints strictly require agent credentials (grace mode removed);
* claims are atomic (single conditional UPDATE) and conflict with 409;
* an authenticated agent is confined to its own station (cross-station 403);
* disabled agents are rejected (403) and bad tokens are rejected (401);
* abandoned leases are recovered (requeue, then fail past the retry cap);
* stale updates from a recovered lease are rejected by generation;
* the new anonymous status endpoint exposes only a minimized projection.

Everything runs against the in-memory SQLite harness from ``conftest.py``.
"""

from datetime import datetime, timedelta

from sqlalchemy import inspect

from app import auth, main
from app.models import (
    PrintAgent,
    PrintAgentCredential,
    PrintJob,
    PrintStation,
    Visitor,
)


# --- helpers ------------------------------------------------------------------

def _make_station(db, slug="front-desk", name="Front Desk", enabled=True):
    station = PrintStation(name=name, slug=slug, enabled=enabled)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _make_agent_with_token(
    db, station_id=None, enabled=True, hostname="pi-front-door", last_seen=None
):
    selector, verifier, token = auth.generate_agent_token()
    agent = PrintAgent(
        agent_key=f"key-{selector}",
        hostname=hostname,
        printer_name="QL800_BROTHER",
        agent_version="1.0.0",
        enabled=enabled,
        print_station_id=station_id,
        last_seen=last_seen or datetime.utcnow(),
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    credential = PrintAgentCredential(
        print_agent_id=agent.id,
        token_selector=selector,
        token_hash=auth.hash_agent_verifier(verifier),
    )
    db.add(credential)
    db.commit()

    return agent, token


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


def _make_job(db, station_id, status="Pending", visitor_id=None, **kwargs):
    if visitor_id is None:
        visitor_id = _make_visitor(db).id
    job = PrintJob(
        visitor_id=visitor_id,
        badge_path="/tmp/does-not-exist-badge.png",
        status=status,
        print_station_id=station_id,
        created_time=datetime.utcnow(),
        **kwargs,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _agent_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --- Step 0: migration --------------------------------------------------------

def test_migration_adds_ownership_columns(db_session):
    columns = {col["name"] for col in inspect(db_session.get_bind()).get_columns("print_jobs")}
    for expected in (
        "claimed_by_agent_id",
        "claim_expires_at",
        "claim_generation",
        "attempt_count",
        "last_recovery_reason",
    ):
        assert expected in columns


def test_migration_is_idempotent(db_session):
    bind = db_session.get_bind()
    # Columns already exist (create_all built the current model), so a re-run is
    # a no-op and must never raise or duplicate work.
    first = main._apply_print_jobs_ownership_migration(bind)
    second = main._apply_print_jobs_ownership_migration(bind)
    assert first == []
    assert second == []


# --- Step 1: strict enforcement (grace removed) ------------------------------

def test_claim_without_token_is_rejected_401(client, db_session):
    station = _make_station(db_session)
    job = _make_job(db_session, station.id)

    response = client.put(f"/api/print-jobs/{job.id}/claim")

    assert response.status_code == 401
    db_session.refresh(job)
    assert job.status == "Pending"


def test_invalid_token_is_rejected_401(client, db_session):
    _make_station(db_session)

    response = client.get(
        "/api/print-jobs/pending",
        headers={"Authorization": "Bearer not-a-real.credential"},
    )

    assert response.status_code == 401


def test_disabled_agent_is_rejected_403(client, db_session):
    station = _make_station(db_session)
    _agent, token = _make_agent_with_token(
        db_session, station_id=station.id, enabled=False
    )

    response = client.get(
        "/api/print-jobs/pending", headers=_agent_headers(token)
    )

    assert response.status_code == 403


# --- Step 2 + 3: atomic claim, ownership, conflict ---------------------------

def test_authenticated_agent_claims_and_sets_ownership(client, db_session):
    station = _make_station(db_session)
    agent, token = _make_agent_with_token(db_session, station_id=station.id)
    job = _make_job(db_session, station.id)

    response = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "Printing"
    assert body["claim_generation"] == 1

    db_session.refresh(job)
    assert job.claimed_by_agent_id == agent.id
    assert job.attempt_count == 1
    assert job.claim_expires_at is not None


def test_second_claim_conflicts_with_409(client, db_session):
    station = _make_station(db_session)
    _agent, token = _make_agent_with_token(db_session, station_id=station.id)
    job = _make_job(db_session, station.id)

    first = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )
    assert first.status_code == 200

    second = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )
    assert second.status_code == 409


def test_cross_station_claim_is_forbidden_403(client, db_session):
    station_a = _make_station(db_session, slug="station-a", name="Station A")
    station_b = _make_station(db_session, slug="station-b", name="Station B")
    _agent, token = _make_agent_with_token(db_session, station_id=station_b.id)
    job = _make_job(db_session, station_a.id)

    response = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )

    assert response.status_code == 403
    db_session.refresh(job)
    assert job.status == "Pending"


def test_pending_is_scoped_to_agent_station(client, db_session):
    station_a = _make_station(db_session, slug="station-a", name="Station A")
    station_b = _make_station(db_session, slug="station-b", name="Station B")
    _agent, token = _make_agent_with_token(db_session, station_id=station_a.id)

    _make_job(db_session, station_a.id)
    _make_job(db_session, station_b.id)

    response = client.get(
        "/api/print-jobs/pending", headers=_agent_headers(token)
    )

    assert response.status_code == 200
    jobs = response.json()
    assert len(jobs) == 1
    # All returned jobs must belong to the agent's station.
    for job in jobs:
        db_job = db_session.query(PrintJob).filter_by(id=job["id"]).first()
        assert db_job.print_station_id == station_a.id


# --- Step 4: recovery ---------------------------------------------------------

def test_expired_lease_with_stale_agent_is_requeued(client, db_session):
    station = _make_station(db_session)
    stale_agent, _token = _make_agent_with_token(
        db_session,
        station_id=station.id,
        last_seen=datetime.utcnow() - timedelta(seconds=1000),
    )
    job = _make_job(
        db_session,
        station.id,
        status="Printing",
        claimed_by_agent_id=stale_agent.id,
        claim_expires_at=datetime.utcnow() - timedelta(seconds=10),
        claim_generation=1,
        attempt_count=1,
    )

    recovered = main.recover_stale_print_jobs(db_session, station_id=station.id)

    assert recovered == 1
    db_session.refresh(job)
    assert job.status == "Pending"
    assert job.claimed_by_agent_id is None
    assert job.claim_expires_at is None
    assert job.claim_generation == 2
    assert job.last_recovery_reason


def test_live_agent_lease_is_not_recovered(db_session):
    station = _make_station(db_session)
    live_agent, _token = _make_agent_with_token(
        db_session, station_id=station.id, last_seen=datetime.utcnow()
    )
    job = _make_job(
        db_session,
        station.id,
        status="Printing",
        claimed_by_agent_id=live_agent.id,
        claim_expires_at=datetime.utcnow() - timedelta(seconds=10),
        claim_generation=1,
        attempt_count=1,
    )

    recovered = main.recover_stale_print_jobs(db_session, station_id=station.id)

    assert recovered == 0
    db_session.refresh(job)
    assert job.status == "Printing"


def test_retry_cap_fails_the_job(db_session):
    station = _make_station(db_session)
    stale_agent, _token = _make_agent_with_token(
        db_session,
        station_id=station.id,
        last_seen=datetime.utcnow() - timedelta(seconds=1000),
    )
    job = _make_job(
        db_session,
        station.id,
        status="Printing",
        claimed_by_agent_id=stale_agent.id,
        claim_expires_at=datetime.utcnow() - timedelta(seconds=10),
        claim_generation=3,
        attempt_count=main.PRINT_JOB_MAX_ATTEMPTS,
    )

    recovered = main.recover_stale_print_jobs(db_session, station_id=station.id)

    assert recovered == 1
    db_session.refresh(job)
    assert job.status == "Failed"
    assert job.last_recovery_reason


# --- Step 6: stale-update rejection ------------------------------------------

def test_stale_generation_update_is_rejected_409(client, db_session):
    station = _make_station(db_session)
    agent, token = _make_agent_with_token(db_session, station_id=station.id)
    job = _make_job(db_session, station.id)

    claim = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )
    assert claim.status_code == 200
    claimed_generation = claim.json()["claim_generation"]

    # Simulate a recovery bumping the generation underneath the agent.
    job_row = db_session.query(PrintJob).filter_by(id=job.id).first()
    job_row.claim_generation = claimed_generation + 5
    db_session.commit()

    response = client.put(
        f"/api/print-jobs/{job.id}/status",
        headers=_agent_headers(token),
        json={"status": "Completed", "claim_generation": claimed_generation},
    )

    assert response.status_code == 409


def test_matching_generation_update_succeeds(client, db_session):
    station = _make_station(db_session)
    _agent, token = _make_agent_with_token(db_session, station_id=station.id)
    visitor = _make_visitor(db_session)
    job = _make_job(db_session, station.id, visitor_id=visitor.id)

    claim = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )
    generation = claim.json()["claim_generation"]

    response = client.put(
        f"/api/print-jobs/{job.id}/status",
        headers=_agent_headers(token),
        json={"status": "Completed", "claim_generation": generation},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "Completed"
    db_session.refresh(job)
    assert job.claim_expires_at is None


def test_status_update_without_generation_is_rejected_400(client, db_session):
    station = _make_station(db_session)
    _agent, token = _make_agent_with_token(db_session, station_id=station.id)
    job = _make_job(db_session, station.id)

    claim = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(token)
    )
    assert claim.status_code == 200

    # claim_generation is mandatory server-side regardless of job status.
    response = client.put(
        f"/api/print-jobs/{job.id}/status",
        headers=_agent_headers(token),
        json={"status": "Completed"},
    )

    assert response.status_code == 400


def test_expired_printing_job_is_reclaimable_without_recovery(client, db_session):
    # Self-correcting claim: an orphaned Printing job with a lapsed lease must be
    # surfaced and atomically re-claimable without depending on the recovery
    # sweep. The prior owner is fresh (not stale), so recovery would NOT requeue
    # it; correctness comes from the claim path alone.
    station = _make_station(db_session)
    dead_agent, _dead_token = _make_agent_with_token(
        db_session, station_id=station.id, hostname="dead"
    )
    live_agent, live_token = _make_agent_with_token(
        db_session, station_id=station.id, hostname="live"
    )
    job = _make_job(
        db_session,
        station.id,
        status="Printing",
        claimed_by_agent_id=dead_agent.id,
        claim_expires_at=datetime.utcnow() - timedelta(seconds=10),
        claim_generation=1,
        attempt_count=1,
    )

    pending = client.get(
        "/api/print-jobs/pending", headers=_agent_headers(live_token)
    )
    assert pending.status_code == 200
    assert any(j["id"] == job.id for j in pending.json())

    reclaim = client.put(
        f"/api/print-jobs/{job.id}/claim", headers=_agent_headers(live_token)
    )
    assert reclaim.status_code == 200
    db_session.refresh(job)
    assert job.claimed_by_agent_id == live_agent.id
    assert job.claim_generation == 2
    assert job.status == "Printing"


# --- Step 5: minimized public status endpoint --------------------------------

def test_public_status_endpoint_is_minimized(client, db_session):
    station = _make_station(db_session)
    job = _make_job(db_session, station.id, printer_name="SECRET_PRINTER")

    response = client.get(f"/api/print-jobs/{job.id}/status")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "Pending", "station_name": "Front Desk"}
    for forbidden in (
        "printer_name",
        "claimed_by_agent_id",
        "claim_expires_at",
        "claim_generation",
        "error_message",
        "visitor_id",
    ):
        assert forbidden not in body


def test_public_status_endpoint_404_for_unknown_job(client, db_session):
    response = client.get("/api/print-jobs/999999/status")
    assert response.status_code == 404
