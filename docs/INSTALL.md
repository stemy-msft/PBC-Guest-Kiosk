# Installation Guide

This document walks through deploying the PBC Visitor Kiosk from a fresh clone of the repository.

---

# Deployment Order

For complete deployment instructions, review the documentation in the following order:

1. INSTALL.md
2. PRINT-SERVER.md
3. ADMINISTRATION.md
4. TROUBLESHOOTING.md

---

# Prerequisites

## Backend Server

Recommended:

- Windows 11
- Python 3.12+
- Git

## Frontend

- Node.js 20+
- npm

## Print Server

- Raspberry Pi OS
- Python 3.12+
- Git
- CUPS

## Printer

- Brother QL-800

---

# Clone Repository

```bash
git clone <repository-url>
cd PBC-guest-kiosk
```

---

# Backend Setup

Navigate to the backend folder:

```bash
cd backend
```

Create virtual environment:

```bash
python -m venv .venv
```

Activate virtual environment:

Windows:

```powershell
.venv\Scripts\activate
```

Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

# Backend Configuration

The backend loads configuration from:

```text
PBC-guest-kiosk/.env
```

Create it by copying the tracked example and filling in real values. The real
`.env` is git-ignored and must **never** be committed.

```bash
cp .env.example .env         # macOS/Linux
Copy-Item .env.example .env  # Windows PowerShell
```

Required and optional variables:

```env
# REQUIRED — session signing key. Use a long, random secret.
# Changing this value invalidates all existing login sessions.
JWT_SECRET_KEY=replace-with-a-long-random-secret

# Optional (defaults shown)
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480

# Initial administrator bootstrap (optional; defaults shown). The first
# administrator is created only when no admin exists yet, with
# "must change password" enabled so it must be changed at first login.
PBC_DEFAULT_ADMIN_USERNAME=admin
PBC_DEFAULT_ADMIN_PASSWORD=replace-with-a-strong-password
PBC_DEFAULT_ADMIN_DISPLAY_NAME=Administrator
```

Note: `DATABASE_URL` and `STAFF_USERNAME`/`STAFF_PASSWORD` are no longer used by
the backend and have been removed from the examples.

---

# CORS Configuration

The backend restricts which browser origins may call the API. Authentication
uses bearer tokens (not cookies), so credentialed CORS is disabled and the
allowlist never uses a wildcard.

Two variables control this:

```env
# "development" (default) or "production"
PBC_ENV=production

# Comma-separated exact origins (scheme://host[:port], no trailing slash/path)
PBC_CORS_ALLOWED_ORIGINS=https://kiosk.example.org,https://admin.example.org
```

Behavior:

- **development** — if `PBC_CORS_ALLOWED_ORIGINS` is unset, safe localhost
  defaults (`http://localhost:5173`, `http://127.0.0.1:5173`) are applied so a
  fresh checkout runs without extra configuration.
- **production** — `PBC_CORS_ALLOWED_ORIGINS` is **required**. The backend
  fails fast and refuses to start if it is empty.
- List every browser origin that serves the kiosk or admin UI. If the UI and
  API are served **same-origin** behind a reverse proxy, that path needs no
  CORS entry.
- Malformed origins and any wildcard/explicit-origin mix are rejected at
  startup rather than silently broadening access.

---

# Upload / Image Limits

User-supplied images (visitor photos, theme logos) are bounded to protect the
server. Every upload is decoded through Pillow and re-encoded, which strips any
embedded payload. All variables are optional; defaults are applied if unset.

```env
# Visitor photos (public kiosk check-in)
PBC_MAX_PHOTO_UPLOAD_BYTES=5242880   # 5 MB; larger uploads are rejected (413)
PBC_MAX_PHOTO_DIMENSION=1600         # longest edge in px; larger is downscaled

# Theme logos (admin only)
PBC_MAX_LOGO_UPLOAD_BYTES=2097152    # 2 MB
PBC_MAX_LOGO_DIMENSION=512

# Global decoded-pixel ceiling (decompression-bomb guard)
PBC_MAX_IMAGE_PIXELS=24000000
```

Behavior:

- The byte cap is enforced **before** decoding, so oversized files are
  rejected without spending memory on them.
- Files that are not valid images (wrong type, truncated, or that exceed
  `PBC_MAX_IMAGE_PIXELS` when decoded) are rejected with HTTP 400.
- Stored filenames are derived from server-side identifiers (the integer
  visitor id, or a sanitized theme id), so the uploaded filename cannot direct
  where the file is written.

---

# Account Lockout

The login endpoint has brute-force protection. System Settings (in the admin UI)
is the runtime source of truth; the environment variables below provide the
startup default when a settings value is unset.

```env
PBC_LOGIN_LOCKOUT_THRESHOLD=5    # consecutive failures before lock; 0 disables
PBC_LOGIN_LOCKOUT_MINUTES=15     # lock duration before automatic unlock
```

Behavior:

- After `THRESHOLD` consecutive failed logins, the account is locked for
  `MINUTES`, after which it auto-unlocks on the next attempt.
- A threshold of `0` disables lockout entirely.
- Disabled accounts and unknown users are rejected regardless of lockout state.

---

# Badge Rendering

Visitor badges are generated using a named theme:

```env
PBC_BADGE_THEME=PBC_standard   # optional; default shown
```

Set this only to select a different badge layout known to the badge service.

---

# Health & Monitoring

The backend exposes two probes for uptime monitoring:

```text
GET /health/live   # liveness: always 200 {"status":"alive"}; no dependencies
GET /health        # readiness: 200 when healthy, 503 when a critical
                   #   dependency (database, upload dirs, config, backup) fails
```

- Point a load balancer / process supervisor at `/health/live` — it is cheap
  and never touches the database or filesystem.
- Point uptime/alerting at `/health` — it verifies real dependencies and
  returns **503** when the service cannot serve check-in, so it distinguishes
  "process up" from "able to serve".
- `/health` also reports the running product `version`/`release` and print
  infrastructure status (informational; never flips the result to unhealthy).

---

# System Settings File

The backend also loads site-specific runtime settings (theme, check-in URL,
visitor types, purposes, required fields) from:

```text
PBC-guest-kiosk/backend/config/system_settings.json
```

This live file is **git-ignored** and site-specific. On startup the backend
automatically seeds it from the tracked template
(`system_settings.template.json`) when it is missing, so a fresh install works
out of the box. To customize before first launch, you can also copy it manually:

```bash
cd backend/config
cp system_settings.template.json system_settings.json          # macOS/Linux
Copy-Item system_settings.template.json system_settings.json    # Windows PowerShell
```

Then edit `system_settings.json` and set `base_checkin_url` to your kiosk's
address (the template ships a placeholder, `http://your-kiosk-host.example.com`).
Runtime changes made through the admin Settings screen are written back to this
local file and are intentionally **not** committed to Git.

---

# Start Backend

From the backend directory:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Verify:

```bash
curl http://kiosk-backend.domain.local:8000
```

Expected response:

```json
{
  "application": "PBC Visitor Kiosk",
  "version": "0.1"
}
```

---

# Frontend Setup

Navigate to the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Build production version:

```bash
npm run build
```

# Backend Configuration

Create the file if it does not exist.

Example:

```env
VITE_API_BASE=http://192.168.0.210:8000
```

---

# Print Agent Setup

Navigate to the print-agent folder:

```bash
cd print-agent
```

Create virtual environment:

```bash
python -m venv .venv
```

Activate:

```bash
source .venv/bin/activate
```

Install requirements:

```bash
pip install -r requirements.txt
```

---

# Print Agent Configuration

Recommended environment variables:

```env
PBC_API_BASE=http://kiosk-backend.domain.local:8000
PBC_PRINTER_NAME=QL800_BROTHER
PBC_PRINT_AGENT_POLL_SECONDS=2
PBC_PRINT_TIMEOUT_SECONDS=60
PBC_PRINT_DOWNLOAD_DIR=./downloaded-badges
```

---

# Start Print Agent

```bash
python print_agent.py
```

Expected startup:

```text
PBC Visitor Kiosk print agent started
API base: http://kiosk-backend.domain.local:8000
Printer name: QL800_BROTHER
Download directory: ./downloaded-badges
Polling every 2 second(s)
```

---

## Supported Configuration

This project is currently validated on:

Backend
--------
Host: Windows 11
IP Address: 192.168.0.210
Port: 8000

Frontend
---------
Host: Windows 11
IP Address: 192.168.0.210
Port: 5173

Print Agent
-----------
Host: Raspberry Pi 3B
OS: Raspberry Pi OS Lite (64-bit)
Python: 3.13
IP Address: 192.168.0.124
Mode: Polling Client
Poll Interval: 3 seconds

Printer
--------
Model: Brother QL-800
Connection: USB
Queue: QL800_BROTHER
Driver: ql800pdrv 2.1.4-0

Queue Settings
--------------
PageSize=62x100
BrPriority=BrQuality
BrBrightness=15

Validated Workflow
------------------
iPad Check-In
Photo Capture
Badge Generation
Print Job Creation
Print Agent Polling
Badge Download
Badge Printing

---

# Validation Checklist

Verify the following:

- Backend starts successfully
- Frontend loads
- Print agent starts
- Print agent connects to backend
- Visitor can check in
- Badge is generated
- Print job is created
- Print agent claims print job
- Badge prints successfully from the Brother QL-800

Deployment is complete once a visitor badge can be printed through the full workflow.

---

# Architecture Note

The Print Agent does not expose an HTTP endpoint and does not listen on a network port.

The Print Agent operates as a polling client that periodically queries the backend for pending print jobs.

Backend Port: 8000
Frontend Port: 5173
Print Agent Port: None

## System Architecture

The PBC Visitor Kiosk consists of four major components:

```text
┌─────────────────────┐
│ Visitor / Staff     │
│ iPad / Tablet       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Frontend            │
│ React / Vite        │
│ Port 5173           │
└──────────┬──────────┘
           │ HTTP API
           ▼
┌─────────────────────┐
│ Backend             │
│ FastAPI             │
│ Port 8000           │
│ Badge Generation    │
│ Visitor Database    │
│ Print Job Queue     │
└──────────┬──────────┘
           ▲
           │ Polling (every 2 seconds)
           │
┌──────────┴──────────┐
│ Print Agent         │
│ Raspberry Pi 3B     │
│ Python              │
│ No Listening Port   │
│ Polling Client      │
└──────────┬──────────┘
           │ CUPS
           ▼
┌─────────────────────┐
│ Brother QL-800      │
│ Queue:              │
│ QL800_BROTHER       │
└─────────────────────┘
```

### Badge Printing Workflow

```text
Visitor Check-In
        │
        ▼
Frontend (React/Vite)
        │
        ▼
Backend (FastAPI)
        │
        ▼
Badge Generated
        │
        ▼
Print Job Created
        │
        ▼
Print Agent Polls Backend
        │
        ▼
Badge Downloaded
        │
        ▼
CUPS Print Queue
        │
        ▼
Brother QL-800
        │
        ▼
Printed Visitor Badge
```

### Network Ports

| Component | Port | Purpose |
|------------|------|----------|
| Frontend | 5173 | React/Vite development server |
| Backend | 8000 | FastAPI API |
| Print Agent | None | Polling client only |
| Brother QL-800 | USB | Directly connected to Raspberry Pi |

### Architecture Notes

- The Print Agent does **not** host a web service and does **not** listen on a network port.
- The Print Agent polls the Backend every few seconds to discover new print jobs.
- The Raspberry Pi communicates with the printer through CUPS.
- The Backend remains the system of record for visitors, badge generation, and print job status.
- The Printer Server can be rebuilt independently of the Backend and Frontend systems.

### Production Notes
- Internal DNS will have an A record for visitor.domain.local pointing to the Caddy reverse proxy
- Caddy has a wildcard cert for *.domain.local
- Caddy will be configured to direct https://visitor.domain.local to port 5173 of the frontend
