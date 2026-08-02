# Backend Deployment

**Status:** Authoritative (Documentation Wave 4). **Release:** `v1.0.0-rc.1`.
**Scope:** Installing and running only the FastAPI backend. For the full
single-host path see [QuickStart.md](QuickStart.md); for Linux specifics see
[LinuxDeployment.md](LinuxDeployment.md).

Every command and path here is verified against `backend/app/main.py`,
`backend/app/database.py`, `backend/app/config.py`, and
`backend/app/bootstrap.py`.

---

## 1. Backend responsibilities

The backend is a single FastAPI application (`app.main:app`, title
`PBC Visitor Kiosk`) that:

- serves the REST API used by the frontend and the print agent,
- persists all data in a local **SQLite** database,
- generates badge images and QR codes, storing them under `uploads/`,
- serves uploaded/generated images as static files at `/uploads`,
- authenticates staff via JWT and enforces the administrator role,
- exposes health endpoints for liveness and readiness.

Architecture context: [SystemComponents.md](../01-Architecture/SystemComponents.md).

---

## 2. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Python | **3.12+** (3.13 validated) | See [SoftwareMatrix.md § 2](../06-Reference/SoftwareMatrix.md#2-runtimes). |
| `pip` | bundled with Python | Installs `backend/requirements.txt`. |
| Repository checkout | — | This guide runs from the `backend/` directory. |

No separate database server, message broker, or cache is required.

---

## 3. Python environment creation

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate it:

- **Windows (PowerShell):** `.venv\Scripts\Activate.ps1`
- **Linux / macOS:** `source .venv/bin/activate`

Keeping a dedicated virtual environment in `backend/.venv` matches the reference
build and keeps dependencies isolated.

---

## 4. Dependency installation

```bash
pip install -r requirements.txt
```

This installs the pinned runtime stack (FastAPI, Uvicorn, SQLAlchemy, Pydantic,
python-jose, pwdlib/argon2, Pillow, qrcode, python-dotenv, cryptography). The
authoritative version list is [SoftwareMatrix.md § 3](../06-Reference/SoftwareMatrix.md#3-backend-runtime-dependencies).

> The application server is **Uvicorn** only. No `gunicorn`, process manager, or
> multi-worker launcher is shipped or required.

---

## 5. Configuration

The backend reads a single `.env` file at the **repository root**. Create it
from the shipped example:

```bash
# from the repository root
cp .env.example .env
```

Key points, all verified in code:

- Configuration is loaded with `python-dotenv` (`load_dotenv()` in
  `app/config.py`), which locates the root `.env` regardless of the directory
  you start from.
- `JWT_SECRET_KEY` is **required** — the backend fails fast on startup if it is
  missing. Set a long random value.
- `PBC_DEFAULT_ADMIN_USERNAME` / `PBC_DEFAULT_ADMIN_PASSWORD` /
  `PBC_DEFAULT_ADMIN_DISPLAY_NAME` seed the first administrator (see § 10).
- In production (`PBC_ENV=production`) the backend also fails fast if
  `PBC_CORS_ALLOWED_ORIGINS` is unset.

Every variable, its default, read location, and security note is in
[EnvironmentVariables.md § 1](../06-Reference/EnvironmentVariables.md#1-backend).

---

## 6. Database initialisation

There is **nothing to run** to initialise the database — it is fully automatic.

- The database URL is fixed in code:
  `DATABASE_URL = "sqlite:///visitor_kiosk.db"` (`app/database.py`). There is
  **no `DATABASE_URL` environment variable**; the path cannot be changed via
  configuration.
- Because the path is **relative**, SQLite creates the file in the process's
  current working directory. **Always start the backend from the `backend/`
  directory** so the file lands at `backend/visitor_kiosk.db`, aligned with the
  other runtime directories.
- On import, the backend runs `Base.metadata.create_all(...)`, which creates any
  missing tables from the models.
- The backend then applies small, **idempotent, in-place schema migrations**
  (adds missing columns such as `print_jobs.claim_generation`,
  `visitors.print_station_id`, and `users.locked_until`). These are safe to run
  repeatedly and never drop or rewrite data. This repository does **not** use
  Alembic; do not look for or run migration tooling.

To reset to a clean state for evaluation, stop the backend and delete
`backend/visitor_kiosk.db`; it will be recreated (with a fresh default admin) on
next start. Data model detail: [DataFlow.md](../01-Architecture/DataFlow.md).

---

## 7. Runtime directories and permissions

On startup the backend creates these directories under `backend/` if they do not
exist (parent of `app/`, i.e. `BASE_DIR = backend/`):

| Path | Purpose |
| --- | --- |
| `backend/logs/` | Application and audit logs (§ 12). |
| `backend/uploads/photos/` | Visitor photos. |
| `backend/uploads/badges/` | Rendered badge PNGs. |
| `backend/uploads/qr-codes/` | Generated QR codes. |
| `backend/uploads/theme-logos/` | Uploaded website-theme logo overlays. |
| `backend/config/` | Seeded system-settings file. |
| `backend/backups/` | Destination for backup snapshots (§ 11). |

The `uploads/` tree is mounted read-only to clients at `/uploads`. The account
running the backend must have **write** permission to `backend/` so these
directories and the SQLite file can be created and updated.

---

## 8. Starting the backend

From `backend/`, with the virtual environment active:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0` makes the API reachable from other devices (kiosk tablets,
  the print agent) on the LAN.
- The process runs in the **foreground**; closing the terminal stops it. There
  is no shipped service unit or supervisor — see
  [ProductionReadiness.md § 5](ProductionReadiness.md#5-startup--supervision-gaps).

---

## 9. Health endpoints

| Endpoint | Meaning | Verified response |
| --- | --- | --- |
| `GET /` | Identity banner | `{"application":"PBC Visitor Kiosk","version":"1.0"}` (the `1.0` string is hard-coded here). |
| `GET /health/live` | Liveness (no DB touch) | `{"status":"alive"}` |
| `GET /health` | Readiness | JSON reporting `database`, `directories`, `configuration`, and `backup` subsystems plus `version` (`1.0.0-rc.1`) and `release` (`1.0.0 RC1`). Returns HTTP **503** if a critical subsystem fails. |

Operational use of these endpoints is covered in
[Troubleshooting.md § 2](../03-Operations/Troubleshooting.md#2-system-health-checks)
and [QuickReference.md](../03-Operations/QuickReference.md#health-endpoints).

---

## 10. Initial administrator creation

On startup the backend calls `create_default_admin(...)`:

- If a user with `PBC_DEFAULT_ADMIN_USERNAME` (default `admin`) already exists,
  nothing happens.
- Otherwise it creates an **Administrator** account, enabled, with
  **must-change-password** set, using `PBC_DEFAULT_ADMIN_PASSWORD`, and prints
  `Created default administrator account: <username>`.

The first sign-in therefore forces a password change. Set a strong
`PBC_DEFAULT_ADMIN_PASSWORD` before first start. Details:
[EnvironmentVariables.md § 1.2](../06-Reference/EnvironmentVariables.md#12-initial-administrator-bootstrap)
and [SecurityControls.md](../06-Reference/SecurityControls.md).

---

## 11. Backup readiness

- Backups are written to `backend/backups/` as timestamped snapshots by the
  backup tooling; the newest snapshots are retained (older ones pruned).
- The `GET /health` readiness check verifies the backup destination exists and
  is **writable** (read-only validation — it never creates a backup).
- Secrets (the `.env` file) are intentionally **not** included in backups.

Procedures (manual backup, restore, validation) are in
[BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md) and the
[DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md) runbook. Do not invent an
automated backup schedule here — none ships in the repository.

---

## 12. Log locations

Under `backend/logs/`:

| File | Contents | Rotation |
| --- | --- | --- |
| `guest-kiosk.log` | Application log | ~10 MB × 5 files |
| `audit.log` | Security/audit events (logins, lockouts, admin actions) | ~5 MB × 10 files |

Rotation uses a crash-tolerant handler that keeps appending if a rotation rename
is temporarily blocked (e.g. a file locked by a sync client). Log-collection
guidance for support: [Troubleshooting.md § 13](../03-Operations/Troubleshooting.md#13-logs-collection-guide).

---

## 13. Validation checklist

- [ ] `pip install -r requirements.txt` completed without error.
- [ ] Root `.env` exists with a strong `JWT_SECRET_KEY` and admin password.
- [ ] Backend started **from `backend/`**; `backend/visitor_kiosk.db` was created.
- [ ] Console printed `Created default administrator account: <username>` on first run.
- [ ] `GET /health/live` returns `{"status":"alive"}`.
- [ ] `GET /health` returns HTTP `200` with all subsystems `ok` and `version` `1.0.0-rc.1`.
- [ ] `backend/logs/`, `backend/uploads/`, `backend/config/`, `backend/backups/` exist and are writable.

---

## 14. Known limitations

- **Fixed database location:** the SQLite path is hard-coded; there is no
  `DATABASE_URL` override and no supported way to relocate the database via
  configuration.
- **Single-process SQLite:** the engine is configured for single-process use
  (`check_same_thread=False`); running multiple backend workers against the same
  file is not a supported configuration.
- **Foreground only:** no service unit, supervisor, or auto-restart ships in this
  repository. See [ProductionReadiness.md](ProductionReadiness.md).
- **No built-in TLS:** the backend serves plain HTTP; there is no shipped reverse
  proxy or certificate handling.
- **PII retained indefinitely:** there is no automatic visitor-data retention or
  purge. See [SecurityControls.md](../06-Reference/SecurityControls.md).
