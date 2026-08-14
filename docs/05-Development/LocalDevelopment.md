# Local Development Environment

## 1. Purpose and Scope

This document explains how to stand up a **local development environment** for
the PBC Guest Kiosk so you can build, run, and change each component on a
developer workstation. It covers the backend API, the frontend single-page app,
and the print agent.

It is a *development* guide. For production installation and hosting, use the
canonical deployment section instead:

- Fastest first-run / evaluation setup → [../02-Deployment/QuickStart.md](../02-Deployment/QuickStart.md)
- Component deployment guides → [../02-Deployment/BackendDeployment.md](../02-Deployment/BackendDeployment.md),
  [../02-Deployment/FrontendDeployment.md](../02-Deployment/FrontendDeployment.md),
  [../02-Deployment/RaspberryPiPrintAgent.md](../02-Deployment/RaspberryPiPrintAgent.md)
- Before any production use → [../02-Deployment/ProductionReadiness.md](../02-Deployment/ProductionReadiness.md)

Every command below is verified against the current repository. Where a command
differs by operating system, both forms are given.

---

## 2. Supported Development Platforms

| Component | Supported development platform | Notes |
| --- | --- | --- |
| Backend (FastAPI) | Windows 11, macOS, or Linux | Windows 11 is the tested backend host. The backend itself is cross-platform Python. |
| Frontend (Vite/React) | Windows, macOS, or Linux | Node.js toolchain; cross-platform. |
| Print agent | **Raspberry Pi OS / Linux only** | Requires CUPS (`lp`, `lpstat`). There is **no Windows print agent** in this repository. You can *edit* the print-agent code on any OS, but it can only *print* on Linux + CUPS. |

See [../06-Reference/HardwareMatrix.md](../06-Reference/HardwareMatrix.md) and
[../06-Reference/SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md) for the
tested hardware and software versions.

---

## 3. Required Software

| Tool | Version | Used by | Source of truth |
| --- | --- | --- | --- |
| Python | 3.12+ (3.13 tested) | Backend, print agent | [../../README.md](../../README.md), verified against the pinned manifests |
| Node.js + npm | Node.js 20+ | Frontend | [../../frontend/README.md](../../frontend/README.md) |
| Git | any recent | All | Repository checkout |
| CUPS (`lp`, `lpstat`) | OS package | Print agent (Linux only) | [../PRINT-SERVER.md](../PRINT-SERVER.md) |

The backend and print agent use only the Python standard library plus the pinned
third-party packages in their `requirements.txt` files. The frontend uses the
Node/npm toolchain defined in [../../frontend/package.json](../../frontend/package.json).

> The repository does **not** pin an exact Node.js version in `package.json`
> (there is no `engines` field). "Node.js 20+" is the requirement stated in the
> frontend README; the installed dev toolchain (Vite 8, ESLint 10) expects a
> current Node 20/22 LTS.

---

## 4. Repository Checkout

Clone the repository and change into it:

```bash
git clone <repository-url> PBC-guest-kiosk
cd PBC-guest-kiosk
```

The three deployable components live in sibling top-level directories:
`backend/`, `frontend/`, and `print-agent/`. A full directory map is in
[RepositoryStructure.md](RepositoryStructure.md).

---

## 5. Backend Environment Setup

All backend commands are run from the **`backend/` directory**. This is not
optional — the database file and every runtime directory are resolved relative
to the backend working directory (see [DatabaseMaintenance.md](DatabaseMaintenance.md)).

```powershell
# Windows PowerShell (tested backend host)
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```bash
# macOS/Linux
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`backend/requirements.txt` is fully pinned (every package uses `==`, including
transitive dependencies). It installs plain `uvicorn` — there is no
`uvicorn[standard]` and no gunicorn.

### Optional: test-only dependencies

To run the automated backend tests, also install the test extras:

```bash
pip install -r requirements-dev.txt
```

`backend/requirements-dev.txt` adds only `pytest` and `httpx`; it is deliberately
kept separate so the runtime install is unchanged. See [Testing.md](Testing.md).

---

## 6. Frontend Environment Setup

All frontend commands are run from the **`frontend/` directory**.

```bash
cd frontend
npm install
```

`frontend/package.json` pins React 19 and the Vite/Vitest/ESLint toolchain. A
`package-lock.json` is committed, so `npm ci` can be used for a clean,
reproducible install once a lockfile-consistent state is desired:

```bash
npm ci
```

---

## 7. Print-Agent Development Setup

> **Linux + CUPS only.** The print agent shells out to `lp`/`lpstat`. You can
> edit it on any OS, but it can only *print* on a Raspberry Pi / Linux host with
> CUPS configured. See [../PRINT-SERVER.md](../PRINT-SERVER.md) and
> [../02-Deployment/RaspberryPiPrintAgent.md](../02-Deployment/RaspberryPiPrintAgent.md).

```bash
cd print-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`print-agent/requirements.txt` declares both packages the agent imports
(`requests` and `python-dotenv==1.2.2`), so the `pip install -r requirements.txt`
above installs everything `print_agent.py` needs. `python-dotenv` is pinned to
the same `1.2.2` used by the backend.

---

## 8. Environment Configuration

Each component reads a git-ignored `.env` file created from a tracked
`.env.example`. Never commit a real `.env`.

| Component | `.env` location | Copy from | Working example |
| --- | --- | --- | --- |
| Backend | **repository root** `.env` | root `.env.example` | there is no `backend/.env.example` |
| Frontend | `frontend/.env` | `frontend/.env.example` | build-time `VITE_API_BASE` |
| Print agent | `print-agent/.env` | `print-agent/.env.example` | self-populated at registration |

```powershell
# Windows PowerShell — backend config (repository root)
Copy-Item .env.example .env
```

```bash
# macOS/Linux — backend config (repository root)
cp .env.example .env
```

```bash
# Frontend config
cd frontend
cp .env.example .env      # then set VITE_API_BASE=http://your-backend-host:8000
```

- The backend loads the repository-root `.env` in two places:
  `backend/app/config.py` calls a bare `load_dotenv()` (the administrator
  bootstrap defaults), and `backend/app/auth.py` loads the same repository-root
  `.env` for the JWT settings (`JWT_SECRET_KEY`, `JWT_ALGORITHM`,
  `JWT_EXPIRE_MINUTES`) and fails fast if `JWT_SECRET_KEY` is unset.
- `VITE_API_BASE` is baked into the frontend at **build time**; changing it
  requires a rebuild (or a dev-server restart for `npm run dev`).
- The print agent reads `print-agent/.env` from a path co-located with the
  script and writes registration values (token, key, station slug) back into it.

The authoritative, fully commented variable reference is
[../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md).
Do not re-derive variable meanings here.

---

## 9. Starting the Backend

From the `backend/` directory, with the virtual environment active:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On first start the backend automatically (at import time):

- creates any missing tables and applies the inline schema migrations
  (see [DatabaseMaintenance.md](DatabaseMaintenance.md));
- creates the runtime directories `backend/logs`, `backend/uploads/*`,
  `backend/config`, and `backend/backups` if absent;
- creates the default administrator account from the bootstrap environment
  variables if no admin exists.

> **Working directory matters.** Because the database URL is relative, starting
> uvicorn from anywhere other than `backend/` will create or open a *different*
> `visitor_kiosk.db` in the wrong place. Always `cd backend` first.

---

## 10. Starting the Frontend

From the `frontend/` directory:

```bash
npm run dev      # Vite dev server, binds 0.0.0.0, default port 5173
```

Other scripts defined in `package.json`:

```bash
npm run build    # production build to frontend/dist/
npm run preview  # serve the production build locally
npm run test     # Vitest unit tests (see Testing.md)
npm run lint     # ESLint
```

The dev server proxies nothing; it calls the backend directly at the
`VITE_API_BASE` you configured, so start the backend first.

---

## 11. Running the Print Agent Safely

> **Only run the print agent against a development backend, on a Linux/CUPS
> host.** It self-registers and mutates its own `.env`.

From the `print-agent/` directory, with the virtual environment active and
dependencies installed (section 7):

```bash
python print_agent.py
```

Safety points, all verified against `print_agent.py`:

- **It self-registers.** On first run it calls the backend registration endpoint
  and writes the returned agent key/token back into `print-agent/.env`. Point it
  at a *development* backend, not production, or you will create a real agent
  enrollment record.
- **It starts disabled.** A newly registered agent is disabled until an
  administrator approves it and assigns it to a print station. Nothing prints
  until then.
- **It creates a download directory relative to the current directory.**
  `PBC_PRINT_DOWNLOAD_DIR` defaults to `./downloaded-badges`, so run the agent
  from `print-agent/` to keep downloads contained (this directory is
  git-ignored).
- **It runs in the foreground.** Stop it with Ctrl+C. There is no bundled
  service/supervisor unit in this repository.

---

## 12. Development URLs and Health Endpoints

| URL | Purpose | Verified response |
| --- | --- | --- |
| `http://localhost:8000/` | Backend liveness banner | `{"application":"PBC Visitor Kiosk","version":"1.0"}` (the `"1.0"` here is a static banner string) |
| `http://localhost:8000/health/live` | Liveness probe (no database) | `{"status":"alive"}` |
| `http://localhost:8000/health` | Readiness probe (DB, directories, config, backup) | Returns `503` if a critical check fails; includes `version` `1.0.0-rc.2` and `release` `1.0.0 RC2` |
| `http://localhost:8000/docs` | FastAPI interactive API docs (Swagger UI) | Served by FastAPI default; app is `FastAPI(title="PBC Visitor Kiosk", version=<APP_VERSION>)` with no docs override |
| `http://localhost:8000/redoc` | ReDoc API docs | FastAPI default |
| `http://localhost:5173/` | Frontend dev server | Vite default port |

The product version shown by `/health` and the API metadata comes from the
single source of truth `backend/app/version.py`. See
[ReleaseManagement.md](ReleaseManagement.md).

---

## 13. Test Data Considerations

- The **development database** is `backend/visitor_kiosk.db`, created on first
  backend start. It is git-ignored (all `*.db` files are ignored) and is safe to
  delete and recreate — see [DatabaseMaintenance.md](DatabaseMaintenance.md).
- The **automated test suite does not touch** `backend/visitor_kiosk.db`. The
  pytest harness (`backend/tests/conftest.py`) repoints the database engine to an
  in-memory SQLite database before the application is imported, and injects
  deterministic test-only JWT settings. Running tests will not create or modify
  your development data. See [Testing.md](Testing.md).
- Visitor data includes PII (names, photos). Do not load real visitor data into
  a development environment. Uploaded photos live under `backend/uploads/`
  (git-ignored).
- The default administrator credentials come from the bootstrap environment
  variables and default to a well-known development value. Change them before any
  shared or production use — see
  [../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md)
  and [../03-Operations/Administration.md](../03-Operations/Administration.md).

---

## 14. Stopping and Restarting Components

| Component | Stop | Restart |
| --- | --- | --- |
| Backend | Ctrl+C in the uvicorn terminal | Re-run the `uvicorn` command from `backend/` |
| Frontend | Ctrl+C in the Vite terminal | Re-run `npm run dev` from `frontend/` |
| Print agent | Ctrl+C in the agent terminal | Re-run `python print_agent.py` from `print-agent/` |

All three run in the foreground. There are no service definitions, `systemd`
units, `Procfile`, or process supervisors in this repository; unattended hosting
is a deployment concern documented (as a future task) in the deployment section.

---

## 15. Common Local Setup Failures

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `ModuleNotFoundError: No module named 'dotenv'` when starting the print agent | Dependencies not installed in the active environment | `pip install -r requirements.txt` from `print-agent/` (section 7). |
| Backend creates a database in the wrong folder / "no such table" oddities | uvicorn started from the wrong working directory | Always `cd backend` before starting uvicorn (section 9). |
| Frontend calls the wrong backend / CORS errors | `VITE_API_BASE` unset or wrong; backend CORS allowlist does not include the dev origin | Set `VITE_API_BASE` in `frontend/.env` and rebuild/restart; review CORS settings in [../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md). |
| `uvicorn: command not found` | Virtual environment not activated, or dependencies not installed | Activate `.venv` and `pip install -r requirements.txt` from `backend/`. |
| Print agent runs but nothing prints | Agent not yet approved/assigned, or no CUPS queue | Approve and assign the agent in the admin UI; verify the CUPS queue per [../PRINT-SERVER.md](../PRINT-SERVER.md). |
| `npm run dev` fails immediately | Node.js version too old, or `node_modules` missing | Install Node.js 20+, run `npm install` (or `npm ci`). |

For operational (non-development) troubleshooting, see
[../03-Operations/Troubleshooting.md](../03-Operations/Troubleshooting.md).

---

## 16. Validation Checklist

Your local environment is ready when:

- [ ] `backend/.venv` is created and dependencies install from
  `backend/requirements.txt` without error.
- [ ] The backend starts from `backend/` with the documented `uvicorn` command.
- [ ] `http://localhost:8000/health/live` returns `{"status":"alive"}`.
- [ ] `http://localhost:8000/health` returns a readiness payload (200 when all
  critical checks pass).
- [ ] `frontend/node_modules` is installed and `npm run dev` serves the UI on
  port 5173.
- [ ] The frontend can reach the backend (correct `VITE_API_BASE`).
- [ ] (Optional) `pip install -r requirements-dev.txt` succeeds and the backend
  test suite runs — see [Testing.md](Testing.md).
- [ ] (Linux only) The print agent starts after `pip install -r requirements.txt`
  and registers against your development backend.

---

## 17. Known Development Limitations

- **No Windows print agent.** Print-agent development requires a Linux/CUPS host
  to exercise printing end to end.
- **No process supervision in-repo.** All components run in the foreground;
  service/daemon packaging is a deployment/RTM concern, not part of the
  development setup.
- **Single hardcoded database path.** The backend database path is fixed
  relative to `backend/`; there is no environment override
  ([DatabaseMaintenance.md](DatabaseMaintenance.md)).
- **Frontend config is build-time.** `VITE_API_BASE` is baked in at build time;
  a production build points at a fixed backend origin.
- **No containerized dev environment.** Local development uses the native
  toolchain described above. Container assets exist for *deployment* only (see
  [../container-deployment.md](../container-deployment.md)), not for the dev inner loop.
