# Installation Guide

This document walks through deploying the PBC Visitor Kiosk from a fresh clone of the repository.

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
PRINT_AGENT_URL=http://192.168.0.50:8001
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
curl http://localhost:8000
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
PBC_API_BASE=http://192.168.0.210:8000
PBC_PRINTER_NAME=QL800_BROTHER
PBC_POLL_SECONDS=3
```

---

# Start Print Agent

```bash
python print_agent.py
```

Expected startup:

```text
PBC Visitor Kiosk print agent started
API base: http://192.168.0.210:8000
Printer name: QL800_BROTHER
Polling every 3 second(s)
```

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
- Badge prints successfully

Deployment is complete once a visitor badge can be printed through the full workflow.