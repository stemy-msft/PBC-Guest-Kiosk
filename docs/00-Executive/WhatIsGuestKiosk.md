# What Is the PBC Guest Kiosk?

**Status:** Authoritative executive overview (Documentation Wave 2, P0).
**Applies to release:** `v1.0.0-rc.2`.
**Audience:** Camp directors, administrators, volunteer IT, and future
maintainers. This is a plain-language orientation, not a setup guide — it links to
the detailed references rather than repeating them.

---

## 1. Executive summary

The PBC Guest Kiosk is a **self-hosted visitor check-in and badge-printing
system** for camps, churches, conferences, and similar organizations. A guest
checks in — at a staffed desk, an unattended kiosk tablet, or from their own
phone — has their photo captured, and a visitor badge is generated and printed
automatically on a networked label printer.

It runs entirely on your **local network**: a backend application, a web-based
user interface, and a small print agent on a Raspberry Pi. There is **no cloud
service, subscription, or internet dependency at runtime**, so visitor photos and
data stay on hardware you control.

The current release is **`v1.0.0-rc.2`** — a release candidate that has been
validated end-to-end on real hardware.

---

## 2. Problems solved

- **Slow, manual sign-in.** Replaces paper visitor logs with fast self-service
  check-in and check-out.
- **No visitor identification.** Produces a printed photo badge so staff can see at
  a glance who is on site and that they have checked in.
- **No central record.** Keeps a centralized visitor database with check-in /
  check-out history.
- **Data-privacy concerns with cloud tools.** Runs on your own local network;
  visitor photos and records never leave your hardware.
- **Limited budget and IT staff.** Uses inexpensive, off-the-shelf hardware
  (a tablet, a Raspberry Pi, a Brother label printer) and is designed to be run by
  volunteers.

---

## 3. Major components

| Component | What it is | Technology |
| --- | --- | --- |
| **Frontend** | The touch-friendly web UI for check-in, check-out, photo capture, badge preview, and administration. | React + Vite |
| **Backend** | The central application/API server: visitor management, badge generation, print-job queue, image storage, authentication. | FastAPI + Python, SQLite |
| **Print agent** | A small polling service on a Raspberry Pi that pulls pending jobs and prints badges through CUPS. | Python, CUPS |
| **Printer** | The networked label printer that produces the physical badge. | Brother QL-800 (validated) |

Exact versions are in [SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md);
supported devices are in [HardwareMatrix.md](../06-Reference/HardwareMatrix.md).

---

## 4. Visitor lifecycle overview

1. **Arrive & start check-in** — the visitor opens the kiosk UI (staffed desk,
   kiosk tablet, or their own phone).
2. **Enter details** — the visitor provides their information.
3. **Capture photo** — the device camera takes the visitor's photo; the image is
   normalized and stored on the backend.
4. **Badge generated** — the backend creates the visitor record and a badge image.
5. **Badge printed** — a print job is queued and printed automatically (see §5).
6. **On-site** — the visitor is now an active, recorded on-site guest.
7. **Check-out** — on leaving, the visitor (or staff) checks out, and the record is
   updated with a check-out time.

---

## 5. Printed badge lifecycle overview

1. **Job queued** — when a badge is generated, the backend adds a print job to its
   queue.
2. **Agent polls** — the Raspberry Pi print agent polls the backend on a short
   interval for pending jobs.
3. **Badge downloaded** — the agent downloads the generated badge image.
4. **Sent to printer** — the agent hands the badge to the local CUPS queue, which
   drives the Brother QL-800.
5. **Status reported** — the agent reports success or failure back to the backend,
   and the job leaves the queue.

Administrators can watch and manage this queue from the UI. Printer setup is
covered in [PRINT-SERVER.md](../PRINT-SERVER.md).

---

## 6. High-level architecture

```text
Visitor / Guest
        │
        ▼
Frontend (React/Vite)  ── browser UI on desk PC, kiosk tablet, or phone
        │  (HTTP over your LAN)
        ▼
Backend API (FastAPI)  ── visitor records, badges, auth, print queue
        │
        ├── Visitor database (SQLite, on the backend host)
        │
        └── Print-job queue
                │  (agent polls over the LAN)
                ▼
      Raspberry Pi print agent
                │
                ▼
         CUPS print queue
                │
                ▼
        Brother QL-800 printer
```

All traffic stays on the local network. The security controls protecting these
paths (authentication, CORS, upload limits, audit logging) are documented in
[SecurityControls.md](../06-Reference/SecurityControls.md).

---

## 7. Supported deployment models

The system is designed for a **single local network**. Two common models:

- **Single-host model (validated).** The backend and frontend run together on one
  Windows (or Linux) computer; the print agent runs on a Raspberry Pi; all devices
  are on the same LAN. This is the validated
  [known-good build](../KNOWN_GOOD_BUILD.md).
- **Split-serve model.** The frontend UI is served from a different origin than the
  backend API (for example, a separate kiosk host). This requires pointing the UI
  at the backend and allow-listing its origin — see
  [EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md)
  (`VITE_API_BASE`, `PBC_CORS_ALLOWED_ORIGINS`).

**Not in scope for v1:** container/Docker deployment and cloud/off-site hosting are
**not** part of this release — the project ships no container assets and requires no
cloud service. Step-by-step installation lives in [INSTALL.md](../INSTALL.md); this
section only describes the shape of a deployment.

---

## 8. Supported hardware

At a glance (full classification and evidence in
[HardwareMatrix.md](../06-Reference/HardwareMatrix.md)):

- **Backend/frontend host:** Windows 11 is validated; modern Linux is expected to
  work.
- **Check-in devices:** iPad (Safari/Chrome), Android phones including Pixel,
  Amazon Fire tablet, and desktop browsers are all validated.
- **Print agent:** Raspberry Pi (3B validated) running Raspberry Pi OS Lite with
  CUPS. **A Windows print agent is not supported.**
- **Printer:** Brother QL-800 over USB with DK-2205 labels is validated; other
  CUPS-supported USB label printers are expected to work.

---

## 9. Current release status

- **Release:** `v1.0.0-rc.2` (Release Candidate 2). The running backend reports
  this via its `/health` endpoint.
- **Validation:** End-to-end flow (check-in → photo → badge → print) validated on
  the [known-good build](../KNOWN_GOOD_BUILD.md); real-device browser validation
  completed in Milestone 8.
- **Hardening:** Security hardening (account lockout, CORS, upload boundaries),
  backup/recovery hardening, and repository hygiene are complete for RC1.
- **What "RC" means:** feature-complete and validated, undergoing final release
  candidate verification before a `1.0.0` general release.

---

## 10. Documentation map

**Authoritative references (start here):**

- [EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md) — every
  configuration variable.
- [SecurityControls.md](../06-Reference/SecurityControls.md) — implemented security
  controls.
- [HardwareMatrix.md](../06-Reference/HardwareMatrix.md) — supported hardware, by
  class.
- [SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md) — OS, runtimes, and
  dependency versions.

**Operational & setup guides:**

- [INSTALL.md](../INSTALL.md) — installation steps.
- [PRINT-SERVER.md](../PRINT-SERVER.md) — Raspberry Pi + CUPS + Brother QL-800
  setup.
- [ADMINISTRATION.md](../ADMINISTRATION.md) — day-to-day administration.
- [CHEATSHEET.md](../CHEATSHEET.md) — quick command/reference sheet.
- [DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md) — backup and restore runbook.
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) — common problems and fixes.
- [KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md) — the validated reference build.

**Project root:**

- [README.md](../../README.md) — repository overview and quick start.
