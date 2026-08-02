# Maintainer Handoff

## 1. Purpose

This document orients a new technical maintainer of the PBC Guest Kiosk. It is a
**map, not a manual**: it points to the canonical document for each area rather
than repeating it, so there is one source of truth per topic. Read it top to
bottom once, follow the links to go deep, and use the checklists (§14, §16) to
confirm you are ready to own the system.

It records only what the repository and its history actually contain. It does
**not** invent people, contacts, ownership, org policy, an escalation chain, or a
seasonal calendar — where those are absent, it says so.

---

## 2. System Orientation

The PBC Guest Kiosk is a visitor check-in and badge-printing system with three
components:

- **Backend** — FastAPI + SQLAlchemy over a single SQLite database; issues JWTs,
  stores visitors, generates badges/QR codes, and manages a print-job queue.
- **Frontend** — a React (Vite) single-page kiosk UI that talks to the backend
  over HTTP (browser `fetch`).
- **Print agent** — a Python script that runs on a Raspberry Pi / Linux host,
  claims print jobs from the backend, and prints to a Brother QL-series label
  printer via CUPS.

Start with the plain-language overview
[../00-Executive/WhatIsGuestKiosk.md](../00-Executive/WhatIsGuestKiosk.md) and
the architecture in
[../01-Architecture/Overview.md](../01-Architecture/Overview.md).

---

## 3. Critical Documents to Read First

Read these before making any change:

| Area | Document |
| --- | --- |
| What the system is | [../00-Executive/WhatIsGuestKiosk.md](../00-Executive/WhatIsGuestKiosk.md) |
| Architecture | [../01-Architecture/Overview.md](../01-Architecture/Overview.md) |
| Local dev setup | [LocalDevelopment.md](LocalDevelopment.md) |
| Repo layout | [RepositoryStructure.md](RepositoryStructure.md) |
| How to change safely | [DevelopmentWorkflow.md](DevelopmentWorkflow.md) |
| Testing | [Testing.md](Testing.md) |
| Database & migrations | [DatabaseMaintenance.md](DatabaseMaintenance.md) |
| Dependencies (+ known defect) | [DependencyMaintenance.md](DependencyMaintenance.md) |
| Releases | [ReleaseManagement.md](ReleaseManagement.md) |
| Operations | [../03-Operations/Administration.md](../03-Operations/Administration.md) |
| Deployment | [../02-Deployment/README.md](../02-Deployment/README.md) |
| Production gaps | [../02-Deployment/ProductionReadiness.md](../02-Deployment/ProductionReadiness.md) |

---

## 4. Development Environment Setup

Follow [LocalDevelopment.md](LocalDevelopment.md) end to end. In short: create the
backend virtual environment and install `requirements.txt` +
`requirements-dev.txt` (run from `backend/`); `npm install` the frontend (run
from `frontend/`); and, for print work, set up the agent on Linux per
[../02-Deployment/RaspberryPiPrintAgent.md](../02-Deployment/RaspberryPiPrintAgent.md).
Confirm your environment by running the test suites (§ [Testing.md](Testing.md)):
backend `python -m pytest`, frontend `npm run test`.

> Note the **print-agent `python-dotenv` manifest defect** during setup
> (§11) — a clean agent install needs the temporary local workaround until the
> defect is closed under change control.

---

## 5. Operational Responsibilities

Day-to-day running of the system is documented under Operations:

- Administration and user management →
  [../03-Operations/Administration.md](../03-Operations/Administration.md)
- Everyday quick reference →
  [../03-Operations/QuickReference.md](../03-Operations/QuickReference.md)
- Troubleshooting →
  [../03-Operations/Troubleshooting.md](../03-Operations/Troubleshooting.md)

Own these procedures; do not reinvent them in code.

---

## 6. Deployment Responsibilities

Deployment and upgrade are covered under Deployment:
[../02-Deployment/](../02-Deployment/README.md) (backend, frontend, Linux print
agent, quick start). The known-good, validated build is recorded in
[../KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md).

> The current phase runs components in the foreground. There is **no** Docker,
> systemd/service supervision, reverse proxy, or TLS termination in this
> repository, and service packaging is noted as future work. Do not assume or
> introduce those as part of maintenance.

---

## 7. Backup and Recovery Responsibilities

Backups are first-class. The backup core (`backend/app/backup.py`) uses the
SQLite online-backup API with an integrity check and captures the database,
uploads, and live config together.

- Operational runbook →
  [../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)
- Disaster recovery →
  [../DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md)
- Maintenance details →
  [DatabaseMaintenance.md](DatabaseMaintenance.md)

Know how to take a verified snapshot and how to restore (destructive; stop the
backend and agents first) **before** you need to.

---

## 8. Print-System Responsibilities

The print path spans the backend queue, the Linux print agent, and CUPS:

- Print operations →
  [../03-Operations/PrintOperations.md](../03-Operations/PrintOperations.md)
- Print architecture →
  [../01-Architecture/PrintArchitecture.md](../01-Architecture/PrintArchitecture.md)
- CUPS/printer source of truth →
  [../PRINT-SERVER.md](../PRINT-SERVER.md)

The agent self-registers and stays **disabled until an administrator approves it
and assigns a station**. There is no Windows print agent — do not create one.

---

## 9. Security Responsibilities

Understand and preserve the security controls: JWT auth, Argon2 password
hashing, account lockout, CORS allowlisting, and upload boundaries. The reference
is [../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md); the
regression tests are listed in
[Testing.md](Testing.md#13-security-regression-validation). Treat the database
and uploads as **visitor PII** — protect them and never commit them.

---

## 10. Release Responsibilities

Versioning, RC discipline, tagging, and the version/tag mismatch finding are in
[ReleaseManagement.md](ReleaseManagement.md). Releases are **manual and
human-decided** — there is no automation. Never equate a passing test suite with
release or production approval.

---

## 11. Known Limitations and Open Defects

Carry these forward — they are real and currently open:

- **Print-agent `python-dotenv` manifest defect** — the agent imports
  `python-dotenv` but the manifest declares only `requests`; clean installs fail
  until a temporary local `pip install python-dotenv`. **Not fixed**; see
  [DependencyMaintenance.md](DependencyMaintenance.md#13-known-manifest-defects).
- **Version alignment (resolved)** — the in-code version sources now read
  `1.0.0-rc.2` (`1.0.0 RC2`), matching the `v1.0.0-rc.2` candidate; the earlier
  rc.1/rc.2 version mismatch is aligned. Tag creation remains a separate,
  deliberate human action. See
  [ReleaseManagement.md](ReleaseManagement.md#8-version-consistency-review).
- **Production-readiness gaps** — service supervision, reverse proxy/TLS, and
  related hardening are future work; see
  [../02-Deployment/ProductionReadiness.md](../02-Deployment/ProductionReadiness.md).
- **Test-coverage gaps** — no automated print-agent or end-to-end tests; large
  parts of the UI are unit-tested only via helpers. See
  [Testing.md](Testing.md#16-current-test-coverage-gaps).
- **Working-directory-sensitive database path** — the SQLite path is hardcoded
  relative to the working directory. See
  [DatabaseMaintenance.md](DatabaseMaintenance.md#2-sqlite-location-and-working-directory-dependency).
- **Frontend lint baseline** — 11 known problems; do not exceed. See
  [Testing.md](Testing.md#8-linting-and-static-checks).

---

## 12. Seasonal Startup and Shutdown Considerations

If the kiosk is operated on a seasonal basis, treat backup/restore and
verification as the anchors — the repository does not encode a seasonal calendar,
so do not assume specific dates:

- **Before an off-season shutdown:** take and **verify** a full backup snapshot,
  and preserve the items in §13. Follow
  [../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md).
- **At the start of a season:** stand the system up per
  [../02-Deployment/QuickStart.md](../02-Deployment/QuickStart.md), restore or
  carry forward the preserved data if required, and confirm health with
  `GET /health` and a real check-in→print workflow before opening to visitors.

Do not invent a seasonal procedure beyond these documented backup, restore, and
validation steps.

---

## 13. Information That Must Be Preserved

Across handoffs and seasons, preserve:

- The **database** (`backend/visitor_kiosk.db`) and its uploads
  (`backend/uploads/`) — via verified backup snapshots, never committed.
- Live **configuration** (`backend/config/system_settings.json`,
  `user_themes.json`) and the backend `.env` secrets (e.g. `JWT_SECRET_KEY`).
- **Print-agent credentials/station assignment** — the agent's `.env`
  (`PBC_PRINT_AGENT_TOKEN`, `PBC_PRINT_AGENT_KEY`, `PBC_PRINT_STATION_SLUG`),
  which the agent self-populates and which are git-ignored.
- The **canonical version decision** and any release notes (§ [ReleaseManagement.md](ReleaseManagement.md)).
- This documentation set itself, kept current.

All secrets and PII are git-ignored by design; preserve them **out of band**, not
in the repository.

---

## 14. First-Week Maintainer Checklist

- [ ] Read the critical documents (§3).
- [ ] Stand up a local dev environment ([LocalDevelopment.md](LocalDevelopment.md)).
- [ ] Run both test suites green ([Testing.md](Testing.md)).
- [ ] Reproduce and understand the print-agent `python-dotenv` defect (§11).
- [ ] Take a **verified** backup and perform a **restore** into a scratch
  environment ([DatabaseMaintenance.md](DatabaseMaintenance.md)).
- [ ] Trace one check-in→badge→print workflow end to end (dev backend + frontend;
  print path on a Pi if available).
- [ ] Review the open limitations (§11) and confirm you can locate each in code.
- [ ] Confirm you know where secrets and PII live and how they are preserved
  (§13).

---

## 15. Escalation and Decision Log Guidance

> **The repository contains no contact list, ownership record, escalation chain,
> or decision log (ADR).** This document does not invent them.

*Recommendations* (to be established by the owning organization, not assumed
here):

- Maintain an out-of-band contact/ownership record for the system's operators and
  hardware.
- Start a lightweight **decision log** — record non-obvious decisions (version
  reconciliation, dependency bumps, schema changes) with rationale, in PR/commit
  descriptions or a dedicated document.
- Capture escalation paths for production incidents alongside the operational
  runbooks.

---

## 16. Handoff Acceptance Checklist

Accept the handoff only when all of the following are true:

- [ ] You can build, run, and test all three components locally.
- [ ] You can take and restore a verified backup.
- [ ] You understand the database/migration model and its working-directory
  sensitivity.
- [ ] You understand the dependency layout and the open `python-dotenv` defect.
- [ ] You understand the release/versioning model and the `1.0.0-rc.2` version alignment.
- [ ] You know the location of every canonical operational, deployment, and
  security document.
- [ ] You know what must be preserved (§13) and where it lives.
- [ ] You accept that passing tests do not equal operational or production
  approval.
