"""Station operational diagnostics (M9.2 Batch 3).

Pure, unit-testable derivation of *whether a print station needs attention,
why, and what an operator should do about it*. It layers an operator-facing
"attention" model on top of the canonical liveness status from ``liveness.py``
(online / stale / offline / maintenance) by combining that status with the
station's live queue signals (pending / printing / failed / recovering counts
and the oldest pending job's age).

Nothing here touches the database or the clock — the caller passes already
computed counts and ages (themselves derived UTC-safely via ``liveness`` and
``queue_diagnostics``), so this stays trivially testable and can be reused by
the station list endpoint and the dashboard without duplicating logic.

The thresholds are deliberately distinct from the per-job thresholds in
``queue_diagnostics`` so station-level operator signals can be tuned without
disturbing per-job queue diagnostics.
"""

from __future__ import annotations

from .liveness import (
    STATION_STATUS_MAINTENANCE,
    STATION_STATUS_OFFLINE,
    STATION_STATUS_ONLINE,
    STATION_STATUS_STALE,
)

# A station whose oldest pending job has been waiting longer than this is
# treated as an aging queue worth a look even while the station is online.
STATION_QUEUE_AGE_WARN_SECONDS = 300

# This many failed jobs (or more) on one station is escalated from "some
# failures" to a critical "printer is failing" signal.
STATION_FAILED_JOBS_CRITICAL = 3

# This many auto-recovered jobs (or more) on one station suggests an unstable
# agent rather than a one-off blip.
STATION_REPEATED_RECOVERY_COUNT = 2

# Attention levels, ordered by severity (mirrors queue_diagnostics).
ATTENTION_NONE = "none"
ATTENTION_WARN = "warn"
ATTENTION_CRITICAL = "critical"

_LEVEL_RANK = {ATTENTION_NONE: 0, ATTENTION_WARN: 1, ATTENTION_CRITICAL: 2}

# Operator-facing operational states (W1 station attention model).
STATE_HEALTHY = "healthy"
STATE_BUSY = "busy"
STATE_ATTENTION = "attention"
STATE_OFFLINE = "offline"
STATE_MAINTENANCE = "maintenance"


def _escalate(current: str, candidate: str) -> str:
    return candidate if _LEVEL_RANK[candidate] > _LEVEL_RANK[current] else current


def station_diagnostics(
    *,
    status: str,
    pending_jobs: int = 0,
    printing_jobs: int = 0,
    failed_jobs: int = 0,
    recovering_jobs: int = 0,
    jobs_requiring_attention: int = 0,
    oldest_pending_age_seconds: float | None = None,
) -> dict:
    """Derive a station's operator-facing attention state.

    ``status`` is the canonical liveness status
    (``online``/``stale``/``offline``/``maintenance``). The remaining arguments
    are the station's live queue signals.

    Returns a dict with:
      * ``operational_state``  - ``healthy``/``busy``/``attention``/``offline``/
                                 ``maintenance`` (W1 model).
      * ``attention``          - True when an operator should act.
      * ``attention_level``    - ``none``/``warn``/``critical``.
      * ``attention_reasons``  - short, specific explanations (never generic).
      * ``recommended_action`` - the single highest-priority next step (or None).
      * ``summary``            - a one-line human status message.
    """
    pending = pending_jobs or 0
    printing = printing_jobs or 0
    failed = failed_jobs or 0
    recovering = recovering_jobs or 0
    needing = jobs_requiring_attention or 0

    # A disabled station is intentionally out of service; it never raises an
    # operational alarm on its own.
    if status == STATION_STATUS_MAINTENANCE:
        return {
            "operational_state": STATE_MAINTENANCE,
            "attention": False,
            "attention_level": ATTENTION_NONE,
            "attention_reasons": [],
            "recommended_action": "Restore the station to active service when ready.",
            "summary": "In maintenance mode",
        }

    level = ATTENTION_NONE
    reasons: list[str] = []
    # (level_rank, action) candidates; the highest-severity one wins.
    actions: list[tuple[int, str]] = []

    def _add(candidate_level: str, reason: str, action: str) -> None:
        nonlocal level
        level = _escalate(level, candidate_level)
        reasons.append(reason)
        actions.append((_LEVEL_RANK[candidate_level], action))

    # --- Liveness-driven signals ---
    if status == STATION_STATUS_OFFLINE:
        if pending > 0:
            _add(
                ATTENTION_CRITICAL,
                f"Station offline with {pending} pending job(s)",
                "Bring the station's print agent back online, or redirect its "
                "jobs to another station.",
            )
        else:
            _add(
                ATTENTION_WARN,
                "Station offline (no jobs waiting)",
                "Restart the station's print agent when convenient.",
            )
    elif status == STATION_STATUS_STALE:
        if pending > 0:
            _add(
                ATTENTION_CRITICAL,
                f"Agent went quiet with {pending} job(s) waiting",
                "Confirm the print agent is still running; redirect its jobs "
                "if it does not recover.",
            )
        else:
            _add(
                ATTENTION_WARN,
                "Station agent has gone quiet",
                "Check that the station's print agent is still running.",
            )

    # --- Failure accumulation (independent of liveness) ---
    if failed >= STATION_FAILED_JOBS_CRITICAL:
        _add(
            ATTENTION_CRITICAL,
            f"Multiple failed jobs detected ({failed})",
            "Inspect the printer (labels, paper, connection), then retry or "
            "clear the failed jobs.",
        )
    elif failed >= 1:
        _add(
            ATTENTION_WARN,
            f"{failed} failed job(s) on this station",
            "Inspect the printer (labels, paper, connection), then retry or "
            "clear the failed jobs.",
        )

    # --- Aging queue while the station is otherwise live ---
    if (
        status == STATION_STATUS_ONLINE
        and oldest_pending_age_seconds is not None
        and oldest_pending_age_seconds > STATION_QUEUE_AGE_WARN_SECONDS
    ):
        minutes = int(oldest_pending_age_seconds // 60)
        _add(
            ATTENTION_WARN,
            f"Queue aging: oldest job waiting {minutes} min",
            "Check the printer is keeping up; redirect jobs if it stalls.",
        )
    elif status == STATION_STATUS_ONLINE and needing > 0:
        # An online station with flagged jobs but no aged-queue signal (e.g. a
        # stalled print or repeatedly retried job).
        _add(
            ATTENTION_WARN,
            f"{needing} job(s) need attention",
            "Open the print queue to review the flagged jobs on this station.",
        )

    # --- Instability: repeated auto-recoveries ---
    if recovering >= STATION_REPEATED_RECOVERY_COUNT:
        _add(
            ATTENTION_WARN,
            f"Repeated auto-recoveries ({recovering})",
            "The agent may be unstable; investigate the station's power and "
            "network connection.",
        )

    # --- Operational state (W1) ---
    if status == STATION_STATUS_OFFLINE:
        state = STATE_OFFLINE
    elif level != ATTENTION_NONE:
        state = STATE_ATTENTION
    elif pending > 0 or printing > 0:
        state = STATE_BUSY
    else:
        state = STATE_HEALTHY

    if reasons:
        summary = reasons[0]
    elif state == STATE_BUSY:
        summary = f"Busy — {pending} pending, {printing} printing"
    else:
        summary = "Healthy"

    recommended_action = None
    if actions:
        recommended_action = max(actions, key=lambda item: item[0])[1]

    return {
        "operational_state": state,
        "attention": level != ATTENTION_NONE,
        "attention_level": level,
        "attention_reasons": reasons,
        "recommended_action": recommended_action,
        "summary": summary,
    }
