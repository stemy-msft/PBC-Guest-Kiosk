import shutil

from datetime import datetime
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from PIL import Image, ImageOps
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from .database import Base, engine
from .dependencies import get_db
from .models import PrintJob, Visitor
from .schemas import (
    PrintJobResponse,
    PrintJobStatusUpdate,
    VisitorCreate,
    VisitorResponse,
)
from .services.badge_service import generate_visitor_badge

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PBC Visitor Kiosk",
    version="0.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
PHOTO_DIR = UPLOAD_DIR / "photos"
BADGE_DIR = UPLOAD_DIR / "badges"

PHOTO_DIR.mkdir(parents=True, exist_ok=True)
BADGE_DIR.mkdir(parents=True, exist_ok=True)

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
        "version": "0.1",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
    }


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
        purpose=visitor.purpose,
        host_type=visitor.host_type,
        host_name=visitor.host_name,
        vehicle_plate=visitor.vehicle_plate,
        notes=visitor.notes,
        expected_departure_time=visitor.expected_departure_time,
        check_in_time=datetime.utcnow(),
        badge_printed=False,
    )

    db.add(db_visitor)
    db.commit()
    db.refresh(db_visitor)

    return db_visitor

@app.get("/api/visitors", response_model=list[VisitorResponse])
def get_visitors(db: Session = Depends(get_db)):
    return (
        db.query(Visitor)
        .order_by(Visitor.check_in_time.desc())
        .all()
    )


@app.get("/api/visitors/active", response_model=list[VisitorResponse])
def get_active_visitors(db: Session = Depends(get_db)):
    return (
        db.query(Visitor)
        .filter(Visitor.check_out_time.is_(None))
        .order_by(Visitor.check_in_time.desc())
        .all()
    )


@app.post("/api/visitors/bulk-checkout")
def bulk_checkout(db: Session = Depends(get_db)):
    active_visitors = (
        db.query(Visitor)
        .filter(Visitor.check_out_time.is_(None))
        .all()
    )

    checkout_time = datetime.utcnow()

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
        Visitor.check_out_time == None
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

    return query.all()

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
        visitor.check_out_time = datetime.utcnow()
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
        raise HTTPException(status_code=404, detail="Visitor not found")

    file_path = PHOTO_DIR / f"{visitor_id}.jpg"

    image = Image.open(file.file)
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    image.save(file_path, format="JPEG", quality=92)

    visitor.photo_path = str(file_path)
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

    visitor.badge_path = str(badge_path)

    db.commit()
    db.refresh(visitor)

    return visitor


@app.post("/api/visitors/{visitor_id}/print",response_model=PrintJobResponse)
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
            detail="Badge must be generated first",
        )

    print_job = PrintJob(
        visitor_id=visitor.id,
        badge_path=visitor.badge_path,
        status="Pending",
        created_time=datetime.utcnow(),
    )

    db.add(print_job)
    db.commit()
    db.refresh(print_job)

    return print_job


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

@app.get("/api/print-jobs",response_model=list[PrintJobResponse])
def get_print_jobs(
    db: Session = Depends(get_db),
):
    return (
        db.query(PrintJob)
        .order_by(PrintJob.created_time.desc())
        .all()
    )


@app.get("/api/print-jobs/pending",response_model=list[PrintJobResponse])
def get_pending_print_jobs(
    db: Session = Depends(get_db),
):
    return (
        db.query(PrintJob)
        .filter(PrintJob.status == "Pending")
        .order_by(PrintJob.created_time.asc())
        .all()
    )


@app.put("/api/print-jobs/{print_job_id}/claim",response_model=PrintJobResponse)
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
    print_job.claimed_time = datetime.utcnow()

    db.commit()
    db.refresh(print_job)

    return print_job


@app.put("/api/print-jobs/{print_job_id}/status",response_model=PrintJobResponse)
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
    print_job.printer_name = (
        status_update.printer_name
        or print_job.printer_name
    )
    print_job.error_message = status_update.error_message

    if normalized_status == "Completed":
        print_job.completed_time = datetime.utcnow()

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