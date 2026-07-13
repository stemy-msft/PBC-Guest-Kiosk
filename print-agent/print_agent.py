import os
import time
from pathlib import Path

import requests


API_BASE = "http://192.168.0.210:8000"
PRINTER_NAME = "Brother QL-800"
POLL_SECONDS = 3
PRINT_DELAY_SECONDS = 8

DOWNLOAD_DIR = Path.home() / "PBCVisitorKioskPrintJobs"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_pending_jobs():
    response = requests.get(f"{API_BASE}/api/print-jobs/pending", timeout=10)
    response.raise_for_status()
    return response.json()


def claim_job(job_id):
    response = requests.put(
        f"{API_BASE}/api/print-jobs/{job_id}/claim",
        params={"printer_name": PRINTER_NAME},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def download_badge(job_id):
    response = requests.get(
        f"{API_BASE}/api/print-jobs/{job_id}/badge-image",
        timeout=30,
    )
    response.raise_for_status()

    file_path = DOWNLOAD_DIR / f"print-job-{job_id}.png"

    with open(file_path, "wb") as file:
        file.write(response.content)

    return file_path


def print_badge(file_path):
    os.startfile(str(file_path), "print")
    time.sleep(PRINT_DELAY_SECONDS)


def update_job_status(job_id, status, error_message=None):
    payload = {
        "status": status,
        "printer_name": PRINTER_NAME,
        "error_message": error_message,
    }

    response = requests.put(
        f"{API_BASE}/api/print-jobs/{job_id}/status",
        json=payload,
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def process_job(job):
    job_id = job["id"]

    try:
        print(f"Claiming print job {job_id}")
        claim_job(job_id)

        print(f"Downloading badge for print job {job_id}")
        badge_path = download_badge(job_id)

        print(f"Printing {badge_path}")
        print_badge(badge_path)

        print(f"Marking print job {job_id} completed")
        update_job_status(job_id, "Completed")

    except Exception as error:
        print(f"Print job {job_id} failed: {error}")

        try:
            update_job_status(job_id, "Failed", str(error))
        except Exception as status_error:
            print(f"Could not update print job {job_id} failure status: {status_error}")


def main():
    print("PBC Visitor Kiosk print agent started")
    print(f"API base: {API_BASE}")
    print(f"Printer name: {PRINTER_NAME}")
    print(f"Polling every {POLL_SECONDS} seconds")

    while True:
        try:
            jobs = get_pending_jobs()

            if jobs:
                print(f"Found {len(jobs)} pending print job(s)")

            for job in jobs:
                process_job(job)

        except Exception as error:
            print(f"Print agent polling error: {error}")

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()