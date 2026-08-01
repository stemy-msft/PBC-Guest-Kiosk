"""Staff badge-reprint destination routing.

The kiosk check-in print path (POST /api/visitors/{id}/print) is locked: the
station is derived solely from the visitor's captured check-in station and no
caller may supply or override it (see test_station_routing.py).

A staff *reprint* is a distinct, authenticated action. Staff may direct a
reprint to a chosen destination station (for example, to reprint a badge at the
location where the guest actually is). This must:

  * require authentication (it is not an anonymous kiosk path),
  * create a NEW print job at the chosen station (never reassign an existing
    job, and never mutate the visitor's captured check-in station), and
  * fail closed when the chosen station is unknown or disabled, falling back to
    the visitor's check-in station only when no destination is supplied.
"""

from app import auth
from app.models import PrintJob, PrintStation, Visitor


def _staff_headers():
    return {"Authorization": f"Bearer {auth.create_access_token('teststaff')}"}


def _station(db, slug, name=None, enabled=True):
    station = PrintStation(name=name or slug.title(), slug=slug, enabled=enabled)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _check_in(client, station):
    payload = {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "visitor_type": "Guest",
        "purpose": "Visit",
        "host_type": "Staff",
        "host_name": "Someone",
        "station": station,
    }
    return client.post("/api/visitors", json=payload)


def _give_badge(db, visitor_id):
    visitor = db.query(Visitor).filter_by(id=visitor_id).first()
    visitor.badge_path = "/tmp/does-not-exist-badge.png"
    db.commit()


def _job(db, job_id):
    return db.query(PrintJob).filter_by(id=job_id).first()


def test_reprint_requires_authentication(client, db_session, seed_users):
    _station(db_session, "dining-hall")
    visitor = _check_in(client, "dining-hall").json()
    _give_badge(db_session, visitor["id"])

    response = client.post(f"/api/visitors/{visitor['id']}/reprint", json={})
    assert response.status_code in (401, 403)
    assert db_session.query(PrintJob).count() == 0


def test_reprint_honors_chosen_destination_station(client, db_session, seed_users):
    checkin_station = _station(db_session, "dining-hall")
    destination = _station(db_session, "rv-area")
    visitor = _check_in(client, "dining-hall").json()
    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/reprint",
        json={"station_id": destination.id},
        headers=_staff_headers(),
    )
    assert response.status_code == 200, response.text

    job = _job(db_session, response.json()["id"])
    assert job.print_station_id == destination.id
    # The visitor's captured check-in station is never mutated by a reprint.
    refreshed = db_session.query(Visitor).filter_by(id=visitor["id"]).first()
    assert refreshed.print_station_id == checkin_station.id


def test_reprint_without_destination_uses_visitor_station(client, db_session, seed_users):
    checkin_station = _station(db_session, "dining-hall")
    visitor = _check_in(client, "dining-hall").json()
    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/reprint",
        json={"station_id": None},
        headers=_staff_headers(),
    )
    assert response.status_code == 200, response.text
    assert _job(db_session, response.json()["id"]).print_station_id == checkin_station.id


def test_reprint_rejects_unknown_destination(client, db_session, seed_users):
    _station(db_session, "dining-hall")
    visitor = _check_in(client, "dining-hall").json()
    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/reprint",
        json={"station_id": 999999},
        headers=_staff_headers(),
    )
    assert response.status_code == 400
    assert db_session.query(PrintJob).count() == 0


def test_reprint_rejects_disabled_destination(client, db_session, seed_users):
    _station(db_session, "dining-hall")
    disabled = _station(db_session, "maint", enabled=False)
    visitor = _check_in(client, "dining-hall").json()
    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/reprint",
        json={"station_id": disabled.id},
        headers=_staff_headers(),
    )
    assert response.status_code == 400
    assert db_session.query(PrintJob).count() == 0


def test_reprint_creates_new_job_and_leaves_original_untouched(client, db_session, seed_users):
    checkin_station = _station(db_session, "dining-hall")
    destination = _station(db_session, "rv-area")
    visitor = _check_in(client, "dining-hall").json()
    _give_badge(db_session, visitor["id"])

    original = client.post(f"/api/visitors/{visitor['id']}/print")
    assert original.status_code == 200, original.text
    original_id = original.json()["id"]

    reprint = client.post(
        f"/api/visitors/{visitor['id']}/reprint",
        json={"station_id": destination.id},
        headers=_staff_headers(),
    )
    assert reprint.status_code == 200, reprint.text

    # A distinct, additional job was created; the original job is unchanged.
    assert reprint.json()["id"] != original_id
    assert db_session.query(PrintJob).count() == 2
    assert _job(db_session, original_id).print_station_id == checkin_station.id
    assert _job(db_session, reprint.json()["id"]).print_station_id == destination.id
