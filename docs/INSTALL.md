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

Create the file if it does not exist.

Example:

```env
JWT_SECRET_KEY=CHANGE_ME
DATABASE_URL=sqlite:///data/kiosk.db
PRINT_AGENT_URL=http://kiosk-printer.domain.local:8001
```

Adjust values as needed.

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
