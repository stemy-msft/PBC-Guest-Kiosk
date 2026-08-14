# Linux Deployment

**Status:** Authoritative (Documentation Wave 4). **Release:** `v1.0.0-rc.2`.
**Scope:** Deploying the backend and frontend together on a single Linux host,
with the writable paths, startup, and reboot realities made explicit. For the
fastest evaluation path use [QuickStart.md](QuickStart.md); for component depth
use [BackendDeployment.md](BackendDeployment.md) and
[FrontendDeployment.md](FrontendDeployment.md).

Every command and path here is verified against the current code. This page
**links** to the component guides rather than repeating their detail.

---

## 1. Deployment scope

This guide produces, on one Linux host:

- the FastAPI backend on port `8000`,
- the frontend served on port `5173`,
- automatic database, directory, and default-admin creation,

running as **two foreground processes**. Printing (Raspberry Pi + CUPS) is a
separate host — see [RaspberryPiPrintAgent.md](RaspberryPiPrintAgent.md).

---

## 2. Supported Linux environment

| Aspect | Status |
| --- | --- |
| Backend on Linux (x86-64) | **EXPECTED GOOD — not the validated host.** The backend is portable Python; the reference build ran on Windows 11, so a Linux backend is not field-validated. See [SoftwareMatrix.md § 1](../06-Reference/SoftwareMatrix.md#1-operating-systems) and [HardwareMatrix.md](../06-Reference/HardwareMatrix.md). |
| Frontend on Linux | **EXPECTED GOOD** — any OS with Node 20+ can build/serve; not explicitly validated on Linux. |
| Print agent | Linux/CUPS is the **required** platform (separate host). |

Treat a Linux backend as an **EXPECTED GOOD**, portable target — not field-validated to
the same degree as the Windows reference host; validate thoroughly (§ 13).

---

## 3. Required software

| Software | Version | For |
| --- | --- | --- |
| Python + `venv` + `pip` | 3.12+ (3.13 validated) | Backend |
| Node.js + npm | 20+ | Frontend |
| Git | recent | Checkout |

Full matrix: [SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md).

---

## 4. OS preparation

1. Install Python 3.12+ (with `venv`) and Node.js 20+.
2. Create (or choose) a non-root service account that will **own and run** the
   application, with write access to the checkout's `backend/` tree (§ 9).
3. Place the repository somewhere the service account can write, e.g.
   `/opt/pbc-guest-kiosk` (avoid directories synced by cloud clients, which can
   lock log files).

---

## 5. Repository install

```bash
git clone <your-repository-url> pbc-guest-kiosk
cd pbc-guest-kiosk
```

All paths below are relative to this checkout root.

---

## 6. Backend install

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Component detail (dependencies, database behaviour, health): 
[BackendDeployment.md](BackendDeployment.md).

---

## 7. Frontend install / build

In a separate shell:

```bash
cd frontend
npm install
```

For evaluation you will run the dev server (§ 11). If you intend to build a
static bundle, `npm run build` writes to `frontend/dist/` — but note there is no
shipped production host for it (§ 16 and
[FrontendDeployment.md § 8](FrontendDeployment.md#8-serving-the-built-frontend)).

---

## 8. Runtime configuration

Create the two `.env` files from their examples:

```bash
# from the checkout root
cp .env.example .env
cp frontend/.env.example frontend/.env
```

- Root `.env`: set `JWT_SECRET_KEY` (required — backend won't start without it)
  and `PBC_DEFAULT_ADMIN_PASSWORD`. If you set `PBC_ENV=production`, you must
  also set `PBC_CORS_ALLOWED_ORIGINS`.
- `frontend/.env`: set `VITE_API_BASE` to a browser-reachable backend URL.

All variables: [EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md).

---

## 9. Application data and writable paths

The backend creates and writes these under the checkout's `backend/` directory
(`BASE_DIR = backend/`). The service account **must** have write access to all
of them:

| Path | Contents | Persistence |
| --- | --- | --- |
| `backend/visitor_kiosk.db` | SQLite database (created in the start directory) | **Primary datastore — must persist.** |
| `backend/uploads/` | Visitor photos, badges, QR codes, theme logos | Must persist. |
| `backend/config/` | Seeded system-settings file | Must persist. |
| `backend/backups/` | Backup snapshots | Must persist / be backed up off-host. |
| `backend/logs/` | Application + audit logs | Rotated in place. |

> Because the SQLite path is **relative** to the working directory, always start
> the backend from `backend/` (§ 10). Back up `backend/` (especially the `.db`
> and `uploads/`) as a unit — see
> [BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md).

---

## 10. Starting the backend

From `backend/`, with the venv active:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Foreground process. On first start it creates the database, runs its idempotent
in-place schema migrations, creates the runtime directories, and creates the
default administrator (§ 12).

---

## 11. Serving the frontend

The validated runtime is the Vite dev server:

```bash
cd frontend
npm run dev
```

Serves on `0.0.0.0:5173`. Open `http://<host-ip>:5173`. Production static
hosting of `frontend/dist/` is **not** shipped — see
[FrontendDeployment.md § 8](FrontendDeployment.md#8-serving-the-built-frontend).

---

## 12. Initial administrator provisioning

The default administrator is created automatically on first backend start from
`PBC_DEFAULT_ADMIN_USERNAME` / `PBC_DEFAULT_ADMIN_PASSWORD`, with
must-change-password set. Sign in and change the password immediately. Detail:
[BackendDeployment.md § 10](BackendDeployment.md#10-initial-administrator-creation).

---

## 13. Health and functional validation

- [ ] `curl http://localhost:8000/health/live` → `{"status":"alive"}`.
- [ ] `curl http://localhost:8000/health` → HTTP `200`, all subsystems `ok`,
      `version` `1.0.0-rc.2`.
- [ ] Frontend loads at `http://<host-ip>:5173` and shows `1.0.0 RC2`.
- [ ] Admin sign-in succeeds and forces a password change.
- [ ] A test check-in with photo completes and writes files under
      `backend/uploads/`.

If `/health` returns `503`, read the JSON body and see
[Troubleshooting.md § 2](../03-Operations/Troubleshooting.md#2-system-health-checks).

---

## 14. Startup after a reboot

**There is no supported auto-start mechanism in this repository.** No `systemd`
unit, init script, or supervisor configuration is shipped for the backend or the
frontend. After a reboot, both processes must be started again manually (§ 10,
§ 11).

Creating your own process supervision (e.g. a `systemd` service) is technically
possible but is a **bring-your-own, unsupported** step. The gap and the
considerations are documented in
[ProductionReadiness.md § 5](ProductionReadiness.md#5-startup--supervision-gaps).
Do not treat this system as unattended-restart-safe until you have added and
tested such supervision yourself.

---

## 15. Upgrade considerations

1. **Back up first** — snapshot `backend/` (database + uploads). See
   [BackupAndRecovery.md § 4](../03-Operations/BackupAndRecovery.md#4-manual-backup-process).
2. Stop the backend and frontend (and pause the print agent if running).
3. Update the code (e.g. `git pull`).
4. Reinstall dependencies: `pip install -r requirements.txt` (backend) and
   `npm install` (frontend).
5. Restart the backend. On start it applies its **idempotent, in-place** column
   migrations automatically; this repository does **not** use Alembic and there
   is no downgrade path.
6. If you serve a built frontend, rebuild (`npm run build`).
7. Re-run § 13 validation.

Because migrations only add missing columns and never rewrite data, the
data-loss risk is low — but the pre-upgrade backup is still mandatory.

---

## 16. Known limitations

- **Foreground processes / no auto-start:** no shipped service units (§ 14).
- **Windows is the validated backend host, not Linux:** Linux is portable but
  less field-validated.
- **Relative SQLite path:** start the backend from `backend/`.
- **Native path has no production frontend host or TLS/reverse proxy.** The
   optional container path ships nginx and an optional Caddy/HTTPS variant; see
   [../container-deployment.md](../container-deployment.md) and
   [ProductionReadiness.md](ProductionReadiness.md).

---

## 17. Handoff to operations

Once validated, day-to-day running is covered by:

- [Administration.md](../03-Operations/Administration.md) — users, stations, startup/shutdown
- [Troubleshooting.md](../03-Operations/Troubleshooting.md) — diagnosis
- [BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md) — backups/restore
- [QuickReference.md](../03-Operations/QuickReference.md) — one-page cheat sheet
