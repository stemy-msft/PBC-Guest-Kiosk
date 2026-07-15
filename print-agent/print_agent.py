import os
import subprocess
import time
from pathlib import Path

import requests

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

API_BASE = os.environ.get("PBC_API_BASE", "http://192.168.0.210:8000").rstrip("/")
PRINTER_NAME = os.environ.get("PBC_PRINTER_NAME", "QL800_BROTHER")
POLL_SECONDS = int(os.environ.get("PBC_PRINT_AGENT_POLL_SECONDS", "2"))
PRINT_TIMEOUT_SECONDS = int(os.environ.get("PBC_PRINT_TIMEOUT_SECONDS", "60"))
DOWNLOAD_DIR = Path(os.environ.get("PBC_PRINT_DOWNLOAD_DIR", "./downloaded-badges"))
AGENT_TOKEN = os.environ.get("PBC_PRINT_AGENT_TOKEN", "")


DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def auth_headers():
    if not AGENT_TOKEN:
        return {}

    return {
        "Authorization": f"Bearer {AGENT_TOKEN}",
    }


def get_pending_jobs():
    response = requests.get(
        f"{API_BASE}/api/print-jobs/pending",
        headers=auth_headers(),
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def claim_job(job_id):
    response = requests.put(
        f"{API_BASE}/api/print-jobs/{job_id}/claim",
        params={"printer_name": PRINTER_NAME},
        headers=auth_headers(),
        timeout=10,
    )

    if response.status_code == 409:
        return None

    response.raise_for_status()
    return response.json()


def download_badge(job_id):
    response = requests.get(
        f"{API_BASE}/api/print-jobs/{job_id}/badge-image",
        headers=auth_headers(),
        timeout=30,
    )
    response.raise_for_status()

    badge_path = DOWNLOAD_DIR / f"print-job-{job_id}.png"

    with open(badge_path, "wb") as badge_file:
        badge_file.write(response.content)

    return badge_path


def mark_job_status(job_id, status, error_message=None):
    payload = {
        "status": status,
        "printer_name": PRINTER_NAME,
        "error_message": error_message,
    }

    response = requests.put(
        f"{API_BASE}/api/print-jobs/{job_id}/status",
        json=payload,
        headers=auth_headers(),
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def print_badge(badge_path):
    command = [
        "lp",
        "-d",
        PRINTER_NAME,
        str(badge_path),
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=True,
    )

    output = result.stdout.strip()
    print(output)

    request_id = parse_cups_request_id(output)

    if request_id:
        wait_for_cups_job_to_finish(request_id)


def parse_cups_request_id(lp_output):
    words = lp_output.split()

    for word in words:
        if word.startswith(f"{PRINTER_NAME}-"):
            return word

    return None


def wait_for_cups_job_to_finish(request_id):
    deadline = time.time() + PRINT_TIMEOUT_SECONDS

    while time.time() < deadline:
        result = subprocess.run(
            ["lpstat", "-o"],
            capture_output=True,
            text=True,
            check=False,
        )

        if request_id not in result.stdout:
            return

        time.sleep(1)

    raise TimeoutError(f"CUPS print job {request_id} did not finish within {PRINT_TIMEOUT_SECONDS} seconds")


def process_job(job):
    job_id = job["id"]

    print(f"Claiming print job {job_id}")
    claimed_job = claim_job(job_id)

    if claimed_job is None:
        print(f"Print job {job_id} was already claimed")
        return

    try:
        print(f"Downloading badge for print job {job_id}")
        badge_path = download_badge(job_id)

        print(f"Printing badge for print job {job_id} to {PRINTER_NAME}")
        print_badge(badge_path)

        print(f"Marking print job {job_id} completed")
        mark_job_status(job_id, "Completed")

    except Exception as error:
        print(f"Print job {job_id} failed: {error}")

        try:
            mark_job_status(job_id, "Failed", str(error))
        except Exception as status_error:
            print(f"Failed to update failed status for print job {job_id}: {status_error}")


def main():
    print("PBC Visitor Kiosk print agent started")
    print(f"API base: {API_BASE}")
    print(f"Printer name: {PRINTER_NAME}")
    print(f"Download directory: {DOWNLOAD_DIR.resolve()}")
    print(f"Polling every {POLL_SECONDS} second(s)")

    while True:
        try:
            pending_jobs = get_pending_jobs()

            if pending_jobs:
                print(f"Found {len(pending_jobs)} pending print job(s)")

            for job in pending_jobs:
                process_job(job)

        except Exception as error:
            print(f"Print agent polling error: {error}")

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()