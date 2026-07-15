# PBC-Guest-Kiosk
PBC Guest Kiosk

A Visitor Kiosk designed to allow visitors to self-checkin and print a visitor nametag.

Current design:

Visitor/iPad
    ↓
Frontend (React/Vite)
    ↓
Backend (FastAPI)
    ↓
Print Job Queue
    ↓
Print Agent (Raspberry Pi)
    ↓
CUPS Queue (QL800_BROTHER)
    ↓
Brother QL-800 Printer