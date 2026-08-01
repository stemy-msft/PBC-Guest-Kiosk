"""Environment-driven CORS allowlist resolution (F-008).

The kiosk authenticates with bearer tokens carried in the ``Authorization``
header (see ``frontend/src/api.js``); it never relies on cookies or browser
credentials for cross-origin requests. Credentialed CORS is therefore not
required, which lets us keep the origin allowlist strict without the
spec-forbidden ``*`` + credentials combination.

This module is deliberately pure and dependency-free so the policy can be unit
tested without importing the FastAPI app.
"""

from urllib.parse import urlparse

# Applied only when running in development mode with no explicit configuration.
DEV_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

_ALLOWED_SCHEMES = {"http", "https"}


class CorsConfigurationError(RuntimeError):
    """Raised when the configured CORS policy is missing or malformed."""


def _is_valid_origin(origin: str) -> bool:
    """True only for a bare ``scheme://host[:port]`` origin (no path/query)."""
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    if parsed.scheme not in _ALLOWED_SCHEMES:
        return False
    if not parsed.hostname:
        return False
    if parsed.path or parsed.params or parsed.query or parsed.fragment:
        return False
    try:
        parsed.port  # noqa: B018 - raises ValueError on a malformed port
    except ValueError:
        return False
    return True


def resolve_cors_origins(
    raw_origins: str | None,
    *,
    environment: str,
    allow_credentials: bool,
) -> list[str]:
    """Resolve the effective CORS allowlist from configuration.

    Parses a comma-separated ``raw_origins`` string, trims whitespace, drops
    empties, validates each entry, and applies mode-specific fallbacks:

    * wildcard ``*`` is rejected when credentials are enabled, and cannot be
      combined with explicit origins;
    * malformed origins are rejected;
    * an empty list fails fast in production and yields dev-safe defaults only
      in development.
    """
    environment = (environment or "development").strip().lower()
    origins = [token.strip() for token in (raw_origins or "").split(",")]
    origins = [token for token in origins if token]

    if "*" in origins:
        if allow_credentials:
            raise CorsConfigurationError(
                "Wildcard '*' CORS origin cannot be combined with "
                "credentialed requests."
            )
        if len(origins) > 1:
            raise CorsConfigurationError(
                "Wildcard '*' CORS origin cannot be combined with explicit "
                "origins."
            )
        return ["*"]

    invalid = [origin for origin in origins if not _is_valid_origin(origin)]
    if invalid:
        raise CorsConfigurationError(
            "Invalid CORS origin(s): " + ", ".join(invalid)
        )

    if origins:
        deduped: list[str] = []
        for origin in origins:
            if origin not in deduped:
                deduped.append(origin)
        return deduped

    if environment == "production":
        raise CorsConfigurationError(
            "PBC_CORS_ALLOWED_ORIGINS must be set in production; refusing to "
            "start with an empty or wildcard CORS allowlist."
        )
    return list(DEV_DEFAULT_ORIGINS)
