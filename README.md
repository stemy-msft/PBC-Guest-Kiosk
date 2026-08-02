# PBC Visitor Kiosk

A self-service or staff-driven visitor management and badge printing solution designed for camps, churches, conferences, and other organizations that need a simple, secure visitor check-in experience.

The kiosk allows guests to check in from a staffed desktop, a self-service kiosk, or their own personal mobile device, capture a photo, generate a visitor badge, and automatically print the badge through a network-connected print server.

## Features

- Visitor self check-in
- Visitor self check-out
- Photo capture using tablet, iPad, or webcam
- Automatic visitor badge generation
- Network-based badge printing
- Touch-friendly kiosk interface
- Centralized visitor database
- Print queue management
- Raspberry Pi print server support
- Brother QL-800 badge printer support

---

## System Architecture

```text
Visitor / Guest
        │
        ▼
Frontend (React/Vite)
        │
        ▼
Backend API (FastAPI)
        │
        ├── Visitor Database
        │
        └── Print Job Queue
                │
                ▼
      Raspberry Pi Print Agent
                │
                ▼
         CUPS Print Queue
                │
                ▼
        Brother QL-800 Printer
```

---

## Repository Structure

```text
PBC-guest-kiosk/
│
├── frontend/           React/Vite user interface
├── backend/            FastAPI backend and API
├── print-agent/        Raspberry Pi print service
├── docs/               Documentation
│
├── .env                Backend configuration (created locally from .env.example; git-ignored, never committed)
└── README.md
```

---

## Components

### Frontend

The frontend provides the touch-friendly kiosk experience.

Responsibilities:

- Visitor check-in
- Visitor check-out
- Photo capture
- Badge preview
- Administrative functions

Technology:

- React
- Vite
- JavaScript

---

### Backend

The backend serves as the central application server.

Responsibilities:

- Visitor management
- Badge generation
- API endpoints
- Print job queue
- Image storage
- Authentication

Technology:

- FastAPI
- Python
- SQLite

---

### Print Agent

The print agent is designed to run on a dedicated print server, typically a Raspberry Pi.

Responsibilities:

- Poll for pending print jobs
- Download generated badge images
- Send badges to the printer
- Report print status back to the backend

Technology:

- Python
- Requests
- CUPS

---

## Supported Hardware

### Tested Configuration

#### Backend Server

- Windows 11
- Python 3.12+ (3.13 tested)

#### Print Server

- Raspberry Pi OS Lite (64-bit)
- Raspberry Pi 3B tested; Pi 4 or newer recommended

#### Printer

- Brother QL-800

---

## Configuration

### Backend Configuration

The backend loads configuration from a git-ignored `.env` in the repository
root. Create it by copying the tracked example:

```powershell
Copy-Item .env.example .env   # Windows PowerShell (tested backend host)
```

```bash
cp .env.example .env          # macOS/Linux
```

`.env.example` is the authoritative, fully commented list of backend variables
(JWT signing, administrator bootstrap, account lockout, CORS, upload limits, and
badge theme). See [docs/02-Deployment/QuickStart.md](docs/02-Deployment/QuickStart.md)
for step-by-step setup. Never commit the real `.env`.

---

### Print Agent Configuration

Environment variables supported by the print agent. The authoritative, fully
commented list is `print-agent/.env.example`:

| Variable | Description |
|-----------|-------------|
| PBC_API_BASE | Backend API URL |
| PBC_PRINTER_NAME | CUPS printer queue name |
| PBC_PRINT_AGENT_POLL_SECONDS | Poll interval (seconds); default `2` |
| PBC_PRINT_TIMEOUT_SECONDS | Per-job print timeout |
| PBC_PRINT_DOWNLOAD_DIR | Temporary badge download location |
| PBC_PRINT_AGENT_TOKEN | Agent bearer token (self-populated on first registration) |
| PBC_PRINT_AGENT_KEY | Agent identity key (self-populated on first registration) |
| PBC_PRINT_STATION_SLUG | Print station this agent serves (self-populated on assignment) |

Example:

```env
PBC_API_BASE=http://your-backend-host:8000
PBC_PRINTER_NAME=QL800_BROTHER
PBC_PRINT_AGENT_POLL_SECONDS=2
```

---

## Printer Configuration

The tested production queue is `QL800_BROTHER`, configured with
`PageSize=62x100`, `BrPriority=BrQuality`, and `BrBrightness=15` (correct badge
sizing, improved grayscale quality, and reliable printing).

The full, authoritative print-server setup — driver options, queue creation, and
these settings — lives in [docs/PRINT-SERVER.md](docs/PRINT-SERVER.md). Treat it
as the single source of truth for printer configuration.

---

## Deployment Overview

> **Canonical deployment docs:** see **[docs/02-Deployment/](docs/02-Deployment/README.md)**
> — start with [QuickStart.md](docs/02-Deployment/QuickStart.md), and read
> [ProductionReadiness.md](docs/02-Deployment/ProductionReadiness.md) before any
> production use. The commands below are a quick foreground reference for
> evaluation.
>
> These commands run each service in the foreground for evaluation. Packaging
> the backend as an auto-starting Windows service (unattended production
> hosting) is a Milestone 10 (RTM) task and is not yet documented.

> **Developing or maintaining the kiosk?** See
> **[docs/05-Development/](docs/05-Development/README.md)** for local development
> setup, repository structure, the change workflow, testing, database and
> dependency maintenance, release management, and maintainer handoff.

### Backend

```powershell
# Windows PowerShell (tested backend host)
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
# macOS/Linux
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend

npm install
npm run dev
```

### Print Agent (Raspberry Pi / Linux)

```bash
cd print-agent

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

python print_agent.py
```

---

## Validation Checklist

A successful deployment should be able to:

- Load the kiosk UI
- Check in a visitor
- Capture a visitor photo
- Generate a badge image
- Create a print job
- Have the print agent claim the job
- Print the badge automatically

---

## Known Working Scenario

The following workflow has been successfully tested:

- iPad visitor check-in
- Frontend badge creation
- Backend print queue creation
- Raspberry Pi print agent polling
- Badge download by print agent
- Automatic printing through a Brother QL-800 printer

This configuration is currently considered the project's validated end-to-end printing workflow.

---

## Project Status

Current Status: **Release Candidate 2 (`1.0.0-rc.2`) — RC2 ready** · **Milestone 10 (RTM) next**

M8 ("Beta 2 / Feature Complete") was closed on 2026-07-31 after real-device validation
(Android phone, iPad Safari/Chrome, Amazon Fire tablet, Pixel 9 Pro XL, Desktop — all
portrait + landscape PASS). Milestone 9 (RC1 hardening) is complete.

Completed:

- Visitor check-in workflow
- Badge generation
- Print job queueing
- Raspberry Pi print agent
- Brother QL-800 integration
- End-to-end badge printing
- Visitor notes, history, returning-visitor workflow, badge reprint
- Station ownership + agent lease model; multi-agent per station; multi-station routing
- Print-job redirection between stations
- Guest print-status workflow; emergency active-visitor export; expanded audit coverage
- Responsive mobile + tablet layouts; Android camera workflow

Milestone 9 (RC1) — complete:

- M9.1 Recovery & backup (backup/restore tooling, disaster-recovery runbook)
- M9.2 Monitoring & operational visibility (`/health`, `/health/live`, dashboard)
- M9.3 Security hardening (F-008 CORS, F-009 account lockout, F-010 upload boundaries)
- M9.4 RC1 stabilization and release-identity reconciliation

Next (Milestone 10 — RTM):

- Deployment / containerization
- Production release-to-manufacturing work

---

## License

This project is intended for use by Palmetto Bible Camp and related organizations.

Review repository licensing before redistribution.
