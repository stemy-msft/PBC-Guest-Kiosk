"""Station-routing: the check-in station (kiosk/QR URL) is captured on the
visitor and is the server-authoritative source for where the badge prints.

Chain under test: URL -> visitor.print_station_id -> print job.print_station_id.
A caller-supplied slug is only a fallback for visitors with no persisted
station (e.g. staff-initiated prints); it can never override a visitor's
captured station.
"""

from datetime import datetime

from app.models import PrintJob, PrintStation, Visitor


def _station(db, slug, name=None, enabled=True):
    station = PrintStation(name=name or slug.title(), slug=slug, enabled=enabled)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def _check_in(client, station=None):
    payload = {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "visitor_type": "Guest",
        "purpose": "Visit",
        "host_type": "Staff",
        "host_name": "Someone",
    }
    if station is not None:
        payload["station"] = station
    response = client.post("/api/visitors", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _give_badge(db, visitor_id):
    visitor = db.query(Visitor).filter_by(id=visitor_id).first()
    visitor.badge_path = "/tmp/does-not-exist-badge.png"
    db.commit()


def _job(db, job_id):
    return db.query(PrintJob).filter_by(id=job_id).first()


def test_checkin_persists_station_and_print_derives_from_visitor(client, db_session):
    station = _station(db_session, "dining-hall")
    visitor = _check_in(client, station="dining-hall")
    assert visitor["print_station_id"] == station.id

    _give_badge(db_session, visitor["id"])

    # Even with an empty body station, the job routes via the visitor's station.
    response = client.post(
        f"/api/visitors/{visitor['id']}/print", json={"station": ""}
    )
    assert response.status_code == 200, response.text
    assert _job(db_session, response.json()["id"]).print_station_id == station.id


def test_print_prefers_visitor_station_over_conflicting_body(client, db_session):
    checkin_station = _station(db_session, "dining-hall")
    _station(db_session, "front-desk")
    visitor = _check_in(client, station="dining-hall")

    _give_badge(db_session, visitor["id"])

    # A body slug pointing at a different station must NOT override the
    # station the visitor checked in at.
    response = client.post(
        f"/api/visitors/{visitor['id']}/print", json={"station": "front-desk"}
    )
    assert response.status_code == 200, response.text
    assert _job(db_session, response.json()["id"]).print_station_id == checkin_station.id


def test_print_falls_back_to_body_when_visitor_has_no_station(client, db_session):
    station = _station(db_session, "front-desk")
    visitor = _check_in(client)  # no station captured (e.g. staff-created)
    assert visitor["print_station_id"] is None

    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/print", json={"station": "front-desk"}
    )
    assert response.status_code == 200, response.text
    assert _job(db_session, response.json()["id"]).print_station_id == station.id


def test_print_requires_a_station_somewhere(client, db_session):
    visitor = _check_in(client)  # no station
    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/print", json={"station": ""}
    )
    assert response.status_code == 400


def test_checkin_with_unknown_station_is_not_persisted(client, db_session):
    visitor = _check_in(client, station="does-not-exist")
    assert visitor["print_station_id"] is None


def test_checkin_with_disabled_station_is_not_persisted(client, db_session):
    _station(db_session, "maint", enabled=False)
    visitor = _check_in(client, station="maint")
    assert visitor["print_station_id"] is None


def test_mobile_qr_routes_badge_to_scanned_station(client, db_session):
    # Two locations; the visitor scans the QR at station B on their phone.
    _station(db_session, "dining-hall")
    scanned = _station(db_session, "rv-area")
    visitor = _check_in(client, station="rv-area")
    assert visitor["print_station_id"] == scanned.id

    _give_badge(db_session, visitor["id"])

    response = client.post(
        f"/api/visitors/{visitor['id']}/print", json={"station": "rv-area"}
    )
    assert response.status_code == 200, response.text
    assert _job(db_session, response.json()["id"]).print_station_id == scanned.id
