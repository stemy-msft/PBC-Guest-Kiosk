from urllib3 import request
from .auth import (create_access_token, generate_agent_token, get_current_user, hash_agent_verifier, require_admin, require_print_agent, verify_password, hash_password)
from .bootstrap import create_default_admin
from .database import Base, engine, SessionLocal
from .dependencies import get_db
from .liveness import (
    AGENT_ONLINE_SECONDS,
    STATION_STATUS_MAINTENANCE,
    STATION_STATUS_ONLINE,
    STATION_STATUS_STALE,
    agent_is_online,
    station_status,
)
from . import queue_diagnostics
from .models import PrintAgent, PrintAgentCredential, PrintJob, PrintStation, Visitor, User
from .services.badge_service import generate_visitor_badge
from datetime import datetime, timedelta, timezone
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from logging.handlers import RotatingFileHandler
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session
from uuid import uuid4
from .schemas import (
    DashboardStatsResponse,
    LoginRequest,
    LoginResponse,
    PasswordChangeRequest,
    PasswordResetRequest,
    PrintAgentAssign,
    PrintAgentCredentialIssueResponse,
    PrintAgentEnabledUpdate,
    PrintAgentRegister,
    PrintAgentRegisterResponse,
    PrintAgentResponse,
    PrintJobPublicStatusResponse,
    PrintJobResponse,
    PrintJobStationUpdate,
    PrintJobStatusUpdate,
    PrintStationCreate,
    PrintStationHeartbeat,
    PrintStationResponse,
    PrintStationStatsResponse,
    PrintStationUpdate,
    ReportingSummaryResponse,
    ReturningVisitorCheckInRequest,
    ReprintBadgeRequest,
    SettingsResponse,
    SettingsUpdate,
    ThemeCreate,
    ThemeUpdate,
    UserCreate,
    UserResponse,
    UserStatusUpdate,
    UserUpdate,
    VisitorCheckoutLocatorResponse,
    VisitorCreate,
    VisitorResponse,
    VisitorUpdateRequest,
)

import logging
import json
import io
import csv
import os
import re
import shutil
import qrcode


Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Batch 5D - Step 0: inline, idempotent startup migration for print_jobs.
#
# SQLAlchemy's create_all() only CREATES missing tables; it never ALTERs an
# existing table to add new columns. Deployments that already have a
# print_jobs table therefore need the Batch 5D ownership/lease/recovery
# columns added in place. This is a deliberately tiny, dependency-free
# migration (NO Alembic) that:
#   * inspects the live schema with PRAGMA table_info(print_jobs),
#   * adds only the columns that are missing (safe to run repeatedly),
#   * never drops or rewrites data.
#
# Equivalent raw SQL for manual execution (run each only if the column is
# absent; SQLite has no "ADD COLUMN IF NOT EXISTS"):
#
#   ALTER TABLE print_jobs ADD COLUMN claimed_by_agent_id INTEGER;
#   ALTER TABLE print_jobs ADD COLUMN claim_expires_at DATETIME;
#   ALTER TABLE print_jobs ADD COLUMN claim_generation INTEGER NOT NULL DEFAULT 0;
#   ALTER TABLE print_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
#   ALTER TABLE print_jobs ADD COLUMN last_recovery_reason VARCHAR;
# ---------------------------------------------------------------------------

_PRINT_JOBS_MIGRATION_COLUMNS = (
    ("claimed_by_agent_id", "INTEGER"),
    ("claim_expires_at", "DATETIME"),
    ("claim_generation", "INTEGER NOT NULL DEFAULT 0"),
    ("attempt_count", "INTEGER NOT NULL DEFAULT 0"),
    ("last_recovery_reason", "VARCHAR"),
)


def _apply_print_jobs_ownership_migration(bind) -> list[str]:
    """Add any missing Batch 5D print_jobs columns. Returns applied column names."""
    applied: list[str] = []
    with bind.begin() as conn:
        existing = {
            row[1]  # PRAGMA table_info: (cid, name, type, notnull, dflt, pk)
            for row in conn.exec_driver_sql(
                "PRAGMA table_info(print_jobs)"
            ).fetchall()
        }

        # If the table does not exist yet (fresh DB before create_all created
        # it), PRAGMA returns no rows and create_all already built the full
        # schema from the model, so there is nothing to backfill.
        if not existing:
            return applied

        for column_name, column_def in _PRINT_JOBS_MIGRATION_COLUMNS:
            if column_name in existing:
                continue
            conn.exec_driver_sql(
                f"ALTER TABLE print_jobs ADD COLUMN {column_name} {column_def}"
            )
            applied.append(column_name)

    return applied


_migrated_columns = _apply_print_jobs_ownership_migration(engine)
if _migrated_columns:
    logging.getLogger("guest-kiosk").warning(
        "Batch 5D migration added print_jobs columns: %s",
        ", ".join(_migrated_columns),
    )


# ---------------------------------------------------------------------------
# Station-routing: capture the check-in station on the visitor so the print
# station is derived server-side from the visitor record (resilient routing),
# instead of being re-supplied by the client on every print. Same tiny,
# idempotent, Alembic-free ALTER pattern as above.
#
#   ALTER TABLE visitors ADD COLUMN print_station_id INTEGER;
# ---------------------------------------------------------------------------

def _apply_visitors_station_migration(bind) -> list[str]:
    """Add the missing visitors.print_station_id column. Returns applied names."""
    applied: list[str] = []
    with bind.begin() as conn:
        existing = {
            row[1]
            for row in conn.exec_driver_sql(
                "PRAGMA table_info(visitors)"
            ).fetchall()
        }
        if not existing:
            return applied
        if "print_station_id" not in existing:
            conn.exec_driver_sql(
                "ALTER TABLE visitors ADD COLUMN print_station_id INTEGER"
            )
            applied.append("print_station_id")
    return applied


_migrated_visitor_columns = _apply_visitors_station_migration(engine)
if _migrated_visitor_columns:
    logging.getLogger("guest-kiosk").warning(
        "Station-routing migration added visitors columns: %s",
        ", ".join(_migrated_visitor_columns),
    )


with Session(engine) as db:
    create_default_admin(db)

app = FastAPI(
    title="PBC Visitor Kiosk",
    version="0.7",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


BASE_DIR = Path(__file__).resolve().parent.parent

# LOG_DIR = BASE_DIR / "logs"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# UPLOAD_DIR = Path("uploads")
UPLOAD_DIR = BASE_DIR / "uploads"
PHOTO_DIR = UPLOAD_DIR / "photos"
BADGE_DIR = UPLOAD_DIR / "badges"
QR_DIR = UPLOAD_DIR / "qr-codes"
LOGO_DIR = UPLOAD_DIR / "theme-logos"

PHOTO_DIR.mkdir(parents=True, exist_ok=True)
BADGE_DIR.mkdir(parents=True, exist_ok=True)
QR_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# App logging configuration
app_logger = logging.getLogger("guest-kiosk")
app_logger.setLevel(logging.WARNING)
app_handler = RotatingFileHandler(
    LOG_DIR / "guest-kiosk.log",
    maxBytes=10 * 1024 * 1024,  # 10 MB
    backupCount=5,
    encoding="utf-8",
)
app_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s"
    )
)
app_logger.addHandler(app_handler)


# Audit logging configuration
audit_logger = logging.getLogger("audit")
audit_logger.setLevel(logging.INFO)
audit_handler = RotatingFileHandler(
    LOG_DIR / "audit.log",
    maxBytes=5 * 1024 * 1024,  # 5 MB
    backupCount=10,
    encoding="utf-8",
)
audit_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s"
    )
)
audit_logger.addHandler(audit_handler)


print("REGISTERING SETTINGS ENDPOINTS")
# system_settings.json is used to store system-wide settings that are not stored in the database.
CONFIG_DIR = BASE_DIR / "config"
SETTINGS_FILE = CONFIG_DIR / "system_settings.json"
SETTINGS_TEMPLATE_FILE = CONFIG_DIR / "system_settings.template.json"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

# Seed the git-ignored live settings file from the tracked template on first run.
_settings_seeded = False
if not SETTINGS_FILE.exists() and SETTINGS_TEMPLATE_FILE.exists():
    shutil.copyfile(SETTINGS_TEMPLATE_FILE, SETTINGS_FILE)
    _settings_seeded = True

print(settings_file := SETTINGS_FILE)

audit_logger.info("=" * 60)
audit_logger.info("PBC Guest Kiosk starting")
audit_logger.info(f"Base directory: {BASE_DIR}")
audit_logger.info(f"Config directory: {CONFIG_DIR}")
audit_logger.info(f"Settings file: {SETTINGS_FILE}")
audit_logger.info("=" * 60)

if _settings_seeded:
    audit_logger.info(
        f"Settings file seeded from template {SETTINGS_TEMPLATE_FILE.name}"
    )

audit_logger.info(
    f"Settings initialized. "
    f"Directory={CONFIG_DIR} "
    f"File={SETTINGS_FILE} "
    f"Exists={SETTINGS_FILE.exists()}"
)

audit_logger.info(
    f"Settings initialized. Config directory={CONFIG_DIR} Settings file={SETTINGS_FILE}"
)

VALID_PRINT_JOB_STATUSES = {
    "Pending",
    "Printing",
    "Completed",
    "Failed",
}

# Batch 5D ownership/recovery tuning (see remediation plan §20.5 / §21.7).
#   * A claim leases a job for PRINT_JOB_LEASE_SECONDS. The agent prints
#     synchronously well within this window (agent print timeout is ~60s).
#   * last_seen must be stale by PRINT_AGENT_STALE_SECONDS as a corroborating
#     liveness guard before an expired lease is recovered - this avoids
#     reclaiming a job from an agent that is merely mid-print.
#   * A job is retried at most PRINT_JOB_MAX_ATTEMPTS times before it is failed.
PRINT_JOB_LEASE_SECONDS = 120
PRINT_AGENT_STALE_SECONDS = 300
PRINT_JOB_MAX_ATTEMPTS = 3

# Statuses considered "in flight" (owned by an agent) and thus eligible for
# lease-expiry recovery. "Claimed" is reserved for a future explicit
# claimed->printing split (Batch 5E); today a claim moves straight to
# "Printing" to preserve existing dashboard/stat semantics.
IN_FLIGHT_PRINT_STATUSES = ("Printing",)

# Defs

def audit(
    user: str,
    action: str,
    details: str = "",
):
    audit_logger.info(
        f"User='{user}' Action='{action}' Details='{details}'"
    )


def recover_stale_print_jobs(
    db: Session,
    *,
    station_id: int | None = None,
    job_id: int | None = None,
) -> int:
    """Request-driven recovery of jobs whose owning agent has gone away.

    A job is recovered only when BOTH its lease has expired AND its owning
    agent's last_seen is stale (or the agent is gone). Recovered jobs are
    requeued to Pending - or Failed once the retry cap is reached - and their
    claim_generation is bumped so any late status update from the dead lease is
    rejected as stale. Returns the number of jobs acted upon.

    This is intentionally conservative: the exclusive, race-free part of the
    workflow is the atomic claim; recovery merely releases abandoned leases so
    a fresh atomic claim can succeed.
    """
    now = datetime.utcnow()

    query = db.query(PrintJob).filter(
        PrintJob.status.in_(IN_FLIGHT_PRINT_STATUSES),
        PrintJob.claim_expires_at.isnot(None),
        PrintJob.claim_expires_at < now,
    )

    if station_id is not None:
        query = query.filter(PrintJob.print_station_id == station_id)

    if job_id is not None:
        query = query.filter(PrintJob.id == job_id)

    recovered = 0

    for job in query.all():
        owning_agent = None
        if job.claimed_by_agent_id is not None:
            owning_agent = (
                db.query(PrintAgent)
                .filter(PrintAgent.id == job.claimed_by_agent_id)
                .first()
            )

        agent_is_stale = (
            owning_agent is None
            or owning_agent.last_seen is None
            or (now - owning_agent.last_seen).total_seconds()
            > PRINT_AGENT_STALE_SECONDS
        )

        if not agent_is_stale:
            # Lease expired but the agent is still alive and heartbeating -
            # most likely a slow print. Leave it to complete on its own.
            continue

        attempts = job.attempt_count or 0
        job.claim_generation = (job.claim_generation or 0) + 1
        job.claimed_by_agent_id = None
        job.claim_expires_at = None

        if attempts >= PRINT_JOB_MAX_ATTEMPTS:
            job.status = "Failed"
            job.last_recovery_reason = (
                f"Retry cap reached after {attempts} attempt(s); "
                "owning agent unresponsive"
            )
            job.error_message = (
                job.error_message
                or "Print agent became unresponsive; retry limit reached"
            )
        else:
            job.status = "Pending"
            job.printer_name = None
            job.claimed_time = None
            job.last_recovery_reason = (
                f"Lease expired and agent unresponsive after "
                f"{attempts} attempt(s); requeued"
            )

        audit(
            "print-recovery",
            "RECOVER_PRINT_JOB",
            f"JobID={job.id}, NewStatus={job.status}, "
            f"Attempts={attempts}, Generation={job.claim_generation}",
        )
        recovered += 1

    if recovered:
        db.commit()

    return recovered


def build_station_checkin_url(station: PrintStation) -> str:
    settings = load_system_settings()

    base_url = settings.get("base_checkin_url", "").strip()

    if not base_url:
        raise HTTPException(
            status_code=400,
            detail="Base check-in URL is not configured.",
        )

    base_url = base_url.rstrip("/")

    # Station context lives in the URL path only (never a query param), so the
    # kiosk/QR URL is the single source of truth the SPA reads.
    return f"{base_url}/{station.slug}"

def find_font():
    candidates = [
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",

        # Windows
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",

        # macOS
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]

    for candidate in candidates:
        if Path(candidate).exists():
            print(f"Using font: {candidate}")
            return candidate

    raise RuntimeError("No TrueType font found on this system.")

def generate_print_agent_test_label(
    agent: PrintAgent,
    station: PrintStation,
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    width = 696
    height = 800

    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    font_path = find_font() 

    title_font = ImageFont.truetype(font_path, 44)
    header_font = ImageFont.truetype(font_path, 32)
    body_font = ImageFont.truetype(font_path, 30)

    print("SUCCESS: TrueType fonts loaded")


    draw.rectangle(
        (8, 8, width - 9, height - 9),
        outline="black",
        width=4,
    )

    draw.rectangle(
        (0, 0, width, 95),
        fill="black",
    )

    draw.text(
        (width // 2, 50),
        "KIOSK PRINT TEST",
        fill="white",
        font=title_font,
        anchor="mm",
    )

    y = 120

    rows = [
        ("Station", station.name),
        ("Station Slug", station.slug),
        ("Agent Hostname", agent.hostname),
        ("Printer", agent.printer_name or "Unknown"),
        ("Agent Version", agent.agent_version or "Unknown"),
        ("Agent IP", agent.last_ip or "Unknown"),
        ("Generated", datetime.now().strftime("%b %d, %Y %I:%M %p")),
    ]

    for label, value in rows:
        draw.text(
            (40, y),
            f"{label}:",
            fill="black",
            font=header_font,
        )

        draw.text(
            (40, y + 38),
            str(value),
            fill="black",
            font=body_font,
        )

        y += 95

    image.save(output_path, format="PNG")
    return output_path

def generate_print_station_qr_label(
    station: PrintStation,
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    checkin_url = build_station_checkin_url(station)

    width = 696
    height = 800

    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)

    font_path = find_font()

    title_font = ImageFont.truetype(font_path, 44)
    station_font = ImageFont.truetype(font_path, 38)
    body_font = ImageFont.truetype(font_path, 26)
    small_font = ImageFont.truetype(font_path, 22)

    draw.rectangle(
        (8, 8, width - 9, height - 9),
        outline="black",
        width=4,
    )

    draw.rectangle(
        (0, 0, width, 95),
        fill="black",
    )

    draw.text(
        (width // 2, 50),
        "VISITOR CHECK-IN",
        fill="white",
        font=title_font,
        anchor="mm",
    )

    draw.text(
        (width // 2, 135),
        station.name,
        fill="black",
        font=station_font,
        anchor="mm",
    )

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )

    qr.add_data(checkin_url)
    qr.make(fit=True)

    qr_image = qr.make_image(
        fill_color="black",
        back_color="white",
    ).convert("RGB")

    qr_image = qr_image.resize((460, 460))

    qr_x = (width - 460) // 2
    qr_y = 175

    image.paste(qr_image, (qr_x, qr_y))

    draw.text(
        (width // 2, 675),
        "Scan to check in at this station",
        fill="black",
        font=body_font,
        anchor="mm",
    )

    draw.text(
        (width // 2, 715),
        f"Station: {station.slug}",
        fill="black",
        font=small_font,
        anchor="mm",
    )

    draw.text(
        (width // 2, 750),
        checkin_url,
        fill="black",
        font=small_font,
        anchor="mm",
    )

    image.save(output_path, format="PNG")

    return output_path

def get_or_create_system_qr_visitor(db: Session) -> Visitor:
    system_visitor = (
        db.query(Visitor)
        .filter(
            Visitor.first_name == "System",
            Visitor.last_name == "QR Label",
            Visitor.visitor_type == "System",
        )
        .first()
    )
    if system_visitor is not None:
        return system_visitor
    system_visitor = Visitor(
        first_name="System",
        last_name="QR Label",
        visitor_type="System",
        phone=None,
        email=None,
        church=None,
        purpose="Print Station QR",
        host_type="System",
        host_name="Print Station QR",
        vehicle_plate=None,
        notes="Internal system visitor used for print station QR code labels.",
        expected_departure_time=None,
        photo_path=None,
        badge_path=None,
        check_in_time=datetime.now(),
        check_out_time=datetime.now(),
        check_out_method="System",
        badge_printed=False,
        badge_printed_time=None,
    )
    db.add(system_visitor)
    db.commit()
    db.refresh(system_visitor)
    return system_visitor

def get_or_create_system_test_visitor(db: Session) -> Visitor:
    system_visitor = (
        db.query(Visitor)
        .filter(
            Visitor.first_name == "System",
            Visitor.last_name == "Printer Test",
            Visitor.visitor_type == "System",
        )
        .first()
    )

    if system_visitor is not None:
        return system_visitor

    system_visitor = Visitor(
        first_name="System",
        last_name="Printer Test",
        visitor_type="System",
        phone=None,
        email=None,
        church=None,
        purpose="Print Agent Test",
        host_type="System",
        host_name="Print Agent Test",
        vehicle_plate=None,
        notes="Internal system visitor used for print agent test labels.",
        expected_departure_time=None,
        photo_path=None,
        badge_path=None,
        check_in_time=datetime.now(),
        check_out_time=datetime.now(),
        check_out_method="System",
        badge_printed=False,
        badge_printed_time=None,
    )

    db.add(system_visitor)
    db.commit()
    db.refresh(system_visitor)

    return system_visitor

def load_system_settings() -> dict:
    if not SETTINGS_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="Settings file not found",
        )

    with open(SETTINGS_FILE, "r", encoding="utf-8") as file:
        return json.load(file)





# API Endpoints

@app.get("/")
def root():
    return {
        "application": "PBC Visitor Kiosk",
        "version": "1.0",
    }

@app.get("/api/dashboard",response_model=DashboardStatsResponse,)
def get_dashboard_stats(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today = datetime.now().date()
    active_visitors = (
        db.query(Visitor)
        .filter(Visitor.check_out_time.is_(None))
        .count()
    )
    checked_in_today = (
        db.query(Visitor)
        .filter(
            func.date(Visitor.check_in_time) == today
        )
        .count()
    )

    # Agent liveness (canonical): an agent is online only if it reported within
    # the staleness window. This replaces the previous last_seen-not-null test,
    # which reported a station online forever after an agent's first
    # registration even if that agent had since died.
    agents = db.query(PrintAgent).all()
    online_agents = sum(
        1 for a in agents if a.enabled and agent_is_online(a.last_seen, now)
    )
    total_agents = len(agents)
    offline_agents = total_agents - online_agents

    # Enabled agents' last_seen grouped by station, for station status.
    seens_by_station: dict[int, list] = {}
    for a in agents:
        if a.print_station_id is not None and a.enabled:
            seens_by_station.setdefault(a.print_station_id, []).append(a.last_seen)

    online_stations = offline_stations = stale_stations = maintenance_stations = 0
    station_status_by_id: dict[int, str] = {}
    for station in db.query(PrintStation).all():
        status = station_status(
            enabled=bool(station.enabled),
            agent_last_seens=seens_by_station.get(station.id, []),
            now=now,
        )
        station_status_by_id[station.id] = status
        if status == STATION_STATUS_MAINTENANCE:
            maintenance_stations += 1
        elif status == STATION_STATUS_ONLINE:
            online_stations += 1
        elif status == STATION_STATUS_STALE:
            stale_stations += 1
        else:
            offline_stations += 1

    stations_with_pending_jobs = (
        db.query(PrintJob.print_station_id)
        .filter(PrintJob.status == "Pending")
        .distinct()
        .count()
    )
    stations_with_failed_jobs = (
        db.query(PrintJob.print_station_id)
        .filter(PrintJob.status == "Failed")
        .distinct()
        .count()
    )
    pending_jobs = (
        db.query(PrintJob)
        .filter(PrintJob.status == "Pending")
        .count()
    )
    failed_jobs = (
        db.query(PrintJob)
        .filter(PrintJob.status == "Failed")
        .count()
    )

    # M9.2 Batch 2 queue visibility metrics. Computed over the jobs that can
    # still need operator action (not Completed) so the dashboard answers
    # "should I walk over there now" without reading logs.
    recovering_jobs = (
        db.query(PrintJob)
        .filter(
            PrintJob.status == "Pending",
            PrintJob.last_recovery_reason.isnot(None),
        )
        .count()
    )

    oldest_pending_created = (
        db.query(func.min(PrintJob.created_time))
        .filter(PrintJob.status == "Pending")
        .scalar()
    )
    oldest_pending_age_seconds = queue_diagnostics.age_seconds(
        oldest_pending_created, now
    )

    jobs_requiring_attention = 0
    open_jobs = (
        db.query(PrintJob)
        .filter(PrintJob.status != "Completed")
        .all()
    )
    for job in open_jobs:
        station_online = (
            station_status_by_id.get(job.print_station_id)
            == STATION_STATUS_ONLINE
        )
        diagnostics = queue_diagnostics.job_diagnostics(
            status=job.status,
            created_time=job.created_time,
            claimed_time=job.claimed_time,
            attempt_count=job.attempt_count,
            last_recovery_reason=job.last_recovery_reason,
            error_message=job.error_message,
            station_online=station_online,
            now=now,
        )
        if diagnostics["attention"]:
            jobs_requiring_attention += 1

    return DashboardStatsResponse(
        active_visitors=active_visitors,
        checked_in_today=checked_in_today,
        online_stations=online_stations,
        offline_stations=offline_stations,
        maintenance_stations=maintenance_stations,
        pending_jobs=pending_jobs,
        failed_jobs=failed_jobs,
        online_agents=online_agents,
        offline_agents=offline_agents,
        total_agents=total_agents,
        stale_stations=stale_stations,
        stations_with_pending_jobs=stations_with_pending_jobs,
        stations_with_failed_jobs=stations_with_failed_jobs,
        oldest_pending_age_seconds=oldest_pending_age_seconds,
        jobs_requiring_attention=jobs_requiring_attention,
        recovering_jobs=recovering_jobs,
    )

@app.get("/api/settings",response_model=SettingsResponse,)
def get_settings():
    if not SETTINGS_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="Settings file not found",
        )
    with open(
        SETTINGS_FILE,
        "r",
        encoding="utf-8",
    ) as f:
        return json.load(f)

@app.put("/api/settings",response_model=SettingsResponse,)
def update_settings(request: SettingsUpdate,current_user: str = Depends(get_current_user),_admin: User = Depends(require_admin),):
    old_settings = json.load(open(SETTINGS_FILE, "r", encoding="utf-8"))
    new_settings = request.model_dump()

    audit(
        current_user,
        "UPDATE_SETTINGS",
        f"Theme={request.theme}, AutoRefresh={request.auto_refresh_seconds}",
    )

    with open(
        SETTINGS_FILE,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            new_settings,
            f,
            indent=2,
        )

    return new_settings

# Admin-authored themes live alongside the shipped themes in the frontend. The
# eight built-in themes are defined in the frontend bundle and are read-only;
# only user-created themes are persisted here and merged in at runtime.
USER_THEMES_FILE = CONFIG_DIR / "user_themes.json"

BUILTIN_THEME_NAMES = {
    "defaultLight",
    "defaultDark",
    "campGreen",
    "lakeBlue",
    "darkCampfire",
    "retroTerminal",
    "amberTerminal",
    "clemsonTigers",
}

REQUIRED_THEME_KEYS = {
    "background",
    "placeholderBackground",
    "surface",
    "surfaceSecondary",
    "textPrimary",
    "textSecondary",
    "primary",
    "primaryText",
    "success",
    "successText",
    "label",
    "neutral",
    "neutralText",
    "buttonColor",
    "buttonText",
    "border",
    "fontFamily",
    "danger",
    "dangerText",
}
ALLOWED_THEME_KEYS = REQUIRED_THEME_KEYS | {"logoOverlay", "crt"}

# Logo overlays may only reference bundled assets or uploaded logos, never
# arbitrary/external URLs (prevents offline breakage and beaconing).
LOGO_OVERLAY_PATTERN = re.compile(
    r"^/(themes|uploads/theme-logos)/[A-Za-z0-9_\-./]+\.(png|webp|jpe?g)$",
    re.IGNORECASE,
)

MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_LOGO_DIM = 512  # px (longest edge after downscale)


def load_user_themes() -> dict:
    if not USER_THEMES_FILE.exists():
        return {}
    with open(USER_THEMES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_user_themes(themes: dict) -> None:
    with open(USER_THEMES_FILE, "w", encoding="utf-8") as f:
        json.dump(themes, f, indent=2)


def _validate_theme_id(theme_id: str) -> str:
    cleaned = theme_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9 _-]{1,40}", cleaned):
        raise HTTPException(
            status_code=400,
            detail="Theme name must be 1-40 characters using letters, numbers, spaces, hyphens, or underscores.",
        )
    return cleaned


def _validate_theme_tokens(tokens: dict) -> dict:
    missing = REQUIRED_THEME_KEYS - tokens.keys()
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Theme is missing required values: {', '.join(sorted(missing))}.",
        )
    extra = tokens.keys() - ALLOWED_THEME_KEYS
    if extra:
        raise HTTPException(
            status_code=400,
            detail=f"Theme has unsupported values: {', '.join(sorted(extra))}.",
        )
    cleaned = {}
    for key, value in tokens.items():
        if key == "crt":
            cleaned[key] = value is True or str(value).lower() == "true"
        elif key == "logoOverlay":
            text_value = str(value).strip()
            if text_value and not LOGO_OVERLAY_PATTERN.fullmatch(text_value):
                raise HTTPException(
                    status_code=400,
                    detail="Logo overlay must be a local image path under /themes/ or /uploads/theme-logos/.",
                )
            cleaned[key] = text_value
        else:
            cleaned[key] = str(value)
    return cleaned


@app.get("/api/themes")
def get_themes():
    return load_user_themes()


@app.post("/api/themes")
def create_theme(
    request: ThemeCreate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
):
    theme_id = _validate_theme_id(request.id)
    if theme_id in BUILTIN_THEME_NAMES:
        raise HTTPException(
            status_code=409,
            detail="That name matches a built-in theme. Please choose a different name.",
        )
    themes = load_user_themes()
    if theme_id in themes:
        raise HTTPException(
            status_code=409,
            detail="A theme with that name already exists.",
        )
    themes[theme_id] = _validate_theme_tokens(request.tokens)
    save_user_themes(themes)
    audit(current_user, "CREATE_THEME", f"Theme={theme_id}")
    return {theme_id: themes[theme_id]}


@app.put("/api/themes/{theme_id}")
def update_theme(
    theme_id: str,
    request: ThemeUpdate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
):
    if theme_id in BUILTIN_THEME_NAMES:
        raise HTTPException(
            status_code=403,
            detail="Built-in themes cannot be modified. Create a copy to customize it.",
        )
    themes = load_user_themes()
    if theme_id not in themes:
        raise HTTPException(status_code=404, detail="Theme not found.")
    themes[theme_id] = _validate_theme_tokens(request.tokens)
    save_user_themes(themes)
    audit(current_user, "UPDATE_THEME", f"Theme={theme_id}")
    return {theme_id: themes[theme_id]}


@app.delete("/api/themes/{theme_id}")
def delete_theme(
    theme_id: str,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
):
    if theme_id in BUILTIN_THEME_NAMES:
        raise HTTPException(
            status_code=403,
            detail="Built-in themes cannot be deleted.",
        )
    themes = load_user_themes()
    if theme_id not in themes:
        raise HTTPException(status_code=404, detail="Theme not found.")
    del themes[theme_id]
    save_user_themes(themes)
    audit(current_user, "DELETE_THEME", f"Theme={theme_id}")
    return {"status": "deleted", "id": theme_id}


def _logo_filename(theme_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", theme_id) + ".png"


@app.post("/api/themes/{theme_id}/logo")
def upload_theme_logo(
    theme_id: str,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
):
    if theme_id in BUILTIN_THEME_NAMES:
        raise HTTPException(
            status_code=403,
            detail="Built-in themes cannot be modified. Create a copy to customize it.",
        )
    themes = load_user_themes()
    if theme_id not in themes:
        raise HTTPException(status_code=404, detail="Theme not found.")

    # Enforce size cap before decoding (reject if larger than the limit).
    data = file.file.read(MAX_LOGO_BYTES + 1)
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Logo must be {MAX_LOGO_BYTES // (1024 * 1024)} MB or smaller.",
        )
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    # Decode through Pillow; this rejects SVG/non-raster and mangled files, and
    # guards against decompression bombs via Pillow's pixel limit.
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Unsupported or invalid image. Use a PNG, JPEG, or WebP file.",
        )

    # Re-encode to PNG (drops any embedded payload/metadata, keeps transparency).
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGBA")
    image.thumbnail((MAX_LOGO_DIM, MAX_LOGO_DIM))

    filename = _logo_filename(theme_id)
    image.save(LOGO_DIR / filename, format="PNG")

    overlay_path = f"/uploads/theme-logos/{filename}"
    tokens = dict(themes[theme_id])
    tokens["logoOverlay"] = overlay_path
    themes[theme_id] = _validate_theme_tokens(tokens)
    save_user_themes(themes)
    audit(current_user, "UPLOAD_THEME_LOGO", f"Theme={theme_id}")
    return {theme_id: themes[theme_id]}


@app.delete("/api/themes/{theme_id}/logo")
def delete_theme_logo(
    theme_id: str,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
):
    if theme_id in BUILTIN_THEME_NAMES:
        raise HTTPException(
            status_code=403,
            detail="Built-in themes cannot be modified.",
        )
    themes = load_user_themes()
    if theme_id not in themes:
        raise HTTPException(status_code=404, detail="Theme not found.")

    logo_file = LOGO_DIR / _logo_filename(theme_id)
    if logo_file.exists():
        logo_file.unlink()

    tokens = dict(themes[theme_id])
    tokens["logoOverlay"] = ""
    themes[theme_id] = _validate_theme_tokens(tokens)
    save_user_themes(themes)
    audit(current_user, "DELETE_THEME_LOGO", f"Theme={theme_id}")
    return {theme_id: themes[theme_id]}

@app.get("/health/live")
def health_live():
    """Liveness probe: the process is up and serving. Deliberately cheap and
    dependency-free - it never touches the database or filesystem."""
    return {"status": "alive"}


def _health_check_database() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:  # pragma: no cover - exercised via monkeypatch
        return False, str(exc)


def _health_check_directories() -> tuple[bool, list[str]]:
    problems: list[str] = []
    for label, directory in (
        ("photos", PHOTO_DIR),
        ("badges", BADGE_DIR),
        ("qr-codes", QR_DIR),
        ("theme-logos", LOGO_DIR),
        ("config", CONFIG_DIR),
    ):
        if not directory.exists() or not directory.is_dir():
            problems.append(f"{label}: missing")
        elif not os.access(directory, os.W_OK):
            problems.append(f"{label}: not writable")
    return (not problems), problems


def _health_check_configuration() -> tuple[bool, str | None]:
    if not SETTINGS_FILE.exists():
        return False, "system_settings.json is missing"
    try:
        json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return False, f"system_settings.json is unreadable/invalid: {exc}"
    return True, None


def _health_check_backup_subsystem() -> tuple[bool, str | None]:
    """Confirm the backup tool is importable and its destination is writable.

    Read-only validation - it never creates a backup or mutates any file, so it
    does not touch M9.1 backup behaviour.
    """
    try:
        from .backup import DEFAULT_BACKUP_ROOT

        destination = DEFAULT_BACKUP_ROOT if DEFAULT_BACKUP_ROOT.exists() else DEFAULT_BACKUP_ROOT.parent
        if not destination.exists() or not os.access(destination, os.W_OK):
            return False, f"backup destination not writable: {destination}"
        return True, None
    except Exception as exc:
        return False, str(exc)


@app.get("/health")
def health(response: Response):
    """Readiness probe: reports healthy ONLY when every critical dependency is
    available. Returns HTTP 503 when any critical check fails so an uptime
    monitor (or a staff glance) can distinguish "process up" from "able to
    serve check-in".
    """
    db_ok, db_detail = _health_check_database()
    dirs_ok, dir_problems = _health_check_directories()
    cfg_ok, cfg_detail = _health_check_configuration()
    backup_ok, backup_detail = _health_check_backup_subsystem()

    checks = {
        "database": {"ok": db_ok, "detail": db_detail},
        "directories": {"ok": dirs_ok, "detail": dir_problems or None},
        "configuration": {"ok": cfg_ok, "detail": cfg_detail},
        "backup": {"ok": backup_ok, "detail": backup_detail},
    }

    # Print-infrastructure readiness is informational (reported, never fatal):
    # having zero online agents is an operational condition, not a broken
    # dependency, so it must not flip the process to "unhealthy".
    if db_ok:
        try:
            now = datetime.now(timezone.utc)
            infra_db = SessionLocal()
            try:
                agents = infra_db.query(PrintAgent).all()
                online_agents = sum(
                    1 for a in agents if a.enabled and agent_is_online(a.last_seen, now)
                )
                enabled_stations = (
                    infra_db.query(PrintStation)
                    .filter(PrintStation.enabled == True)
                    .count()
                )
            finally:
                infra_db.close()
            checks["print_infrastructure"] = {
                "ok": True,
                "detail": {
                    "online_agents": online_agents,
                    "enabled_stations": enabled_stations,
                },
            }
        except Exception as exc:
            checks["print_infrastructure"] = {"ok": True, "detail": str(exc)}

    critical_ok = db_ok and dirs_ok and cfg_ok and backup_ok
    if not critical_ok:
        response.status_code = 503

    return {
        "status": "healthy" if critical_ok else "unhealthy",
        "authentication": "database",
        "checks": checks,
    }

@app.post("/api/auth/login", response_model=LoginResponse)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    submitted_username = request.username.strip()
    user = (
        db.query(User)
        .filter(func.lower(User.username) == submitted_username.lower())
        .first()
    )
    if not user:
        audit(user=submitted_username, action="LOGIN_FAILED", details="Invalid username")
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )
    password_matches = verify_password(
        request.password,
        user.password_hash,
    )
    if not user.enabled:
        audit(user=user.username, action="LOGIN_FAILED", details="Account disabled")
        raise HTTPException(
            status_code=403,
            detail="Account disabled",
        )
    if not password_matches:
        user.failed_login_count += 1
        audit(user=user.username, action="LOGIN_FAILED", details=f"Invalid password (attempt #{user.failed_login_count})")
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )
    audit(user=user.username,action="LOGIN",details="Successful login")
    user.failed_login_count = 0
    user.last_login = datetime.now()
    db.commit()
    token = create_access_token(user.username)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        username=user.username,
        role=user.role,
    )

@app.post("/api/change-password")
def change_password(
    request: PasswordChangeRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(func.lower(User.username) == current_user.lower())
        .first()
    )

    if not user:
        audit(user=current_user, action="CHANGE_PASSWORD Failed", details="Username not found")
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    if not verify_password(
        request.current_password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect.",
        )

    user.password_hash = hash_password(request.new_password)
    user.password_changed_date = datetime.now()
    user.must_change_password = False
    user.modified_by = current_user
    user.modified_date = datetime.now()

    db.commit()

    return {
        "status": "success",
        "message": "Password updated successfully.",
    }

@app.get("/api/me")
def get_me(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(
            func.lower(User.username)
            == current_user.lower()
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "enabled": user.enabled,
        "must_change_password": user.must_change_password,
    }

@app.get("/api/print-agents",response_model=list[PrintAgentResponse],)
def get_print_agents(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agents = (
        db.query(PrintAgent)
        .order_by(PrintAgent.hostname.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    results = []

    for agent in agents:
        station = None

        if agent.print_station_id:
            station = (
                db.query(PrintStation)
                .filter(
                    PrintStation.id == agent.print_station_id
                )
                .first()
            )

        results.append(
            {
                "id": agent.id,
                "agent_key": agent.agent_key,
                "hostname": agent.hostname,
                "printer_name": agent.printer_name,
                "agent_version": agent.agent_version,
                "last_seen": agent.last_seen,
                "last_ip": agent.last_ip,
                "enabled": agent.enabled,
                "online": agent.enabled and agent_is_online(agent.last_seen, now),
                "station_id": station.id if station else None,
                "station_name": station.name if station else None,
                "station_slug": station.slug if station else None,
            }
        )

    return results

@app.put("/api/print-agents/{agent_id}/assign",response_model=PrintAgentResponse,)
def assign_print_agent(
    agent_id: int,
    request: PrintAgentAssign,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == agent_id)
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Print agent not found",
        )
    #
    # Clear heartbeat data from the currently assigned station
    # before moving the agent elsewhere.
    #
    old_station = None
    if agent.print_station_id is not None:
        old_station = (
            db.query(PrintStation)
            .filter(PrintStation.id == agent.print_station_id)
            .first()
        )
        if old_station is not None:
            old_station.last_seen = None
            old_station.last_ip = None
            old_station.agent_version = None
    station = None
    if request.station_id is not None:
        station = (
            db.query(PrintStation)
            .filter(PrintStation.id == request.station_id)
            .first()
        )
        if station is None:
            raise HTTPException(
                status_code=404,
                detail="Print station not found",
            )
    agent.print_station_id = request.station_id
    db.commit()
    db.refresh(agent)
    audit(
        current_user,
        "ASSIGN_PRINT_AGENT",
        f"AgentID={agent.id}, StationID={request.station_id}",
    )
    return {
        "id": agent.id,
        "agent_key": agent.agent_key,
        "hostname": agent.hostname,
        "printer_name": agent.printer_name,
        "agent_version": agent.agent_version,
        "last_seen": agent.last_seen,
        "last_ip": agent.last_ip,
        "enabled": agent.enabled,
        "station_id": station.id if station else None,
        "station_name": station.name if station else None,
        "station_slug": station.slug if station else None,
    }

@app.post("/api/print-agents/{agent_id}/test-label")
def create_print_agent_test_label(
    agent_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == agent_id)
        .first()
    )
    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Print agent not found",
        )
    if agent.print_station_id is None:
        raise HTTPException(
            status_code=400,
            detail="Print agent is not assigned to a print station",
        )
    station = (
        db.query(PrintStation)
        .filter(PrintStation.id == agent.print_station_id)
        .first()
    )
    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Assigned print station not found",
        )
    system_visitor = get_or_create_system_test_visitor(db)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_name = f"print-agent-test-{agent.id}-{timestamp}.png"
    badge_path = BADGE_DIR / file_name
    generate_print_agent_test_label(
        agent=agent,
        station=station,
        output_path=badge_path,
    )
    print_job = PrintJob(
        visitor_id=system_visitor.id,
        print_station_id=station.id,
        badge_path=f"uploads/badges/{file_name}",
        status="Pending",
        created_time=datetime.now(),
    )
    db.add(print_job)
    db.commit()
    db.refresh(print_job)
    audit(
        current_user,
        "PRINT_AGENT_TEST_LABEL",
        f"AgentID={agent.id}, PrintJobID={print_job.id}, StationID={station.id}",
    )
    return {
        "message": f"Test label queued for {agent.hostname}",
        "print_job_id": print_job.id,
        "station": station.name,
    }

@app.post("/api/print-agents/register",response_model=PrintAgentRegisterResponse,)
def register_print_agent(
    request: PrintAgentRegister,
    http_request: Request,
    db: Session = Depends(get_db),
):
    agent = None

    if request.agent_key:
        agent = (
            db.query(PrintAgent)
            .filter(PrintAgent.agent_key == request.agent_key)
            .first()
        )

    if agent is None:
        # Batch 5C: newly discovered agents enroll DISABLED and must be approved
        # by an Administrator before they are treated as authenticated. This does
        # not block the grace period (print endpoints are not yet token-gated).
        agent = PrintAgent(
            agent_key=request.agent_key or str(uuid4()),
            hostname=request.hostname,
            printer_name=request.printer_name,
            agent_version=request.agent_version,
            enabled=False,
        )

        db.add(agent)

    agent.hostname = request.hostname
    agent.printer_name = request.printer_name
    agent.agent_version = request.agent_version
    agent.last_seen = datetime.utcnow()
    agent.last_ip = http_request.client.host

    db.commit()
    db.refresh(agent)

    # Controlled credential issuance: issue a token exactly once, only when the
    # agent has no active (unrevoked) credential yet. This covers a brand-new
    # agent's first registration and lets an existing tokenless agent adopt a
    # credential during the grace period, but never silently rotates an agent's
    # credential on subsequent registrations.
    issued_token = None

    existing_credential = (
        db.query(PrintAgentCredential)
        .filter(
            PrintAgentCredential.print_agent_id == agent.id,
            PrintAgentCredential.revoked.is_(False),
        )
        .first()
    )

    if existing_credential is None:
        selector, verifier, issued_token = generate_agent_token()
        credential = PrintAgentCredential(
            print_agent_id=agent.id,
            token_selector=selector,
            token_hash=hash_agent_verifier(verifier),
        )
        db.add(credential)
        db.commit()

    audit(
        "print-agent",
        "REGISTER_PRINT_AGENT",
        f"AgentID={agent.id}, Hostname={request.hostname}, "
        f"Enabled={agent.enabled}, CredentialIssued={issued_token is not None}",
    )

    assigned_station = None

    if agent.print_station_id is not None:
        assigned_station = (
            db.query(PrintStation)
            .filter(PrintStation.id == agent.print_station_id)
            .first()
        )

    return {
        "id": agent.id,
        "agent_key": agent.agent_key,
        "hostname": agent.hostname,
        "printer_name": agent.printer_name,
        "agent_version": agent.agent_version,
        "last_seen": agent.last_seen,
        "last_ip": agent.last_ip,
        "enabled": agent.enabled,
        "online": agent.enabled and agent_is_online(agent.last_seen),
        "station_id": assigned_station.id if assigned_station else None,
        "station_name": assigned_station.name if assigned_station else None,
        "station_slug": assigned_station.slug if assigned_station else None,
        "agent_token": issued_token,
    }

@app.put("/api/print-agents/{agent_id}/enabled",response_model=PrintAgentResponse,)
def set_print_agent_enabled(
    agent_id: int,
    request: PrintAgentEnabledUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Administrator approval/disablement for a print agent (Batch 5C)."""
    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == agent_id)
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Print agent not found",
        )

    agent.enabled = request.enabled
    db.commit()
    db.refresh(agent)

    audit(
        admin.username,
        "ENABLE_PRINT_AGENT" if request.enabled else "DISABLE_PRINT_AGENT",
        f"AgentID={agent.id}, Hostname={agent.hostname}",
    )

    assigned_station = None

    if agent.print_station_id is not None:
        assigned_station = (
            db.query(PrintStation)
            .filter(PrintStation.id == agent.print_station_id)
            .first()
        )

    return {
        "id": agent.id,
        "agent_key": agent.agent_key,
        "hostname": agent.hostname,
        "printer_name": agent.printer_name,
        "agent_version": agent.agent_version,
        "last_seen": agent.last_seen,
        "last_ip": agent.last_ip,
        "enabled": agent.enabled,
        "station_id": assigned_station.id if assigned_station else None,
        "station_name": assigned_station.name if assigned_station else None,
        "station_slug": assigned_station.slug if assigned_station else None,
    }

@app.delete("/api/print-agents/{agent_id}")
def delete_print_agent(
    agent_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Remove a print agent registration (admin-only).

    Deletes the agent row and any credentials issued to it. Print jobs that
    were leased by this agent are released back into the queue (their claim is
    cleared); the jobs themselves are never deleted. This lets an operator
    remove a stale or duplicate agent (for example, a re-imaged Raspberry Pi
    that registered under a new agent key).
    """
    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == agent_id)
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Print agent not found",
        )

    hostname = agent.hostname

    # Release any jobs this agent had leased so they return to the queue for
    # another agent to claim. The jobs are not deleted.
    (
        db.query(PrintJob)
        .filter(PrintJob.claimed_by_agent_id == agent.id)
        .update(
            {
                PrintJob.claimed_by_agent_id: None,
                PrintJob.claim_expires_at: None,
            },
            synchronize_session=False,
        )
    )

    # Remove issued credentials explicitly. SQLite does not enforce the
    # ON DELETE CASCADE unless PRAGMA foreign_keys is enabled, so we delete
    # them here rather than relying on the database.
    (
        db.query(PrintAgentCredential)
        .filter(PrintAgentCredential.print_agent_id == agent.id)
        .delete(synchronize_session=False)
    )

    db.delete(agent)
    db.commit()

    audit(
        admin.username,
        "DELETE_PRINT_AGENT",
        f"AgentID={agent_id}, Hostname={hostname}",
    )

    return {"detail": "Print agent deleted"}

@app.post(
    "/api/print-agents/{agent_id}/credentials/rotate",
    response_model=PrintAgentCredentialIssueResponse,
)
def rotate_print_agent_credential(
    agent_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Revoke the agent's active credentials and issue a fresh one (Batch 5C).

    The new plaintext token is returned exactly once; only its hash is stored.
    """
    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == agent_id)
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Print agent not found",
        )

    now = datetime.utcnow()

    active_credentials = (
        db.query(PrintAgentCredential)
        .filter(
            PrintAgentCredential.print_agent_id == agent.id,
            PrintAgentCredential.revoked.is_(False),
        )
        .all()
    )

    for credential in active_credentials:
        credential.revoked = True
        credential.revoked_at = now

    selector, verifier, token = generate_agent_token()
    db.add(
        PrintAgentCredential(
            print_agent_id=agent.id,
            token_selector=selector,
            token_hash=hash_agent_verifier(verifier),
        )
    )
    db.commit()

    audit(
        admin.username,
        "ROTATE_PRINT_AGENT_CREDENTIAL",
        f"AgentID={agent.id}, RevokedCount={len(active_credentials)}",
    )

    return {
        "agent_id": agent.id,
        "agent_token": token,
        "message": "New credential issued. Store it now; it will not be shown again.",
    }

@app.post("/api/print-agents/{agent_id}/credentials/revoke")
def revoke_print_agent_credentials(
    agent_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Revoke all active credentials for an agent without issuing a new one."""
    agent = (
        db.query(PrintAgent)
        .filter(PrintAgent.id == agent_id)
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Print agent not found",
        )

    now = datetime.utcnow()

    active_credentials = (
        db.query(PrintAgentCredential)
        .filter(
            PrintAgentCredential.print_agent_id == agent.id,
            PrintAgentCredential.revoked.is_(False),
        )
        .all()
    )

    for credential in active_credentials:
        credential.revoked = True
        credential.revoked_at = now

    db.commit()

    audit(
        admin.username,
        "REVOKE_PRINT_AGENT_CREDENTIAL",
        f"AgentID={agent.id}, RevokedCount={len(active_credentials)}",
    )

    return {
        "agent_id": agent.id,
        "revoked": len(active_credentials),
    }

@app.get("/api/print-jobs/{print_job_id}/badge-image")
def get_print_job_badge_image(
    print_job_id: int,
    db: Session = Depends(get_db),
    agent: PrintAgent = Depends(require_print_agent),
):
    print_job = (
        db.query(PrintJob)
        .filter(PrintJob.id == print_job_id)
        .first()
    )

    if print_job is None:
        raise HTTPException(
            status_code=404,
            detail="Print job not found",
        )

    # An agent may only fetch badge images for its own station.
    if agent.print_station_id is not None and (
        print_job.print_station_id != agent.print_station_id
    ):
        raise HTTPException(
            status_code=403,
            detail="Print job belongs to a different station",
        )

    badge_path = Path(print_job.badge_path)

    if not badge_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Badge image file not found",
        )

    return FileResponse(
        path=badge_path,
        media_type="image/png",
        filename=f"print-job-{print_job_id}.png",
    )

@app.get(
    "/api/print-jobs/{print_job_id}/status",
    response_model=PrintJobPublicStatusResponse,
)
def get_print_job_public_status(
    print_job_id: int,
    db: Session = Depends(get_db),
):
    """Anonymous, minimized job-status projection for the guest screen.

    Returns only the normalized status and friendly station name. It never
    exposes printer name, agent identity/IP, lease timing, or generation, per
    the ratified visitor-facing identity boundary (§21.10). Recovery is not run
    here: this is a read-only visitor view, and the agent-facing endpoints own
    lease recovery.
    """
    print_job = (
        db.query(PrintJob)
        .filter(PrintJob.id == print_job_id)
        .first()
    )

    if print_job is None:
        raise HTTPException(
            status_code=404,
            detail="Print job not found",
        )

    station = (
        db.query(PrintStation)
        .filter(PrintStation.id == print_job.print_station_id)
        .first()
    )

    return {
        "status": print_job.status,
        "station_name": station.name if station else None,
    }

@app.get("/api/print-jobs")
def get_print_jobs(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    jobs = db.query(PrintJob).order_by(PrintJob.created_time.desc()).all()

    now = datetime.now(timezone.utc)

    # Per-station liveness, computed once, so every job can be flagged when its
    # target station has no live agent (a common "why isn't it printing" cause).
    agents = db.query(PrintAgent).all()
    agents_by_id = {a.id: a for a in agents}
    seens_by_station: dict[int, list] = {}
    for a in agents:
        if a.print_station_id is not None and a.enabled:
            seens_by_station.setdefault(a.print_station_id, []).append(a.last_seen)

    station_status_cache: dict[int, str] = {}

    def _station_status_for(station: PrintStation | None) -> str | None:
        if station is None:
            return None
        cached = station_status_cache.get(station.id)
        if cached is None:
            cached = station_status(
                enabled=bool(station.enabled),
                agent_last_seens=seens_by_station.get(station.id, []),
                now=now,
            )
            station_status_cache[station.id] = cached
        return cached

    results = []

    for job in jobs:
        visitor = (
            db.query(Visitor)
            .filter(Visitor.id == job.visitor_id)
            .first()
        )

        print_station = (
            db.query(PrintStation)
            .filter(PrintStation.id == job.print_station_id)
            .first()
        )

        computed_station_status = _station_status_for(print_station)
        station_online = computed_station_status == STATION_STATUS_ONLINE

        owning_agent = (
            agents_by_id.get(job.claimed_by_agent_id)
            if job.claimed_by_agent_id is not None
            else None
        )

        diagnostics = queue_diagnostics.job_diagnostics(
            status=job.status,
            created_time=job.created_time,
            claimed_time=job.claimed_time,
            attempt_count=job.attempt_count,
            last_recovery_reason=job.last_recovery_reason,
            error_message=job.error_message,
            station_online=station_online,
            now=now,
        )

        results.append({
            "id": job.id,
            "visitor_id": job.visitor_id,
            "visitor_name": (
                f"{visitor.first_name} {visitor.last_name}"
                if visitor
                else "Unknown Visitor"
            ),
            "visitor_type": (
                visitor.visitor_type
                if visitor
                else None
            ),
            "station_name": (
                print_station.name
                if print_station
                else None
            ),
            "station_slug": (
                print_station.slug
                if print_station
                else None
            ),
            "station_status": computed_station_status,
            "station_online": station_online,
            "badge_path": job.badge_path,
            "status": job.status,
            "printer_name": job.printer_name,
            "error_message": job.error_message,
            "created_time": job.created_time,
            "claimed_time": job.claimed_time,
            "completed_time": job.completed_time,
            # M9.2 Batch 2: operational bookkeeping surfaced to operators.
            "attempt_count": job.attempt_count or 0,
            "claim_generation": job.claim_generation or 0,
            "claim_expires_at": job.claim_expires_at,
            "last_recovery_reason": job.last_recovery_reason,
            "agent_hostname": owning_agent.hostname if owning_agent else None,
            # Derived diagnostics (server-computed, UTC-safe).
            "age_seconds": diagnostics["age_seconds"],
            "attention": diagnostics["attention"],
            "attention_level": diagnostics["attention_level"],
            "attention_reasons": diagnostics["attention_reasons"],
        })

    return results

@app.get("/api/print-jobs/pending", response_model=list[PrintJobResponse])
def get_pending_print_jobs(
    db: Session = Depends(get_db),
    agent: PrintAgent = Depends(require_print_agent),
):
    # Station is always derived from the authenticated agent.
    if agent.print_station_id is None:
        return []

    station_id = agent.print_station_id

    # Optional backstop cleanup; correctness does not depend on this sweep.
    recover_stale_print_jobs(db, station_id=station_id)

    now = datetime.utcnow()

    # Surface claimable jobs: Pending, plus Printing jobs whose lease lapsed so
    # a restarted/replacement agent can atomically re-claim them without waiting
    # for the recovery sweep.
    return (
        db.query(PrintJob)
        .filter(
            PrintJob.print_station_id == station_id,
            or_(
                PrintJob.status == "Pending",
                (PrintJob.status == "Printing")
                & (PrintJob.claim_expires_at.isnot(None))
                & (PrintJob.claim_expires_at < now),
            ),
        )
        .order_by(PrintJob.created_time.asc())
        .all()
    )

@app.put("/api/print-jobs/{print_job_id}/claim", response_model=PrintJobResponse)
def claim_print_job(
    print_job_id: int,
    printer_name: str = "Unspecified Printer",
    db: Session = Depends(get_db),
    agent: PrintAgent = Depends(require_print_agent),
):
    print_job = (
        db.query(PrintJob)
        .filter(PrintJob.id == print_job_id)
        .first()
    )

    if print_job is None:
        raise HTTPException(
            status_code=404,
            detail="Print job not found",
        )

    # Cross-station protection: an agent may only claim jobs for its station.
    if agent.print_station_id is None or (
        print_job.print_station_id != agent.print_station_id
    ):
        raise HTTPException(
            status_code=403,
            detail="Print job belongs to a different station",
        )

    # Optional backstop cleanup (retry cap -> Failed for fully stale jobs).
    recover_stale_print_jobs(db, job_id=print_job_id)

    now = datetime.utcnow()
    lease_expires = now + timedelta(seconds=PRINT_JOB_LEASE_SECONDS)

    # Self-correcting atomic claim: a job is claimable when it is Pending, or a
    # Printing job whose lease has lapsed (NULL or past expiry). This single
    # conditional UPDATE is the exclusive, race-free gate - concurrent claimants
    # see 0 rows and get 409. Bumping claim_generation invalidates any late
    # status update from the prior lease. Correctness lives here, not in the
    # recovery sweep.
    updated = (
        db.query(PrintJob)
        .filter(
            PrintJob.id == print_job_id,
            PrintJob.status.in_(("Pending", "Printing")),
            or_(
                PrintJob.claim_expires_at.is_(None),
                PrintJob.claim_expires_at < now,
            ),
        )
        .update(
            {
                PrintJob.status: "Printing",
                PrintJob.printer_name: printer_name,
                PrintJob.claimed_time: now,
                PrintJob.claimed_by_agent_id: agent.id,
                PrintJob.claim_expires_at: lease_expires,
                PrintJob.claim_generation: PrintJob.claim_generation + 1,
                PrintJob.attempt_count: PrintJob.attempt_count + 1,
            },
            synchronize_session=False,
        )
    )

    db.commit()

    if updated == 0:
        raise HTTPException(
            status_code=409,
            detail="Print job is not available to claim",
        )

    db.refresh(print_job)

    return print_job

@app.delete("/api/print-jobs/completed")
def clear_completed_print_jobs(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    deleted = (
        db.query(PrintJob)
        .filter(PrintJob.status == "Completed")
        .delete()
    )

    db.commit()

    audit(current_user,"CLEAR_COMPLETED_PRINT_JOBS", f"Deleted={deleted}")

    return {
        "status": "success",
        "deleted": deleted,
    }

@app.delete("/api/print-jobs/failed")
def clear_failed_print_jobs(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    deleted = (
        db.query(PrintJob)
        .filter(PrintJob.status == "Failed")
        .delete()
    )

    db.commit()
    audit(current_user,"CLEAR_FAILED_PRINT_JOBS", f"Deleted={deleted}")

    return {
        "status": "success",
        "deleted": deleted,
    }

@app.put("/api/print-jobs/{print_job_id}/status", response_model=PrintJobResponse)
def update_print_job_status(
    print_job_id: int,
    status_update: PrintJobStatusUpdate,
    db: Session = Depends(get_db),
    agent: PrintAgent = Depends(require_print_agent),
):
    print_job = (
        db.query(PrintJob)
        .filter(PrintJob.id == print_job_id)
        .first()
    )

    if print_job is None:
        raise HTTPException(
            status_code=404,
            detail="Print job not found",
        )

    # An agent may only report on jobs it owns / that belong to its station.
    if (
        print_job.claimed_by_agent_id is not None
        and print_job.claimed_by_agent_id != agent.id
    ):
        raise HTTPException(
            status_code=409,
            detail="Print job is owned by another agent",
        )
    if (
        agent.print_station_id is not None
        and print_job.print_station_id != agent.print_station_id
    ):
        raise HTTPException(
            status_code=403,
            detail="Print job belongs to a different station",
        )

    # claim_generation is a mandatory invariant on every status report and is
    # the sole authority for stale-lease rejection, independent of job.status.
    if status_update.claim_generation is None:
        raise HTTPException(
            status_code=400,
            detail="claim_generation is required",
        )
    if status_update.claim_generation != print_job.claim_generation:
        raise HTTPException(
            status_code=409,
            detail="Stale print job update rejected",
        )

    normalized_status = status_update.status.strip().title()

    if normalized_status not in VALID_PRINT_JOB_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid print job status: {status_update.status}",
        )

    print_job.status = normalized_status
    print_job.printer_name = status_update.printer_name or print_job.printer_name
    print_job.error_message = status_update.error_message

    # Terminal states release the lease so recovery never touches them again.
    if normalized_status in ("Completed", "Failed"):
        print_job.claim_expires_at = None

    if normalized_status == "Completed":
        print_job.completed_time = datetime.now()

        visitor = (
            db.query(Visitor)
            .filter(Visitor.id == print_job.visitor_id)
            .first()
        )

        if visitor:
            visitor.badge_printed = True
            visitor.badge_printed_time = print_job.completed_time

    db.commit()
    db.refresh(print_job)

    return print_job

@app.delete("/api/print-jobs/{job_id}")
def delete_print_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    job = (
        db.query(PrintJob)
        .filter(PrintJob.id == job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Print job not found",
        )

    db.delete(job)
    db.commit()
    audit(current_user,"DELETE_PRINT_JOB", f"Deleted={job_id}, Status={job.status}")

    return {"status": "deleted"}


@app.put("/api/print-jobs/{print_job_id}/station", response_model=PrintJobResponse)
def reassign_print_job_station(
    print_job_id: int,
    request: PrintJobStationUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Redirect a still-queued print job to a different, enabled station.

    Covers the operational case where a job was queued for a station that is
    offline (for example, a guest used an old URL naming a station that is not
    currently online). Only ``Pending`` jobs may be redirected — in-flight or
    terminal jobs are never reassigned — and the destination must be a valid,
    enabled station. Any stale lease bookkeeping is cleared and the claim
    generation is bumped so a late update from a prior lease cannot apply.
    """
    job = (
        db.query(PrintJob)
        .filter(PrintJob.id == print_job_id)
        .first()
    )

    if job is None:
        raise HTTPException(status_code=404, detail="Print job not found")

    if job.status != "Pending":
        raise HTTPException(
            status_code=400,
            detail="Only pending print jobs can be redirected to another station.",
        )

    station = (
        db.query(PrintStation)
        .filter(
            PrintStation.id == request.station_id,
            PrintStation.enabled == True,
        )
        .first()
    )

    if station is None:
        raise HTTPException(
            status_code=400,
            detail="Selected print station not found or unavailable.",
        )

    previous_station_id = job.print_station_id
    job.print_station_id = station.id
    job.claimed_by_agent_id = None
    job.claim_expires_at = None
    job.claimed_time = None
    job.claim_generation = (job.claim_generation or 0) + 1

    db.commit()
    db.refresh(job)

    audit(
        current_user,
        "REDIRECT_PRINT_JOB",
        f"JobID={job.id}, FromStationID={previous_station_id}, ToStation={station.slug}",
    )

    return job

@app.get("/api/print-stations",response_model=list[PrintStationResponse])
def get_print_stations(
    db: Session = Depends(get_db)
):
    stations = (
        db.query(PrintStation)
        .order_by(PrintStation.name.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    agents = db.query(PrintAgent).all()
    seens_by_station: dict[int, list] = {}
    for a in agents:
        if a.print_station_id is not None and a.enabled:
            seens_by_station.setdefault(a.print_station_id, []).append(a.last_seen)

    results = []
    for station in stations:
        status = station_status(
            enabled=bool(station.enabled),
            agent_last_seens=seens_by_station.get(station.id, []),
            now=now,
        )
        results.append(
            {
                "id": station.id,
                "name": station.name,
                "slug": station.slug,
                "print_server_host": station.print_server_host,
                "enabled": station.enabled,
                "last_seen": station.last_seen,
                "agent_version": station.agent_version,
                "last_ip": station.last_ip,
                "status": status,
                "online": status == STATION_STATUS_ONLINE,
            }
        )
    return results

@app.post("/api/print-stations",response_model=PrintStationResponse,)
def create_print_station(
    request: PrintStationCreate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(PrintStation)
        .filter(PrintStation.slug == request.slug)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Print station '{request.slug}' already exists",
        )

    station = PrintStation(
        name=request.name,
        slug=request.slug,
        print_server_host=request.print_server_host,
        enabled=request.enabled,
    )

    db.add(station)
    db.commit()
    db.refresh(station)

    audit(current_user,"CREATE_PRINT_STATION", f"Created={station.slug}")

    return station

@app.get("/api/print-stations/{station_id}/stats",response_model=PrintStationStatsResponse,)
def get_print_station_stats(
    station_id: int,
    db: Session = Depends(get_db),
):
    pending_jobs = (
        db.query(PrintJob)
        .filter(
            PrintJob.print_station_id == station_id,
            PrintJob.status == "Pending",
        )
        .count()
    )

    printing_jobs = (
        db.query(PrintJob)
        .filter(
            PrintJob.print_station_id == station_id,
            PrintJob.status == "Printing",
        )
        .count()
    )

    completed_jobs = (
        db.query(PrintJob)
        .filter(
            PrintJob.print_station_id == station_id,
            PrintJob.status == "Completed",
        )
        .count()
    )

    failed_jobs = (
        db.query(PrintJob)
        .filter(
            PrintJob.print_station_id == station_id,
            PrintJob.status == "Failed",
        )
        .count()
    )

    return {
        "pending_jobs": pending_jobs,
        "printing_jobs": printing_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
    }

@app.get("/api/print-stations/{station_id}/qr")
def download_print_station_qr(
    station_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    station = (
        db.query(PrintStation)
        .filter(PrintStation.id == station_id)
        .first()
    )

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Print station not found",
        )

    file_name = f"station-qr-{station.slug}.png"
    qr_path = QR_DIR / file_name

    generate_print_station_qr_label(
        station=station,
        output_path=qr_path,
    )

    return FileResponse(
        path=str(qr_path),
        media_type="image/png",
        filename=file_name,
    )

@app.post("/api/print-stations/{station_id}/print-qr")
def print_station_qr_label(
    station_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    station = (
        db.query(PrintStation)
        .filter(PrintStation.id == station_id)
        .first()
    )

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Print station not found",
        )

    if not station.enabled:
        raise HTTPException(
            status_code=400,
            detail="Print station is in maintenance mode.",
        )

    system_visitor = get_or_create_system_qr_visitor(db)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_name = f"print-station-qr-{station.slug}-{timestamp}.png"
    qr_path = QR_DIR / file_name

    generate_print_station_qr_label(
        station=station,
        output_path=qr_path,
    )

    print_job = PrintJob(
        visitor_id=system_visitor.id,
        print_station_id=station.id,
        badge_path=f"uploads/qr-codes/{file_name}",
        status="Pending",
        created_time=datetime.now(),
    )

    db.add(print_job)
    db.commit()
    db.refresh(print_job)

    return {
        "message": f"QR label queued for {station.name}",
        "print_job_id": print_job.id,
        "station": station.name,
        "station_slug": station.slug,
        "checkin_url": build_station_checkin_url(station),
    }

@app.put("/api/print-stations/{station_id}",response_model=PrintStationResponse,)
def update_print_station(
    station_id: int,
    request: PrintStationUpdate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    station = (
        db.query(PrintStation)
        .filter(PrintStation.id == station_id)
        .first()
    )

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Print station not found",
        )

    station.name = request.name
    station.slug = request.slug
    station.print_server_host = request.print_server_host
    station.enabled = request.enabled

    db.commit()
    db.refresh(station)

    audit(
        current_user,
        "UPDATE_PRINT_STATION",
        f"StationID={station.id}, StationSlug={station.slug}",
    )

    return station

@app.delete("/api/print-stations/{station_id}/permanent")
def delete_print_station(
    station_id: int,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    station = (
        db.query(PrintStation)
        .filter(PrintStation.id == station_id)
        .first()
    )

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Print station not found",
        )

    assigned_agents = (
        db.query(PrintAgent)
        .filter(
            PrintAgent.print_station_id == station_id
        )
        .count()
    )

    if assigned_agents > 0:
        raise HTTPException(
            status_code=400,
            detail="Unassign all print agents before deleting this station",
        )

    # Jobs belong to their station (PrintJob.print_station_id is NOT NULL) and
    # visitors record the station they checked in at. Permanently deleting a
    # referenced station would orphan those rows / break the FK, so block it and
    # steer the operator toward disabling the station instead.
    referencing_jobs = (
        db.query(PrintJob)
        .filter(PrintJob.print_station_id == station_id)
        .count()
    )

    if referencing_jobs > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "This station has print job history and can't be permanently "
                "deleted. Disable the station instead, or clear its print jobs "
                "first."
            ),
        )

    referencing_visitors = (
        db.query(Visitor)
        .filter(Visitor.print_station_id == station_id)
        .count()
    )

    if referencing_visitors > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "This station is referenced by visitor check-in records and "
                "can't be permanently deleted. Disable the station instead."
            ),
        )

    db.delete(station)
    db.commit()

    audit(
        current_user,
        "DELETE_PRINT_STATION",
        f"StationID={station.id}, StationSlug={station.slug}",
    )

    return {
        "message": f"Print station '{station.name}' deleted"
    }

@app.post("/api/print-stations/heartbeat")
def print_station_heartbeat(
    request: PrintStationHeartbeat,
    http_request: Request,
    db: Session = Depends(get_db),
    agent: PrintAgent = Depends(require_print_agent),
):
    station = (
        db.query(PrintStation)
        .filter(PrintStation.slug == request.station_slug)
        .first()
    )

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Print station not found",
        )

    station.last_seen = datetime.utcnow()
    station.agent_version = request.agent_version
    station.last_ip = http_request.client.host

    db.commit()

    return {
        "status": "ok",
        "station": station.slug,
    }

@app.get("/api/reporting/summary",response_model=ReportingSummaryResponse,)
def get_reporting_summary(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    now = datetime.now()
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_today = start_today + timedelta(days=1)

    check_ins_by_location_rows = (
        db.query(
            PrintStation.name,
            func.count(func.distinct(PrintJob.visitor_id)),
        )
        .join(PrintJob, PrintJob.print_station_id == PrintStation.id)
        .filter(
            PrintJob.created_time >= start_today,
            PrintJob.created_time < end_today,
        )
        .group_by(PrintStation.name)
        .order_by(PrintStation.name.asc())
        .all()
    )
    check_ins_by_location = [
        {
            "label": station_name,
            "count": count,
        }
        for station_name, count in check_ins_by_location_rows
    ]
    recent_visitors = (
        db.query(Visitor)
        .order_by(Visitor.check_in_time.desc())
        .limit(10)
        .all()
    )

    recent_arrivals = []

    for visitor in recent_visitors:
        print_job_with_station = (
            db.query(PrintJob, PrintStation)
            .join(PrintStation, PrintStation.id == PrintJob.print_station_id)
            .filter(PrintJob.visitor_id == visitor.id)
            .order_by(PrintJob.created_time.asc())
            .first()
        )

        station_name = None

        if print_job_with_station is not None:
            station_name = print_job_with_station[1].name

        recent_arrivals.append(
            {
                "id": visitor.id,
                "visitor_name": f"{visitor.first_name} {visitor.last_name}",
                "visitor_type": visitor.visitor_type,
                "check_in_time": visitor.check_in_time,
                "station_name": station_name,
            }
        )

    visitor_type_rows = (
        db.query(
            Visitor.visitor_type,
            func.count(Visitor.id),
        )
        .filter(
            Visitor.check_in_time >= start_today,
            Visitor.check_in_time < end_today,
        )
        .group_by(Visitor.visitor_type)
        .order_by(func.count(Visitor.id).desc())
        .all()
    )

    visitor_types = [
        {
            "label": visitor_type,
            "count": count,
        }
        for visitor_type, count in visitor_type_rows
    ]

    hour_expr = func.strftime("%H", Visitor.check_in_time)

    hourly_rows = (
        db.query(
            hour_expr,
            func.count(Visitor.id),
        )
        .filter(
            Visitor.check_in_time >= start_today,
            Visitor.check_in_time < end_today,
        )
        .group_by(hour_expr)
        .all()
    )

    hourly_counts = {
        int(hour): count
        for hour, count in hourly_rows
        if hour is not None
    }

    hourly_activity = []

    for hour in range(24):
        hour_label = datetime.now().replace(
            hour=hour,
            minute=0,
            second=0,
            microsecond=0,
        ).strftime("%I %p").lstrip("0")

        hourly_activity.append(
            {
                "hour": hour,
                "label": hour_label,
                "count": hourly_counts.get(hour, 0),
            }
        )

    start_trend = start_today - timedelta(days=6)
    day_expr = func.date(Visitor.check_in_time)

    daily_rows = (
        db.query(
            day_expr,
            func.count(Visitor.id),
        )
        .filter(
            Visitor.check_in_time >= start_trend,
            Visitor.check_in_time < end_today,
        )
        .group_by(day_expr)
        .order_by(day_expr.asc())
        .all()
    )

    daily_counts = {
        day: count
        for day, count in daily_rows
        if day is not None
    }

    daily_trends = []

    for offset in range(7):
        day = (start_today - timedelta(days=6 - offset)).date()
        day_key = day.isoformat()

        daily_trends.append(
            {
                "date": day_key,
                "count": daily_counts.get(day_key, 0),
            }
        )

    print_station_usage_rows = (
        db.query(
            PrintStation.name,
            func.count(PrintJob.id),
        )
        .join(PrintJob, PrintJob.print_station_id == PrintStation.id)
        .filter(
            PrintJob.created_time >= start_today,
            PrintJob.created_time < end_today,
        )
        .group_by(PrintStation.name)
        .order_by(func.count(PrintJob.id).desc())
        .all()
    )

    print_station_usage = [
        {
            "label": station_name,
            "count": count,
        }
        for station_name, count in print_station_usage_rows
    ]

    peak_check_in_times = sorted(
        [
            item
            for item in hourly_activity
            if item["count"] > 0
        ],
        key=lambda item: item["count"],
        reverse=True,
    )[:3]

    return ReportingSummaryResponse(
        check_ins_by_location=check_ins_by_location,
        recent_arrivals=recent_arrivals,
        visitor_types=visitor_types,
        hourly_activity=hourly_activity,
        daily_trends=daily_trends,
        print_station_usage=print_station_usage,
        peak_check_in_times=peak_check_in_times,
    )

@app.get("/api/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    return user

@app.get("/api/users", response_model=list[UserResponse])
def get_users(
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return db.query(User).order_by(User.username).all()

@app.post("/api/users",response_model=UserResponse)
def create_user(
    request: UserCreate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    submitted_username = request.username.strip().lower()

    existing_user = (
        db.query(User)
        .filter(func.lower(User.username) == submitted_username)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    user = User(
        username=submitted_username,
        password_hash=hash_password(request.password),
        display_name=request.display_name,
        email=request.email,
        role=request.role,
        enabled=True,
        must_change_password=True
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    audit(
        current_user,
        "CREATE_USER",
        f"Username={request.username}, Role={request.role}",
    )

    return user

@app.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if request.display_name is not None:
        user.display_name = request.display_name

    if request.email is not None:
        user.email = request.email

    if request.role is not None:
        user.role = request.role

    if request.enabled is not None:
        user.enabled = request.enabled

    if request.notes is not None:
        user.notes = request.notes

    user.modified_by = current_user
    user.modified_date = datetime.now()

    db.commit()
    db.refresh(user)

    audit(
        current_user,
        "UPDATE_USER",
        f"Username={user.username}, Role={user.role}, request",
    )

    return user

@app.post("/api/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    request: PasswordResetRequest,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.password_hash = hash_password(
        request.new_password
    )

    user.must_change_password = True
    user.password_changed_date = datetime.now()

    user.modified_by = current_user
    user.modified_date = datetime.now()

    db.commit()
    db.refresh(user)

    audit(
        current_user,
        "RESET_PASSWORD",
        f"Username={user.username}, Role={user.role}",
    )

    return {
        "status": "success",
        "message": "Password reset successfully"
    }

@app.put("/api/users/{user_id}/status",response_model=UserResponse,)
def update_user_status(
    user_id: int,
    request: UserStatusUpdate,
    current_user: str = Depends(get_current_user),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Never allow the built-in admin account to be disabled
    if (
        user.username.lower() == "admin"
        and request.enabled is False
    ):
        raise HTTPException(
            status_code=400,
            detail="The built-in administrator account cannot be disabled."
        )

    user.enabled = request.enabled
    user.modified_by = current_user
    user.modified_date = datetime.now()

    db.commit()
    db.refresh(user)

    audit(
        current_user,
        "UPDATE_USER",
        f"Username={user.username}, Role={user.role}",
    )

    return user

@app.post("/api/visitors", response_model=VisitorResponse)
def create_visitor(
    visitor: VisitorCreate,
    db: Session = Depends(get_db),
):
    # The check-in station comes from the kiosk/QR URL path and is the single
    # source of truth for where this visitor's badge prints. It must resolve to
    # an enabled station or check-in fails closed - never default or ignore.
    slug = (visitor.station or "").strip()
    if not slug:
        raise HTTPException(
            status_code=400,
            detail="A check-in station is required.",
        )

    station = (
        db.query(PrintStation)
        .filter(
            PrintStation.slug == slug,
            PrintStation.enabled == True,
        )
        .first()
    )
    if station is None:
        raise HTTPException(
            status_code=400,
            detail="Unknown or unavailable check-in station.",
        )

    db_visitor = Visitor(
        first_name=visitor.first_name,
        last_name=visitor.last_name,
        visitor_type=visitor.visitor_type,
        church=visitor.church,
        phone=visitor.phone,
        email=visitor.email,
        purpose=visitor.purpose,
        host_type=visitor.host_type,
        host_name=visitor.host_name,
        vehicle_plate=visitor.vehicle_plate,
        notes=visitor.notes,
        expected_departure_time=visitor.expected_departure_time,
        check_in_time=datetime.now(),
        badge_printed=False,
        print_station_id=station.id,
    )

    db.add(db_visitor)
    db.commit()
    db.refresh(db_visitor)

    # Unauthenticated kiosk action: attribute to the "kiosk" system actor so the
    # audit trail records every check-in even though no staff user is logged in.
    audit(
        "kiosk",
        "CHECK_IN",
        f"VisitorID={db_visitor.id}, "
        f"Name={db_visitor.first_name} {db_visitor.last_name}, "
        f"Station={station.slug}",
    )

    return db_visitor

@app.get("/api/visitors/active/export")
def export_active_visitors(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Emergency roster export (authenticated staff).

    Streams a CSV of everyone currently on property so the office can account
    for and reach every guest during an evacuation or roll-call. Ordered by
    arrival time and includes host/camper, contact info, check-in station, and
    expected departure.
    """
    active = (
        db.query(Visitor)
        .filter(Visitor.check_out_time.is_(None))
        .order_by(Visitor.check_in_time.asc())
        .all()
    )

    station_names = {
        s.id: s.name
        for s in db.query(PrintStation).all()
    }

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "Visitor Name",
        "Visitor Type",
        "Host / Camper",
        "Purpose",
        "Phone",
        "Email",
        "Vehicle Plate",
        "Check-In Station",
        "Check-In Time",
        "Expected Departure",
    ])

    for v in active:
        writer.writerow([
            f"{v.first_name} {v.last_name}",
            v.visitor_type or "",
            v.host_name or "",
            v.purpose or "",
            v.phone or "",
            v.email or "",
            v.vehicle_plate or "",
            station_names.get(v.print_station_id, "") if v.print_station_id else "",
            v.check_in_time.strftime("%Y-%m-%d %H:%M:%S") if v.check_in_time else "",
            (
                v.expected_departure_time.strftime("%Y-%m-%d %H:%M:%S")
                if v.expected_departure_time
                else ""
            ),
        ])

    audit(
        current_user,
        "EXPORT_ACTIVE_VISITORS",
        f"Count={len(active)}",
    )

    filename = (
        f"active-visitors-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

@app.get("/api/visitors", response_model=list[VisitorResponse])
def get_visitors(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Visitor)
        .order_by(Visitor.check_in_time.desc())
        .all()
    )

@app.get("/api/visitors/active", response_model=list[VisitorResponse])
def get_active_visitors(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Visitor)
        .filter(Visitor.check_out_time.is_(None))
        .order_by(Visitor.check_in_time.desc())
        .all()
    )

@app.post("/api/visitors/{visitor_id}/checkin-again",response_model=VisitorResponse,)
def checkin_again(
    visitor_id: int,
    request: ReturningVisitorCheckInRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    original = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if original is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    # Prevent duplicate active check-ins.
    # This currently matches by first/last name only.
    # Future enhancement: use visitor history/person identity tracking.
    existing_active = (
        db.query(Visitor)
        .filter(
            Visitor.id != original.id,
            Visitor.first_name == original.first_name,
            Visitor.last_name == original.last_name,
            Visitor.check_out_time.is_(None),
        )
        .first()
    )

    if existing_active:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{original.first_name} {original.last_name} "
                f"is already checked in."
                "Please check them out before creating another visit."
            ),
        )

    new_visitor = Visitor(
        first_name=request.first_name,
        last_name=request.last_name,
        visitor_type=request.visitor_type,
        church=original.church,
        phone=request.phone,
        email=request.email,
        purpose=request.purpose,
        host_type=request.host_type,
        host_name=request.host_name,
        vehicle_plate=request.vehicle_plate,
        notes=request.notes,
        expected_departure_time=request.expected_departure_time,
        photo_path=(
            original.photo_path
            if request.reuse_existing_photo
            else None
        ),
        badge_path=None,
        check_in_time=datetime.now(),
        check_out_time=None,
        check_out_method=None,
        badge_printed=False,
        badge_printed_time=None,
        # Deterministic carry-over: a returning visit prints at the same station
        # the original visit was captured at. No client override.
        print_station_id=original.print_station_id,
)

    db.add(new_visitor)
    db.commit()
    db.refresh(new_visitor)

    audit(
        current_user,
        "CHECK_IN_RETURNING",
        f"OriginalVisitorID={original.id}, "
        f"NewVisitorID={new_visitor.id}, "
        f"Name={new_visitor.first_name} {new_visitor.last_name}",
    )

    return new_visitor

@app.get("/api/visitors/{visitor_id}/history")
def get_visitor_history(
    visitor_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    history = (
        db.query(Visitor)
        .filter(
            Visitor.first_name == visitor.first_name,
            Visitor.last_name == visitor.last_name,
        )
        .order_by(Visitor.check_in_time.desc())
        .all()
    )

    return {
        "visit_count": len(history),
        "history": history,
    }

@app.post("/api/visitors/bulk-checkout")
def bulk_checkout(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    active_visitors = (
        db.query(Visitor)
        .filter(Visitor.check_out_time.is_(None))
        .all()
    )

    checkout_time = datetime.now()

    for visitor in active_visitors:
        visitor.check_out_time = checkout_time
        visitor.check_out_method = "Bulk Checkout"

    db.commit()

    audit(
        current_user,
        "CHECKOUT_ALL_VISITORS",
        f"Count={len(active_visitors)}",
    )

    return {
        "checked_out_count": len(active_visitors),
        "check_out_time": checkout_time,
        "method": "Bulk Checkout",
    }

@app.get(
    "/api/visitors/find",
    response_model=list[VisitorCheckoutLocatorResponse],
)
def find_visitors(
    first_name: str = "",
    last_name: str = "",
    db: Session = Depends(get_db),
):
    query = db.query(Visitor).filter(
        Visitor.check_out_time.is_(None)
    )

    filters = []

    if first_name.strip():
        filters.append(
            func.lower(Visitor.first_name).contains(
                first_name.strip().lower()
            )
        )

    if last_name.strip():
        filters.append(
            func.lower(Visitor.last_name).contains(
                last_name.strip().lower()
            )
        )

    if filters:
        query = query.filter(or_(*filters))
    else:
        return []
    return (
        query
        .order_by(Visitor.check_in_time.desc())
        .all()
    )

@app.get("/api/visitors/search", response_model=list[VisitorResponse])
def search_visitors(
    q: str = "",
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    search_value = q.strip()
    if not search_value:
        return []
    search_term = f"%{search_value.lower()}%"
    results = (
        db.query(Visitor)
        .filter(
            # Exclude synthetic System records (QR label / printer test
            # placeholders) so they never surface in staff visitor searches.
            Visitor.visitor_type != "System",
            or_(
                func.lower(Visitor.first_name).like(search_term),
                func.lower(Visitor.last_name).like(search_term),
                func.lower(Visitor.phone).like(search_term),
                func.lower(Visitor.church).like(search_term),
                func.lower(Visitor.purpose).like(search_term),
                func.lower(Visitor.host_name).like(search_term),
                func.lower(Visitor.vehicle_plate).like(search_term),
                func.lower(Visitor.notes).like(search_term),
            ),
        )
        .order_by(Visitor.check_in_time.desc())
        .all()
    )

    # TEMPORARY:
    # Collapse duplicate visit records and show only the most recent
    # visitor instance until later Milestone introduces Person/Visit tables.
    latest_visitors = {}
    for visitor in results:
        key = (
            visitor.first_name.strip().lower(),
            visitor.last_name.strip().lower(),
        )

        existing = latest_visitors.get(key)

        if existing is None:
            latest_visitors[key] = visitor
            continue

        if existing.check_out_time and not visitor.check_out_time:
            latest_visitors[key] = visitor

    return list(latest_visitors.values())

@app.get("/api/visitors/{visitor_id}", response_model=VisitorResponse)
def get_visitor(
    visitor_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    return visitor

@app.put("/api/visitors/{visitor_id}", response_model=VisitorResponse)
def update_visitor(
    visitor_id: int,
    visitor_update: VisitorUpdateRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    visitor.first_name = visitor_update.first_name
    visitor.last_name = visitor_update.last_name
    visitor.phone = visitor_update.phone
    visitor.email = visitor_update.email
    visitor.vehicle_plate = visitor_update.vehicle_plate
    visitor.host_name = visitor_update.host_name
    visitor.purpose = visitor_update.purpose
    visitor.visitor_type = visitor_update.visitor_type
    visitor.notes = visitor_update.notes

    db.commit()
    db.refresh(visitor)

    audit(
        current_user,
        "UPDATE_VISITOR",
        f"VisitorID={visitor.id}",
    )

    return visitor

@app.put("/api/visitors/{visitor_id}/checkout", response_model=VisitorResponse)
def checkout_visitor(
    visitor_id: int,
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )
    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )
    if visitor.check_out_time is None:
        visitor.check_out_time = datetime.now()
        visitor.check_out_method = "Manual Checkout"

        db.commit()
        db.refresh(visitor)

        audit(
            "kiosk",
            "CHECK_OUT",
            f"VisitorID={visitor.id}, "
            f"Name={visitor.first_name} {visitor.last_name}, "
            f"Method=Manual Checkout",
        )
    return visitor

@app.post("/api/visitors/{visitor_id}/photo", response_model=VisitorResponse)
def upload_photo(
    visitor_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    file_path = PHOTO_DIR / f"{visitor_id}.jpg"

    image = Image.open(file.file)
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    image.save(file_path, format="JPEG", quality=92)

    visitor.photo_path = f"uploads/photos/{visitor_id}.jpg"
    visitor.badge_path = None

    db.commit()
    db.refresh(visitor)

    return visitor

@app.post("/api/visitors/{visitor_id}/badge", response_model=VisitorResponse)
def generate_badge(
    visitor_id: int,
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    if not visitor.photo_path:
        raise HTTPException(
            status_code=400,
            detail="Visitor photo must be uploaded first",
        )

    badge_path = BADGE_DIR / f"{visitor_id}.png"

    generate_visitor_badge(
        visitor,
        badge_path,
    )

    visitor.badge_path = f"uploads/badges/{visitor.id}.png"

    db.commit()
    db.refresh(visitor)

    audit(
        "kiosk",
        "GENERATE_BADGE",
        f"VisitorID={visitor.id}",
    )

    return visitor

@app.post("/api/visitors/{visitor_id}/print", response_model=PrintJobResponse)
def create_print_job(
    visitor_id: int,
    db: Session = Depends(get_db),
):
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(
            status_code=404,
            detail="Visitor not found",
        )

    if not visitor.badge_path:
        raise HTTPException(
            status_code=400,
            detail="Badge generated first",
        )

    # Station is derived ONLY from the station captured on the visitor at
    # check-in. There is no caller-supplied fallback: if the visitor has no
    # station (or it is disabled), printing fails closed and no job is created.
    if visitor.print_station_id is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "This visitor doesn't have a check-in station yet, so the "
                "badge can't be printed. Please choose a print station and "
                "try again."
            ),
        )

    print_station = (
        db.query(PrintStation)
        .filter(
            PrintStation.id == visitor.print_station_id,
            PrintStation.enabled == True,
        )
        .first()
    )

    if print_station is None:
        raise HTTPException(
            status_code=400,
            detail="The visitor's check-in station is unavailable (maintenance).",
        )

    print_job = PrintJob(
        visitor_id=visitor.id,
        print_station_id=print_station.id,
        badge_path=visitor.badge_path,
        status="Pending",
        created_time=datetime.now(),
    )

    db.add(print_job)
    db.commit()
    db.refresh(print_job)

    audit(
        "kiosk",
        "PRINT_BADGE",
        f"VisitorID={visitor.id}, "
        f"PrintJobID={print_job.id}, "
        f"Station={print_station.slug}",
    )

    return print_job

@app.post("/api/visitors/{visitor_id}/reprint", response_model=PrintJobResponse)
def reprint_badge(
    visitor_id: int,
    request: ReprintBadgeRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Staff-initiated badge reprint (authenticated).

    Unlike the kiosk check-in print path (POST .../print) — which derives the
    station SOLELY from the visitor's check-in station and never accepts a
    caller-supplied station — a reprint is an authenticated staff action that
    may target a DIFFERENT destination station chosen by the operator (for
    example, to reprint a badge at the location where the guest actually is).
    This does not weaken check-in routing: it always creates a NEW print job
    (never reassigns an existing one) and requires a valid, enabled destination
    station. If no destination is supplied it falls back to the visitor's
    check-in station using the same fail-closed rules as check-in printing.
    """
    visitor = (
        db.query(Visitor)
        .filter(Visitor.id == visitor_id)
        .first()
    )

    if visitor is None:
        raise HTTPException(status_code=404, detail="Visitor not found")

    if not visitor.badge_path:
        raise HTTPException(status_code=400, detail="Badge generated first")

    if request.station_id is not None:
        print_station = (
            db.query(PrintStation)
            .filter(
                PrintStation.id == request.station_id,
                PrintStation.enabled == True,
            )
            .first()
        )

        if print_station is None:
            raise HTTPException(
                status_code=400,
                detail="Selected print station not found or unavailable.",
            )
    else:
        if visitor.print_station_id is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This visitor doesn't have a check-in station yet, so the "
                    "badge can't be printed. Please choose a print station and "
                    "try again."
                ),
            )

        print_station = (
            db.query(PrintStation)
            .filter(
                PrintStation.id == visitor.print_station_id,
                PrintStation.enabled == True,
            )
            .first()
        )

        if print_station is None:
            raise HTTPException(
                status_code=400,
                detail="The visitor's check-in station is unavailable (maintenance).",
            )

    print_job = PrintJob(
        visitor_id=visitor.id,
        print_station_id=print_station.id,
        badge_path=visitor.badge_path,
        status="Pending",
        created_time=datetime.now(),
    )

    db.add(print_job)
    db.commit()
    db.refresh(print_job)

    audit(
        current_user,
        "REPRINT_BADGE",
        f"VisitorID={visitor.id}, Station={print_station.slug}",
    )

    return print_job

# Logging unhandled exceptions for debugging purposes
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    app_logger.exception(
        f"Unhandled exception on {request.method} {request.url.path}"
    )
    raise exc

