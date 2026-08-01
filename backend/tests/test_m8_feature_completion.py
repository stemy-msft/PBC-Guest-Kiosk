"""Pre-Milestone-8 feature-completion coverage.

Covers the four M8 target items completed in this pass:

* Audit coverage for the unauthenticated kiosk lifecycle (check-in, badge
  generation, badge print, checkout) so every visitor-facing action lands in
  the audit trail even though no staff user is logged in.
* The emergency active-visitor CSV export (authenticated staff roster for
  evacuation / roll-call).
* Station-deletion safety: a station still referenced by print jobs or visitor
  records cannot be permanently deleted (it must be disabled instead), so we
  never orphan rows or break the FK.

The guest print-status polling experience is a pure frontend addition against
the pre-existing public ``GET /api/print-jobs/{id}/status`` endpoint and is
covered by the frontend suite.
"""

from app import auth
from app.models import PrintJob, PrintStation, Visitor


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


def _staff_headers():
    return {"Authorization": f"Bearer {auth.create_access_token('teststaff')}"}


def _admin_headers():
    return {"Authorization": f"Bearer {auth.create_access_token('testadmin')}"}


# --- Audit coverage for the unauthenticated kiosk lifecycle ------------------


def test_kiosk_lifecycle_writes_audit_events(client, db_session, monkeypatch):
    recorded = []
    monkeypatch.setattr(
        "app.main.audit",
        lambda user, action, details="": recorded.append((user, action)),
    )

    _station(db_session, "dining-hall")

    visitor = _check_in(client, station="dining-hall").json()
    _give_badge(db_session, visitor["id"])
    client.post(f"/api/visitors/{visitor['id']}/print")
    client.put(f"/api/visitors/{visitor['id']}/checkout")

    actions = [action for _, action in recorded]
    assert "CHECK_IN" in actions
    assert "PRINT_BADGE" in actions
    assert "CHECK_OUT" in actions
    # Unauthenticated kiosk actions are attributed to the "kiosk" system actor.
    assert all(
        user == "kiosk"
        for user, action in recorded
        if action in ("CHECK_IN", "PRINT_BADGE", "CHECK_OUT")
    )


# --- Emergency active-visitor CSV export -------------------------------------


def test_active_export_returns_csv_of_on_property_visitors(
    client, db_session, seed_users
):
    _station(db_session, "dining-hall")
    _check_in(client, station="dining-hall")

    resp = client.get("/api/visitors/active/export", headers=_staff_headers())

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers.get("content-disposition", "")
    body = resp.text
    assert "Visitor Name" in body  # header row
    assert "Ada Lovelace" in body  # the active visitor


def test_active_export_excludes_checked_out_visitors(
    client, db_session, seed_users
):
    _station(db_session, "dining-hall")
    visitor = _check_in(client, station="dining-hall").json()
    client.put(f"/api/visitors/{visitor['id']}/checkout")

    resp = client.get("/api/visitors/active/export", headers=_staff_headers())

    assert resp.status_code == 200, resp.text
    assert "Ada Lovelace" not in resp.text


def test_active_export_requires_authentication(client, db_session):
    resp = client.get("/api/visitors/active/export")
    assert resp.status_code in (401, 403)


# --- Station-deletion safety -------------------------------------------------


def test_delete_station_blocked_when_referenced_by_visitor(
    client, db_session, seed_users
):
    station = _station(db_session, "dining-hall")
    _check_in(client, station="dining-hall")  # creates a referencing visitor

    resp = client.delete(
        f"/api/print-stations/{station.id}/permanent",
        headers=_admin_headers(),
    )

    assert resp.status_code == 400, resp.text
    # Station must still exist (deletion was refused, not silently orphaned).
    assert (
        db_session.query(PrintStation).filter_by(id=station.id).first()
        is not None
    )


def test_delete_station_blocked_when_referenced_by_print_job(
    client, db_session, seed_users
):
    station = _station(db_session, "dining-hall")
    visitor = _check_in(client, station="dining-hall").json()
    _give_badge(db_session, visitor["id"])
    client.post(f"/api/visitors/{visitor['id']}/print")

    assert (
        db_session.query(PrintJob)
        .filter_by(print_station_id=station.id)
        .count()
        == 1
    )

    resp = client.delete(
        f"/api/print-stations/{station.id}/permanent",
        headers=_admin_headers(),
    )

    assert resp.status_code == 400, resp.text


def test_delete_unreferenced_station_succeeds(client, db_session, seed_users):
    station = _station(db_session, "unused-kiosk")

    resp = client.delete(
        f"/api/print-stations/{station.id}/permanent",
        headers=_admin_headers(),
    )

    assert resp.status_code == 200, resp.text
    assert (
        db_session.query(PrintStation).filter_by(id=station.id).first() is None
    )
