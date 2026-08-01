"""Authoritative product-version source for the PBC Guest Kiosk backend.

This is the single source of truth for the application (product) version. It is
distinct from dependency/package pins in requirements.txt. FastAPI metadata and
the /health readiness response both read from here so they can never drift.
"""

# SemVer prerelease identifier for the v1.0.0 release-candidate phase (M9).
APP_VERSION = "1.0.0-rc.1"

# Human-facing equivalent for display surfaces (UI footer, operator glance).
APP_VERSION_DISPLAY = "1.0.0 RC1"
