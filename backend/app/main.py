from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import Body, Depends, FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .auth import (create_access_token, get_current_user, verify_password, hash_password)
from .database import Base, engine
from .dependencies import get_db
from .models import PrintAgent, PrintJob, PrintStation, Visitor, User
from .schemas import (
    LoginRequest,
    LoginResponse,
    PasswordChangeRequest,
    PasswordResetRequest,
    PrintAgentAssign,
    PrintAgentRegister,
    PrintAgentResponse,
    PrintJobCreate,
    PrintJobResponse,
    PrintJobStatusUpdate,
    PrintStationCreate,
    PrintStationHeartbeat,
    PrintStationResponse,
    PrintStationStatsResponse,
    PrintStationUpdate,
    ReturningVisitorCheckInRequest,
    UserCreate,
    UserResponse,
    UserStatusUpdate,
    UserUpdate,
    VisitorCreate,
    VisitorResponse,
    VisitorUpdateRequest,
)
from .services.badge_service import generate_visitor_badge

from sqlalchemy.orm import Session
from .bootstrap import create_default_admin

Base.metadata.create_all(bind=engine)

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
)


BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"

# UPLOAD_DIR = Path("uploads")
PHOTO_DIR = UPLOAD_DIR / "photos"
BADGE_DIR = UPLOAD_DIR / "badges"

PHOTO_DIR.mkdir(parents=True, exist_ok=True)
BADGE_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

VALID_PRINT_JOB_STATUSES = {
    "Pending",
    "Printing",
    "Completed",
    "Failed",
}


@app.get("/")
def root():
    return {
        "application": "PBC Visitor Kiosk",
        "version": "1.0",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "authentication": "database",
    }


@app.post("/api/auth/login",response_model=LoginResponse)
def login(    
    request: LoginRequest,
    db: Session = Depends(get_db),
):

    print(f"Login attempt: {request.username}")

    user = (
        db.query(User)
        .filter(User.username == request.username)
        .first()
    )

    print(f"User found: {user is not None}")

    if user:
        print(f"Stored hash: {user.password_hash}")

        result = verify_password(
            request.password,
            user.password_hash
        )

        print(f"Password match: {result}")

    user = (
        db.query(User)
        .filter(User.username == request.username)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    if not user.enabled:
        raise HTTPException(
            status_code=403,
            detail="Account disabled",
        )

    if not verify_password(
        request.password,
        user.password_hash,
    ):
        user.failed_login_count += 1
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    user.failed_login_count = 0
    user.last_login = datetime.now()

    db.commit()

    token = create_access_token(
        user.username
    )

    return LoginResponse(
        access_token=token,
        token_type="bearer",
    )


@app.post("/api/change-password")
def change_password(
    request: PasswordChangeRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.username == current_user)
        .first()
    )

    if not user:
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
            detail="Current password is incorrect",
        )

    user.password_hash = hash_password(
        request.new_password
    )
    user.password_changed_date = datetime.now()
    user.must_change_password = False

    db.commit()

    return {
        "status": "success",
        "message": "Password updated successfully",
    }


@app.get("/api/me")
def get_me(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(User.username == current_user)
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
    db: Session = Depends(get_db),
):
    agents = (
        db.query(PrintAgent)
        .order_by(PrintAgent.hostname.asc())
        .all()
    )

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

@app.post("/api/print-agents/register",response_model=PrintAgentResponse,)
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
        agent = PrintAgent(
            agent_key=request.agent_key or str(uuid4()),
            hostname=request.hostname,
            printer_name=request.printer_name,
            agent_version=request.agent_version,
            enabled=True,
        )

        db.add(agent)

    assigned_station = None

    if agent.print_station_id is not None:
        assigned_station = (
            db.query(PrintStation)
            .filter(PrintStation.id == agent.print_station_id)
            .first()
        )

    agent.hostname = request.hostname
    agent.printer_name = request.printer_name
    agent.agent_version = request.agent_version
    agent.last_seen = datetime.utcnow()
    agent.last_ip = http_request.client.host

    db.commit()
    db.refresh(agent)

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

@app.get("/api/print-jobs/{print_job_id}/badge-image")
def get_print_job_badge_image(
    print_job_id: int,
    db: Session = Depends(get_db),
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


@app.get("/api/print-jobs")
def get_print_jobs(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    jobs = db.query(PrintJob).order_by(PrintJob.created_time.desc()).all()

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
            "badge_path": job.badge_path,
            "status": job.status,
            "printer_name": job.printer_name,
            "error_message": job.error_message,
            "created_time": job.created_time,
            "claimed_time": job.claimed_time,
            "completed_time": job.completed_time,
        })

    return results


@app.get("/api/print-jobs/pending",response_model=list[PrintJobResponse],)
def get_pending_print_jobs(
    station: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(PrintJob)

    query = query.filter(
        PrintJob.status == "Pending"
    )

    if station:
        print_station = (
            db.query(PrintStation)
            .filter(
                PrintStation.slug == station,
                PrintStation.enabled == True,
            )
            .first()
        )

        if print_station:
            query = query.filter(
                PrintJob.print_station_id == print_station.id
            )

    return query.order_by(PrintJob.created_time.asc()).all()

@app.put("/api/print-jobs/{print_job_id}/claim", response_model=PrintJobResponse)
def claim_print_job(
    print_job_id: int,
    printer_name: str = "Unspecified Printer",
    db: Session = Depends(get_db),
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

    if print_job.status != "Pending":
        raise HTTPException(
            status_code=409,
            detail=f"Job already {print_job.status}",
        )

    print_job.status = "Printing"
    print_job.printer_name = printer_name
    print_job.claimed_time = datetime.now()

    db.commit()
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

    return {
        "status": "success",
        "deleted": deleted,
    }

@app.put("/api/print-jobs/{print_job_id}/status", response_model=PrintJobResponse)
def update_print_job_status(
    print_job_id: int,
    status_update: PrintJobStatusUpdate,
    db: Session = Depends(get_db),
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

    normalized_status = status_update.status.strip().title()

    if normalized_status not in VALID_PRINT_JOB_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid print job status: {status_update.status}",
        )

    print_job.status = normalized_status
    print_job.printer_name = status_update.printer_name or print_job.printer_name
    print_job.error_message = status_update.error_message

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

    return {"status": "deleted"}

@app.get("/api/print-stations",response_model=list[PrintStationResponse])
def get_print_stations(
    db: Session = Depends(get_db)
):
    return (
        db.query(PrintStation)
        .order_by(PrintStation.name.asc())
        .all()
    )

@app.post("/api/print-stations",response_model=PrintStationResponse,)
def create_print_station(
    request: PrintStationCreate,
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

@app.put("/api/print-stations/{station_id}",response_model=PrintStationResponse,)
def update_print_station(
    station_id: int,
    request: PrintStationUpdate,
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

    return station


@app.delete("/api/print-stations/{station_id}")
def delete_print_station(
    station_id: int,
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

    station.enabled = False

    db.commit()

    return {
        "message": f"Print station '{station.name}' disabled"
    }

@app.post("/api/print-stations/heartbeat")
def print_station_heartbeat(
    request: PrintStationHeartbeat,
    http_request: Request,
    db: Session = Depends(get_db),
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

@app.get("/api/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return user

@app.get("/api/users", response_model=list[UserResponse])
def get_users(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(User).order_by(User.username).all()

@app.post("/api/users",response_model=UserResponse)
def create_user(
    request: UserCreate,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(User)
        .filter(User.username == request.username)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    user = User(
        username=request.username,
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

    return user

@app.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdate,
    current_user: str = Depends(get_current_user),
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

    return user

@app.post("/api/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    request: PasswordResetRequest,
    current_user: str = Depends(get_current_user),
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

    return {
        "status": "success",
        "message": "Password reset successfully"
    }

@app.put("/api/users/{user_id}/status",response_model=UserResponse,)
def update_user_status(
    user_id: int,
    request: UserStatusUpdate,
    current_user: str = Depends(get_current_user),
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

    return user

@app.post("/api/visitors", response_model=VisitorResponse)
def create_visitor(
    visitor: VisitorCreate,
    db: Session = Depends(get_db),
):
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
    )

    db.add(db_visitor)
    db.commit()
    db.refresh(db_visitor)

    return db_visitor

@app.get("/api/visitors", response_model=list[VisitorResponse])
def get_visitors(
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
            ),
        )

    new_visitor = Visitor(
        first_name=request.first_name if hasattr(request, "first_name") else original.first_name,
        last_name=request.last_name if hasattr(request, "last_name") else original.last_name,
        visitor_type=request.visitor_type,
        church=original.church,
        phone=original.phone,
        email=original.email,
        purpose=request.purpose,
        host_type=original.host_type,
        host_name=request.host_name,
        vehicle_plate=original.vehicle_plate,
        notes=original.notes,
        expected_departure_time=None,
        photo_path=original.photo_path if request.reuse_existing_photo else None,
        badge_path=None,
        check_in_time=datetime.now(),
        check_out_time=None,
        check_out_method=None,
        badge_printed=False,
        badge_printed_time=None,
    )

    db.add(new_visitor)
    db.commit()
    db.refresh(new_visitor)

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

    return {
        "checked_out_count": len(active_visitors),
        "check_out_time": checkout_time,
        "method": "Bulk Checkout",
    }

@app.get("/api/visitors/find", response_model=list[VisitorResponse])
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

    return (
        db.query(Visitor)
        .filter(
            or_(
                func.lower(Visitor.first_name).like(search_term),
                func.lower(Visitor.last_name).like(search_term),
                func.lower(Visitor.phone).like(search_term),
                func.lower(Visitor.church).like(search_term),
                func.lower(Visitor.purpose).like(search_term),
                func.lower(Visitor.host_name).like(search_term),
                func.lower(Visitor.vehicle_plate).like(search_term),
                func.lower(Visitor.notes).like(search_term),
            )
        )
        .order_by(Visitor.check_in_time.desc())
        .all()
    )

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

    return visitor

@app.post("/api/visitors/{visitor_id}/print", response_model=PrintJobResponse)
def create_print_job(
    visitor_id: int,
    request: PrintJobCreate | None = Body(default=None),
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

    if request is not None:
        print_station_id = request.station

    print_station = (
        db.query(PrintStation)
        .filter(
            PrintStation.slug == request.station,
            PrintStation.enabled == True,
        )
        .first()
    )

    if print_station is None:
        raise HTTPException(
            status_code=400,
            detail=f"Print station {request.station} was not found.",
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

    return print_job




