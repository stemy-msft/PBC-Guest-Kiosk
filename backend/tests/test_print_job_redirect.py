"""R3 — redirect a still-pending print job to a different, enabled station.

Operational need: a guest may open an old URL naming a print station that is
not currently online. Staff must be able to redirect that queued job to a
station that IS online, without deleting and re-creating it.

Contract proven here:

* only ``Pending`` jobs may be redirected (in-flight/terminal are rejected 400);
* the destination station must exist AND be enabled (otherwise 400);
* a successful redirect re-homes the job and clears any stale lease bookkeeping
  while bumping the claim generation so a late prior-lease update cannot apply;
* the endpoint requires an authenticated staff session (401 without a token).

Runs against the in-memory SQLite harness from ``conftest.py``.
"""

from datetime import datetime

from app import auth
from app.models import PrintJob, PrintStation, User, Visitor


TEST_PASSWORD = "Correct-Horse-Battery-9"


def _make_station(db, slug="front-desk", name="Front Desk", enabled=True):
    station = PrintStation(name=name, slug=slug, enabled=enabled)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


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


def _make_job(db, station_id, status="Pending", **kwargs):
    job = PrintJob(
        visitor_id=_make_visitor(db).id,
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


def _staff_token(db, username="teststaff"):
    user = User(
        username=username,
        password_hash=auth.hash_password(TEST_PASSWORD),
        display_name="Test Staff",
        email=None,
        role="Staff",
        enabled=True,
    )
    db.add(user)
    db.commit()
    return auth.create_access_token(username)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_redirect_pending_job_rehomes_and_clears_lease(client, db_session):
    offline = _make_station(db_session, slug="dining-hall", name="Dining Hall")
    online = _make_station(db_session, slug="upper-room", name="Upper Room")
    token = _staff_token(db_session)
    job = _make_job(
        db_session,
        offline.id,
        claimed_by_agent_id=None,
        claim_generation=0,
    )

    response = client.put(
        f"/api/print-jobs/{job.id}/station",
        json={"station_id": online.id},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "Pending"

    db_session.refresh(job)
    assert job.print_station_id == online.id
    assert job.claimed_by_agent_id is None
    assert job.claim_expires_at is None
    assert job.claimed_time is None
    assert job.claim_generation == 1


def test_redirect_requires_authentication_401(client, db_session):
    offline = _make_station(db_session, slug="dining-hall", name="Dining Hall")
    online = _make_station(db_session, slug="upper-room", name="Upper Room")
    job = _make_job(db_session, offline.id)

    response = client.put(
        f"/api/print-jobs/{job.id}/station",
        json={"station_id": online.id},
    )

    assert response.status_code == 401
    db_session.refresh(job)
    assert job.print_station_id == offline.id


def test_redirect_non_pending_job_rejected_400(client, db_session):
    offline = _make_station(db_session, slug="dining-hall", name="Dining Hall")
    online = _make_station(db_session, slug="upper-room", name="Upper Room")
    token = _staff_token(db_session)
    job = _make_job(db_session, offline.id, status="Printing")

    response = client.put(
        f"/api/print-jobs/{job.id}/station",
        json={"station_id": online.id},
        headers=_auth(token),
    )

    assert response.status_code == 400
    db_session.refresh(job)
    assert job.print_station_id == offline.id


def test_redirect_to_disabled_station_rejected_400(client, db_session):
    offline = _make_station(db_session, slug="dining-hall", name="Dining Hall")
    disabled = _make_station(
        db_session, slug="upper-room", name="Upper Room", enabled=False
    )
    token = _staff_token(db_session)
    job = _make_job(db_session, offline.id)

    response = client.put(
        f"/api/print-jobs/{job.id}/station",
        json={"station_id": disabled.id},
        headers=_auth(token),
    )

    assert response.status_code == 400
    db_session.refresh(job)
    assert job.print_station_id == offline.id


def test_redirect_to_nonexistent_station_rejected_400(client, db_session):
    offline = _make_station(db_session, slug="dining-hall", name="Dining Hall")
    token = _staff_token(db_session)
    job = _make_job(db_session, offline.id)

    response = client.put(
        f"/api/print-jobs/{job.id}/station",
        json={"station_id": 999999},
        headers=_auth(token),
    )

    assert response.status_code == 400
    db_session.refresh(job)
    assert job.print_station_id == offline.id


def test_redirect_missing_job_404(client, db_session):
    online = _make_station(db_session, slug="upper-room", name="Upper Room")
    token = _staff_token(db_session)

    response = client.put(
        "/api/print-jobs/424242/station",
        json={"station_id": online.id},
        headers=_auth(token),
    )

    assert response.status_code == 404
