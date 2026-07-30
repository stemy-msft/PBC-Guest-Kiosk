"""Batch 5B backend regression tests: anonymous check-out locator minimization.

``GET /api/visitors/find`` is the anonymous Visitor Check-Out locator. Its public
response is minimized to exactly ``id``, ``first_name``, ``last_name``,
``visitor_type`` so no PII or file paths reach anonymous callers. These tests
guard that contract while proving the lookup and checkout workflows are
unchanged, and that authenticated staff endpoints still return the full
``VisitorResponse``.
"""

from app import auth
from app.schemas import VisitorCheckoutLocatorResponse, VisitorResponse


# Exactly the fields the kiosk check-out screen reads.
EXPECTED_FIND_FIELDS = {"id", "first_name", "last_name", "visitor_type"}

# Fields that must never appear in the anonymous find response.
FORBIDDEN_FIND_FIELDS = {
    "phone",
    "email",
    "church",
    "purpose",
    "host_type",
    "host_name",
    "vehicle_plate",
    "notes",
    "expected_departure_time",
    "photo_path",
    "badge_path",
    "check_in_time",
    "check_out_time",
    "check_out_method",
    "badge_printed",
    "badge_printed_time",
}


def _valid_token(username: str = "testadmin") -> str:
    return auth.create_access_token(username)


def _create_visitor(client, first_name, last_name, visitor_type="Guest"):
    """Create a visitor via the anonymous kiosk endpoint; return the full body."""
    resp = client.post(
        "/api/visitors",
        json={
            "first_name": first_name,
            "last_name": last_name,
            "visitor_type": visitor_type,
            "church": "Grace Chapel",
            "phone": "555-0101",
            "email": "guest@example.com",
            "purpose": "Visiting",
            "host_type": "Staff",
            "host_name": "Pat Host",
            "vehicle_plate": "ABC123",
            "notes": "sensitive note",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# 1
def test_find_is_anonymously_accessible(client, db_session):
    _create_visitor(client, "Ada", "Lovelace")
    # No Authorization header supplied.
    resp = client.get("/api/visitors/find", params={"last_name": "Lovelace"})
    assert resp.status_code == 200


# 2
def test_find_returns_active_matching_visitors(client, db_session):
    _create_visitor(client, "Ada", "Lovelace")
    _create_visitor(client, "Alan", "Turing")

    resp = client.get("/api/visitors/find", params={"first_name": "Ada"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["first_name"] == "Ada"
    assert results[0]["last_name"] == "Lovelace"


# 3
def test_find_excludes_checked_out_visitors(client, db_session):
    visitor = _create_visitor(client, "Grace", "Hopper")

    # Anonymous checkout, then the visitor must no longer be found.
    checkout = client.put(f"/api/visitors/{visitor['id']}/checkout")
    assert checkout.status_code == 200

    resp = client.get("/api/visitors/find", params={"last_name": "Hopper"})
    assert resp.status_code == 200
    assert resp.json() == []


# 4
def test_find_response_contains_exactly_the_four_fields(client, db_session):
    _create_visitor(client, "Ada", "Lovelace")

    resp = client.get("/api/visitors/find", params={"last_name": "Lovelace"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert set(results[0].keys()) == EXPECTED_FIND_FIELDS


# 5
def test_find_does_not_expose_pii_or_file_path_fields(client, db_session):
    _create_visitor(client, "Ada", "Lovelace")

    resp = client.get("/api/visitors/find", params={"last_name": "Lovelace"})
    assert resp.status_code == 200
    keys = set(resp.json()[0].keys())
    assert keys.isdisjoint(FORBIDDEN_FIND_FIELDS)


# 6
def test_find_id_still_works_with_anonymous_checkout(client, db_session):
    _create_visitor(client, "Katherine", "Johnson")

    found = client.get(
        "/api/visitors/find", params={"last_name": "Johnson"}
    ).json()
    assert len(found) == 1
    visitor_id = found[0]["id"]

    checkout = client.put(f"/api/visitors/{visitor_id}/checkout")
    assert checkout.status_code == 200
    assert checkout.json()["check_out_time"] is not None


# 7
def test_staff_visitor_endpoint_still_returns_full_response(client, seed_users):
    created = _create_visitor(client, "Ada", "Lovelace")

    resp = client.get(
        f"/api/visitors/{created['id']}",
        headers={"Authorization": f"Bearer {_valid_token()}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    # The full staff shape retains PII and file-path fields.
    for field in ("phone", "email", "notes", "host_name", "check_in_time"):
        assert field in body


# 8
def test_locator_schema_is_exactly_the_four_fields():
    assert set(VisitorCheckoutLocatorResponse.model_fields) == EXPECTED_FIND_FIELDS
    # The full staff schema must remain unchanged (still exposes PII fields).
    assert FORBIDDEN_FIND_FIELDS.issubset(set(VisitorResponse.model_fields))
