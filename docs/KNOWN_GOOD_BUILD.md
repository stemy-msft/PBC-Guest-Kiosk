# Known Good Build

Validated: July 2026

## Backend

### Host

- Windows 11
- Python Virtual Environment
- FastAPI Backend

### Network

- IP Address: 192.168.0.210
- Listening Port: 8000

## Frontend

### Host

- Windows 11
- React/Vite Frontend

### Network

- IP Address: 192.168.0.210
- Listening Port: 5173

## Print Agent

### Host

- Raspberry Pi 3B
- Raspberry Pi OS Lite (64-bit)
- Python 3.13

### Network

- IP Address: 192.168.0.124
- Listening Port: n/a (polling client)

## Printer

### Hardware

- Brother QL-800
- USB Connected

### Media

- DK-2205 Continuous Labels

### Driver

- ql800pdrv Version 2.1.4-0

Verify:

```bash
dpkg -s ql800pdrv | grep Version
```

Expected:

```text
Version: 2.1.4-0
```

### Queue

```text
QL800_BROTHER
```

### Production Settings

```text
PageSize=62x100
BrPriority=BrQuality
BrBrightness=15
```

Verify:

```bash
lpoptions -p QL800_BROTHER
```

### Known Good Device URI

```text
device for QL800: usb://Brother/QL-800?serial=000C8Z896885
device for QL800_BROTHER: usb://Brother/QL-800?serial=000C8Z896885
```

> Serial numbers will differ between printers.

## Repository

GitHub Repository:

```text
https://github.com/stemy-msft/PBC-Guest-Kiosk
```

Repository Status:

- No real visitor photos
- No real visitor data
- Sample data only
- Documentation updated
- Print Agent documented
- Raspberry Pi print server documented

## Validated Workflow

✅ iPad Check-In
✅ Photo Capture
✅ Badge Generation
✅ Print Job Creation
✅ Print Agent Polling
✅ Badge Image Download
✅ Badge Printing
✅ End-to-End Visitor Workflow

## Validation Date

July 2026

This configuration represents the known-good deployment used to validate end-to-end visitor check-in and badge printing functionality.