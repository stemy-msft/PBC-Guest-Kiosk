"""F-008 CORS hardening tests.

Two layers:

* pure unit tests for ``resolve_cors_origins`` (the policy resolver), and
* integration tests that exercise the live middleware through ``TestClient``.

The app is imported by ``conftest`` with no ``PBC_CORS_ALLOWED_ORIGINS`` and the
default ``PBC_ENV`` (development), so the running middleware uses the dev-safe
defaults from ``cors_config.DEV_DEFAULT_ORIGINS``.
"""

import pytest

from app.cors_config import (
    DEV_DEFAULT_ORIGINS,
    CorsConfigurationError,
    resolve_cors_origins,
)


# --------------------------------------------------------------------------- #
# Unit tests: policy resolution
# --------------------------------------------------------------------------- #
def test_configured_origin_is_allowed():
    result = resolve_cors_origins(
        "https://kiosk.pbc.example",
        environment="production",
        allow_credentials=False,
    )
    assert result == ["https://kiosk.pbc.example"]


def test_unconfigured_origin_is_not_present():
    result = resolve_cors_origins(
        "https://kiosk.pbc.example",
        environment="production",
        allow_credentials=False,
    )
    assert "https://admin.pbc.example" not in result


def test_multiple_configured_origins():
    result = resolve_cors_origins(
        "https://kiosk.pbc.example,https://admin.pbc.example",
        environment="production",
        allow_credentials=False,
    )
    assert result == [
        "https://kiosk.pbc.example",
        "https://admin.pbc.example",
    ]


def test_whitespace_is_normalized():
    result = resolve_cors_origins(
        "  https://kiosk.pbc.example ,\thttps://admin.pbc.example  ,, ",
        environment="production",
        allow_credentials=False,
    )
    assert result == [
        "https://kiosk.pbc.example",
        "https://admin.pbc.example",
    ]


def test_duplicate_origins_are_collapsed():
    result = resolve_cors_origins(
        "https://kiosk.pbc.example,https://kiosk.pbc.example",
        environment="production",
        allow_credentials=False,
    )
    assert result == ["https://kiosk.pbc.example"]


def test_wildcard_rejected_when_credentials_enabled():
    with pytest.raises(CorsConfigurationError):
        resolve_cors_origins(
            "*",
            environment="development",
            allow_credentials=True,
        )


def test_wildcard_cannot_combine_with_explicit_origins():
    with pytest.raises(CorsConfigurationError):
        resolve_cors_origins(
            "*,https://kiosk.pbc.example",
            environment="development",
            allow_credentials=False,
        )


def test_wildcard_allowed_without_credentials():
    result = resolve_cors_origins(
        "*",
        environment="development",
        allow_credentials=False,
    )
    assert result == ["*"]


@pytest.mark.parametrize(
    "bad",
    [
        "kiosk.pbc.example",  # no scheme
        "ftp://kiosk.pbc.example",  # unsupported scheme
        "https://kiosk.pbc.example/app",  # path component
        "https://kiosk.pbc.example?x=1",  # query component
        "https://",  # no host
    ],
)
def test_malformed_origin_is_rejected(bad):
    with pytest.raises(CorsConfigurationError):
        resolve_cors_origins(
            bad,
            environment="production",
            allow_credentials=False,
        )


def test_missing_production_config_fails_fast():
    with pytest.raises(CorsConfigurationError):
        resolve_cors_origins(
            None,
            environment="production",
            allow_credentials=False,
        )
    with pytest.raises(CorsConfigurationError):
        resolve_cors_origins(
            "   ",
            environment="production",
            allow_credentials=False,
        )


def test_missing_development_config_uses_safe_defaults():
    result = resolve_cors_origins(
        None,
        environment="development",
        allow_credentials=False,
    )
    assert result == DEV_DEFAULT_ORIGINS
    assert all(origin.startswith("http://") for origin in result)


# --------------------------------------------------------------------------- #
# Integration tests: live middleware behavior
# --------------------------------------------------------------------------- #
ALLOWED_ORIGIN = DEV_DEFAULT_ORIGINS[0]
DISALLOWED_ORIGIN = "https://evil.example.com"


def test_allowed_origin_receives_cors_header(client):
    resp = client.get("/api/settings", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_disallowed_origin_is_not_echoed(client):
    resp = client.get("/api/settings", headers={"Origin": DISALLOWED_ORIGIN})
    # The request itself still succeeds server-side; the browser is what blocks
    # it, because no allow-origin header is returned for a non-allowlisted origin.
    assert "access-control-allow-origin" not in resp.headers


def test_credentials_are_not_advertised(client):
    resp = client.get("/api/settings", headers={"Origin": ALLOWED_ORIGIN})
    assert "access-control-allow-credentials" not in resp.headers


def test_preflight_allows_permitted_method_and_headers(client):
    resp = client.options(
        "/api/settings",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert "PUT" in resp.headers.get("access-control-allow-methods", "")


def test_preflight_from_disallowed_origin_is_not_allowed(client):
    resp = client.options(
        "/api/settings",
        headers={
            "Origin": DISALLOWED_ORIGIN,
            "Access-Control-Request-Method": "PUT",
        },
    )
    assert "access-control-allow-origin" not in resp.headers


def test_same_origin_request_is_unaffected(client):
    # No Origin header => not a CORS request => passes through untouched.
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    assert "access-control-allow-origin" not in resp.headers
