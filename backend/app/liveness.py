"""Canonical, timezone-safe liveness determination (M9.2 Batch 1).

Single source of truth for whether a print agent is "online" and what
operational status a print station is in. Every staff-facing surface
(dashboard, station list, agent list, health endpoint) derives its
online/offline/stale state from these functions, so the definition can never
drift between the backend and the frontend and is never recomputed in a browser
against a naive-UTC timestamp.

Timezone safety: agent ``last_seen`` values are written with
``datetime.utcnow()`` (naive UTC). ``_as_utc`` attaches UTC to any naive value
before arithmetic, so age is correct regardless of the server's local zone and
no caller has to guess.
"""

from __future__ import annotations

from datetime import datetime, timezone

# Staff-facing liveness window: an agent counts as online if it reported within
# this many seconds. Deliberately distinct from the recovery guard
# (PRINT_AGENT_STALE_SECONDS = 300 in main.py) so visibility and recovery tuning
# stay decoupled.
AGENT_ONLINE_SECONDS = 60

STATION_STATUS_MAINTENANCE = "maintenance"
STATION_STATUS_ONLINE = "online"
STATION_STATUS_STALE = "stale"
STATION_STATUS_OFFLINE = "offline"


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def agent_age_seconds(
    last_seen: datetime | None, now: datetime | None = None
) -> float | None:
    """Seconds since ``last_seen`` (UTC-aware), or ``None`` if never seen."""
    if last_seen is None:
        return None
    now = now or datetime.now(timezone.utc)
    return (_as_utc(now) - _as_utc(last_seen)).total_seconds()


def agent_is_online(
    last_seen: datetime | None,
    now: datetime | None = None,
    window: int = AGENT_ONLINE_SECONDS,
) -> bool:
    """True iff the agent reported within the liveness window."""
    age = agent_age_seconds(last_seen, now)
    return age is not None and age < window


def station_status(
    *,
    enabled: bool,
    agent_last_seens,
    now: datetime | None = None,
) -> str:
    """Derive a station's operational status from its assigned agents.

    ``agent_last_seens`` is an iterable of ``last_seen`` values for the
    station's ENABLED assigned agents (``None`` allowed for never-seen agents).

    * maintenance - station is disabled.
    * online      - at least one assigned agent is currently live.
    * stale       - no live agent, but at least one assigned agent WAS seen
                    before (it was working and has gone quiet - investigate).
    * offline     - enabled but no assigned agent has ever reported (never
                    connected / unattended), including stations with no agents.
    """
    if not enabled:
        return STATION_STATUS_MAINTENANCE
    seens = list(agent_last_seens)
    if any(agent_is_online(s, now) for s in seens):
        return STATION_STATUS_ONLINE
    if any(s is not None for s in seens):
        return STATION_STATUS_STALE
    return STATION_STATUS_OFFLINE
