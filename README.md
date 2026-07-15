# PBC Visitor Kiosk

A self-service visitor management and badge printing solution designed for camps, churches, conferences, and other organizations that need a simple, secure visitor check-in experience.

The kiosk allows guests to check in from a touch-friendly interface, capture a photo, generate a visitor badge, and automatically print the badge through a network-connected print server.

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
├── .env                Backend configuration
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
- Python 3.x

#### Print Server

- Raspberry Pi OS
- Raspberry Pi 4 or newer recommended

#### Printer

- Brother QL-800

---

## Configuration

### Backend Configuration

The backend loads configuration from:

```text
/.env
```

This file must exist in the root of the repository.

Example:

```env
JWT_SECRET_KEY=change-me
DATABASE_URL=sqlite:///data/kiosk.db
PRINT_AGENT_URL=http://visitor-pi-printer:8001
```

---

### Print Agent Configuration

Environment variables supported by the print agent:

| Variable | Description |
|-----------|-------------|
| PBC_API_BASE | Backend API URL |
| PBC_PRINTER_NAME | CUPS printer queue name |
| PBC_POLL_SECONDS | Poll interval |
| PBC_DOWNLOAD_DIR | Temporary badge download location |
| PBC_AGENT_TOKEN | Agent authentication token |

Example:

```env
PBC_API_BASE=http://192.168.0.210:8000
PBC_PRINTER_NAME=QL800_BROTHER
PBC_POLL_SECONDS=3
```

---

## Printer Configuration

### Tested Production Queue

The current recommended production queue is:

```text
QL800_BROTHER
```

### Important Settings

The Brother queue must be configured as:

```text
PageSize       = 62x100
BrPriority     = BrQuality
BrBrightness   = 15
```

These settings were determined through testing and provide:

- Correct badge sizing
- Improved image quality
- Elimination of visible halftone artifacts
- Reliable badge printing

---

## Deployment Overview

### Backend

```bash
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

### Print Agent

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

Current Status: **Milestone 6 In Progress**

Completed:

- Visitor check-in workflow
- Badge generation
- Print job queueing
- Raspberry Pi print agent
- Brother QL-800 integration
- End-to-end badge printing

In Progress:

- Documentation
- Deployment automation
- Operational hardening
- Production readiness improvements

---

## License

This project is intended for use by Palmetto Bible Camp and related organizations.

Review repository licensing before redistribution.
