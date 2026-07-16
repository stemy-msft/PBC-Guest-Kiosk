# Troubleshooting

This document captures issues encountered during development and deployment.

---

# Print Agent Cannot Reach Backend

## Symptoms

```text
Print agent polling error
Connection timeout
```

## Test

From the Raspberry Pi:

```bash
curl http://BACKEND_IP:8000
```

Expected:

```json
{
  "application": "PBC Visitor Kiosk",
  "version": "0.1"
}
```

## Possible Causes

- Backend not running
- Firewall blocking access
- VLAN routing issue
- Incorrect backend IP

---

# Print Jobs Never Print

## Check Queue

```bash
lpstat -t
```

## Check Active Jobs

```bash
lpstat -o
```

## Check Printer Status

```bash
lpstat -p
```

---

# Printer Enters Red Error State

## Common Cause

Incorrect media size.

Verify:

```text
PageSize=62x100
```

using:

```bash
lpoptions -p QL800_BROTHER -l
```

---

# Poor Image Quality

## Symptoms

- Heavy dithering
- Newspaper-like appearance
- Halftone artifacts

## Cause

Using the ptouch-ql rendering path.

## Recommended Fix

Use:

```text
QL800_BROTHER
```

with:

```text
PageSize=62x100
BrPriority=BrQuality
BrBrightness=15
```

---

# Print Agent Claims Jobs But Does Not Print

## Verify Printer Queue

```bash
lpstat -p
```

Expected queue:

```text
QL800_BROTHER
```

## Verify Environment Variable

```env
PBC_PRINTER_NAME=QL800_BROTHER
```

---

# Backend Works Locally But Pi Cannot Connect

## Symptoms

Backend accessible on workstation:

```bash
curl http://localhost:8000
```

but not from Raspberry Pi.

## Check

```bash
curl http://BACKEND_IP:8000
```

from Pi.

If it fails:

- Verify VLAN routing
- Verify firewall rules
- Verify backend listens on:

```text
0.0.0.0
```

Use:

```bash
netstat -ano | findstr 8000
```

Expected:

```text
TCP 0.0.0.0:8000 LISTENING
```

---

# Database issues/cleanup

## Background

App is currently using SQLite as the backend database




---

# Validate Complete System

A healthy deployment should successfully perform:

1. Visitor checks in
2. Photo captured
3. Badge generated
4. Print job queued
5. Print agent claims job
6. Badge downloaded
7. Printer prints badge

If all steps succeed, the deployment is considered operational.