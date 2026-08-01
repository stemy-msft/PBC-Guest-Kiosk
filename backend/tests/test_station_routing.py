"""Station-routing (strict / fail-closed model).

The station is captured from the kiosk/QR URL path at check-in and persisted on
the visitor. It is the SINGLE source of truth for where the badge prints. There
is exactly one path:

    URL path -> visitor.print_station_id -> print job.print_station_id -> agent

There is no query-param routing, no request-body station, and no fallback or
default. If the station cannot be resolved from the URL the request fails closed
(HTTP 400) and no visitor / print job is created.
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
    """POST a check-in; return the raw response so callers assert status."""
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
    return client.post("/api/visitors", json=payload)


def _give_badge(db, visitor_id):
    visitor = db.query(Visitor).filter_by(id=visitor_id).first()
    visitor.badge_path = "/tmp/does-not-exist-badge.png"
    db.commit()


def _job(db, job_id):
    return db.query(PrintJob).filter_by(id=job_id).first()


def test_checkin_persists_station_and_print_derives_from_visitor(client, db_session):
    station = _station(db_session, "dining-hall")
    response = _check_in(client, station="dining-hall")
    assert response.status_code == 200, response.text
    visitor = response.json()
    assert visitor["print_station_id"] == station.id

    _give_badge(db_session, visitor["id"])

    # No body is sent: the job routes solely via the visitor's station.
    printed = client.post(f"/api/visitors/{visitor['id']}/print")
    assert printed.status_code == 200, printed.text
    assert _job(db_session, printed.json()["id"]).print_station_id == station.id


def test_print_uses_visitor_station_and_ignores_client_input(client, db_session):
    checkin_station = _station(db_session, "dining-hall")
    _station(db_session, "front-desk")
    visitor = _check_in(client, station="dining-hall").json()

    _give_badge(db_session, visitor["id"])

    # Even a body attempting to name another station cannot override or supply
    # the station; it is ignored and the visitor's captured station is used.
    printed = client.post(
        f"/api/visitors/{visitor['id']}/print", json={"station": "front-desk"}
    )
    assert printed.status_code == 200, printed.text
    assert (
        _job(db_session, printed.json()["id"]).print_station_id
        == checkin_station.id
    )


def test_checkin_without_station_fails_closed(client, db_session):
    response = _check_in(client)  # no station in URL / payload
    assert response.status_code == 400
    assert db_session.query(Visitor).count() == 0


def test_checkin_with_unknown_station_fails_closed(client, db_session):
    response = _check_in(client, station="does-not-exist")
    assert response.status_code == 400
    assert db_session.query(Visitor).count() == 0


def test_checkin_with_disabled_station_fails_closed(client, db_session):
    _station(db_session, "maint", enabled=False)
    response = _check_in(client, station="maint")
    assert response.status_code == 400
    assert db_session.query(Visitor).count() == 0


def test_print_fails_closed_when_visitor_has_no_station(client, db_session):
    # A visitor with no captured station (e.g. legacy row) can never print.
    visitor = Visitor(
        first_name="Grace",
        last_name="Hopper",
        visitor_type="Guest",
        purpose="Visit",
        host_type="Staff",
        host_name="Someone",
        check_in_time=datetime.now(),
        badge_printed=False,
        badge_path="/tmp/does-not-exist-badge.png",
        print_station_id=None,
    )
    db_session.add(visitor)
    db_session.commit()
    db_session.refresh(visitor)

    response = client.post(f"/api/visitors/{visitor.id}/print")
    assert response.status_code == 400
    assert db_session.query(PrintJob).count() == 0


def test_print_fails_closed_when_station_disabled_after_checkin(client, db_session):
    station = _station(db_session, "dining-hall")
    visitor = _check_in(client, station="dining-hall").json()
    _give_badge(db_session, visitor["id"])

    # Station goes into maintenance after check-in.
    station.enabled = False
    db_session.commit()

    response = client.post(f"/api/visitors/{visitor['id']}/print")
    assert response.status_code == 400
    assert db_session.query(PrintJob).count() == 0


def test_mobile_qr_routes_badge_to_scanned_station(client, db_session):
    # Two locations; the visitor scans the QR at station B on their phone.
    _station(db_session, "dining-hall")
    scanned = _station(db_session, "rv-area")
    visitor = _check_in(client, station="rv-area").json()
    assert visitor["print_station_id"] == scanned.id

    _give_badge(db_session, visitor["id"])

    printed = client.post(f"/api/visitors/{visitor['id']}/print")
    assert printed.status_code == 200, printed.text
    assert _job(db_session, printed.json()["id"]).print_station_id == scanned.id


def test_no_reassign_route_exists(client, db_session):
    # The reassign endpoint was a secondary station-assignment path that set a
    # job's station from a request body, bypassing the URL -> visitor -> job
    # chain. It must not exist: there is exactly one routing path.
    station = _station(db_session, "dining-hall")
    visitor = _check_in(client, station="dining-hall").json()
    _give_badge(db_session, visitor["id"])
    job_id = client.post(f"/api/visitors/{visitor['id']}/print").json()["id"]

    response = client.put(
        f"/api/print-jobs/{job_id}/reassign", json={"station_id": station.id}
    )
    # 404 (no such route) or 405 (method not allowed) — never a success.
    assert response.status_code in (404, 405)
    # The job's station is untouched and still derived from the visitor.
    assert _job(db_session, job_id).print_station_id == station.id
