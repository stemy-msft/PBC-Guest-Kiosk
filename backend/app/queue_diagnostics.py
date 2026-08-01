"""Queue operational diagnostics (M9.2 Batch 2).

Pure, timezone-safe, unit-testable derivation of *why* a print job is or is not
making progress. Every signal is computed from columns already stored on
``PrintJob`` (created/claimed times, ``attempt_count``, ``last_recovery_reason``,
``error_message``, ``status``) plus the job's target-station liveness. Nothing
here mutates state, queries the database, or reaches the network, so it is safe
to call per-row while rendering the queue and easy to test in isolation.

The staff-facing thresholds below are deliberately decoupled from the
recovery/lease tuning in ``main.py`` (``PRINT_JOB_LEASE_SECONDS`` etc.) so
operator visibility can be tuned without touching recovery correctness.

Timezone safety: job timestamps are written with ``datetime.utcnow()`` (naive
UTC). ``_as_utc`` attaches UTC to any naive value before arithmetic so ages are
correct regardless of the server's local zone.
"""

from __future__ import annotations

from datetime import datetime, timezone

# A Pending job older than this has been waiting too long for an agent to pick
# it up (nothing has claimed it).
PENDING_STUCK_SECONDS = 120

# A Printing job whose claim is older than this has most likely stalled mid-print
# (the agent normally completes well within the lease window).
PRINTING_STUCK_SECONDS = 180

# A job that has been claimed this many times (or more) and is not Completed has
# been retried and is worth a look.
REPEATED_FAILURE_ATTEMPTS = 2

# Attention levels, ordered by severity.
ATTENTION_NONE = "none"
ATTENTION_WARN = "warn"
ATTENTION_CRITICAL = "critical"

_LEVEL_RANK = {ATTENTION_NONE: 0, ATTENTION_WARN: 1, ATTENTION_CRITICAL: 2}


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def age_seconds(value: datetime | None, now: datetime | None = None) -> float | None:
    """Seconds since ``value`` (UTC-safe), or ``None`` if ``value`` is missing."""
    if value is None:
        return None
    now = now or datetime.now(timezone.utc)
    return (_as_utc(now) - _as_utc(value)).total_seconds()


def _escalate(current: str, candidate: str) -> str:
    return candidate if _LEVEL_RANK[candidate] > _LEVEL_RANK[current] else current


def job_diagnostics(
    *,
    status: str,
    created_time: datetime | None,
    claimed_time: datetime | None = None,
    attempt_count: int | None = 0,
    last_recovery_reason: str | None = None,
    error_message: str | None = None,
    station_online: bool = True,
    now: datetime | None = None,
) -> dict:
    """Derive a job's operational attention state from stored fields.

    Returns a dict with:
      * ``age_seconds``       - job age since ``created_time`` (float or None).
      * ``attention``         - True when the job needs an operator's eyes.
      * ``attention_level``   - ``none`` / ``warn`` / ``critical``.
      * ``attention_reasons`` - short human-readable explanations (may be empty).
    """
    now = now or datetime.now(timezone.utc)
    age = age_seconds(created_time, now)
    attempts = attempt_count or 0

    level = ATTENTION_NONE
    reasons: list[str] = []

    if status == "Failed":
        level = _escalate(level, ATTENTION_CRITICAL)
        if error_message:
            reasons.append(f"Print failed: {error_message}")
        else:
            reasons.append("Print failed")

    if status == "Pending" and not station_online:
        level = _escalate(level, ATTENTION_CRITICAL)
        reasons.append("Assigned to an offline station")

    if status == "Pending" and age is not None and age > PENDING_STUCK_SECONDS:
        level = _escalate(level, ATTENTION_WARN)
        reasons.append(f"Pending {int(age // 60)} min without printing")

    if status == "Printing":
        claim_age = age_seconds(claimed_time, now)
        if claim_age is not None and claim_age > PRINTING_STUCK_SECONDS:
            level = _escalate(level, ATTENTION_WARN)
            reasons.append(f"Printing stalled for {int(claim_age // 60)} min")

    if status != "Completed" and attempts >= REPEATED_FAILURE_ATTEMPTS:
        level = _escalate(level, ATTENTION_WARN)
        reasons.append(f"Retried {attempts} times")

    if status == "Pending" and last_recovery_reason:
        level = _escalate(level, ATTENTION_WARN)
        reasons.append("Auto-recovered and requeued")

    return {
        "age_seconds": age,
        "attention": level != ATTENTION_NONE,
        "attention_level": level,
        "attention_reasons": reasons,
    }
