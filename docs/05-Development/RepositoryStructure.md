# Repository Structure

## 1. Repository Overview

The PBC Guest Kiosk is a single repository containing three deployable
components and their documentation:

- **`backend/`** — the FastAPI application, SQLite persistence, badge generation,
  and the backup/restore core.
- **`frontend/`** — the Vite + React single-page kiosk and administration UI.
- **`print-agent/`** — the Raspberry Pi / Linux print agent that polls the
  backend and prints badges through CUPS.

Supporting these are `scripts/` (operational CLI wrappers), `docs/` (this
documentation set), and tracked configuration examples. This document describes
what each part actually contains and — importantly — which files are **source**,
which are **generated**, and which are **runtime data** that must not be mistaken
for source.

This is a structural reference. It does not invent modules or directories; every
path below exists in the repository.

---

## 2. Top-Level Directory Map

```text
PBC-guest-kiosk/
├── backend/            FastAPI application, tests, runtime data (see §3, §7)
├── frontend/           Vite + React single-page app (see §4)
├── print-agent/        Raspberry Pi / Linux CUPS print agent (see §5)
├── scripts/            Thin CLI wrappers for backup/restore (see §6)
├── docs/               Documentation set (see §9)
├── .env.example        Backend configuration example (tracked)
├── .env                Backend configuration (git-ignored; created locally)
├── .gitignore          Ignore rules (see §13)
├── .vscode/            Editor settings
├── LICENSE
├── README.md           Project overview and quick reference
└── repo_files.txt      Generated repo inventory snapshot (git-ignored)
```

---

## 3. Backend Structure

```text
backend/
├── app/
│   ├── main.py                 FastAPI app, routes, startup migrations, admin bootstrap
│   ├── version.py              Single source of truth for the product version
│   ├── config.py               Loads root .env; bootstrap/admin defaults
│   ├── database.py             SQLAlchemy engine/session; hardcoded SQLite URL
│   ├── models.py               SQLAlchemy ORM models
│   ├── schemas.py              Pydantic request/response schemas
│   ├── auth.py                 Password hashing and JWT
│   ├── dependencies.py         FastAPI dependencies (e.g. get_db)
│   ├── cors_config.py          CORS allowlist configuration
│   ├── liveness.py             Liveness/health helpers
│   ├── backup.py               Stdlib-only backup/restore core + CLI
│   ├── bootstrap.py            First-run/default administrator bootstrap
│   ├── queue_diagnostics.py    Print-queue diagnostics
│   ├── station_diagnostics.py  Print-station diagnostics
│   └── services/
│       ├── badge_service.py    Badge image composition
│       ├── badge_layouts.py    Badge layout definitions
│       ├── badge_themes.py     Badge theme definitions
│       └── __init__.py
├── tests/                      Pytest suite (see §10)
├── config/                     Runtime + template configuration (see §7, §8)
├── requirements.txt            Pinned runtime dependencies (UTF-16LE)
├── requirements-dev.txt        Test-only dependencies (pytest, httpx)
└── pytest.ini                  Pytest configuration
```

The `app` package is imported as a namespace (`app.main`, `app.database`, …).
`pytest.ini` sets `pythonpath = .` so that `app` is importable when tests run
from `backend/`.

Runtime data directories that appear under `backend/` at runtime
(`logs/`, `uploads/`, `backups/`, and the database file) are **not source** and
are covered in §7.

---

## 4. Frontend Structure

```text
frontend/
├── src/
│   ├── App.jsx                 Main application component (large, monolithic)
│   ├── main.jsx                React entry point
│   ├── api.js                  Backend API client
│   ├── api.test.js             Vitest tests for the API client
│   ├── App.css, index.css      Styles
│   ├── assets/                 Static assets imported by the app
│   ├── constants/
│   │   ├── fields.js           Form field definitions
│   │   ├── options.js          Select/option lists
│   │   ├── styles.js           Shared style constants
│   │   ├── themeEditor.js      Theme-editor constants
│   │   └── themes.js           Theme definitions
│   ├── lib/
│   │   ├── viewModel.js        View-model helpers (pure logic)
│   │   └── viewModel.test.js   Vitest tests for the view-model helpers
│   └── test/
│       └── setup.js            Vitest setup
├── public/                     Static files served as-is
├── index.html                  Vite HTML entry
├── package.json                Scripts and dependencies
├── package-lock.json           npm lockfile (reproducible installs)
├── vite.config.js              Vite config (host 0.0.0.0, allowedHosts)
├── vitest.config.js            Vitest config
├── eslint.config.js            ESLint flat config
└── README.md                   Frontend quick reference
```

`src/App.jsx` is a single large component that imports only from `./lib`,
`./constants`, `./api`, and the package version. `node_modules/` and the build
output `dist/` are generated and git-ignored (§7, §13).

---

## 5. Print-Agent Structure

```text
print-agent/
├── print_agent.py      The agent: polls the backend, downloads and prints badges
├── requirements.txt    Declares only requests==2.34.2 (see the known defect below)
├── .env.example        Example agent configuration (tracked)
└── .env                Agent configuration (git-ignored; self-populated)
```

`print_agent.py` imports `python-dotenv` (`from dotenv import load_dotenv`) but
`requirements.txt` does **not** declare it. This is a known, open manifest
defect — documented, not fixed, in
[DependencyMaintenance.md](DependencyMaintenance.md) and
[LocalDevelopment.md](LocalDevelopment.md).

At runtime the agent creates `print-agent/downloaded-badges/` (git-ignored) for
temporary badge downloads and writes registration values back into
`print-agent/.env`.

---

## 6. Scripts

```text
scripts/
├── backup.py     Thin CLI wrapper → app.backup.main (create/list/verify backups)
└── restore.py    Thin CLI wrapper → app.backup.main (restore; defaults to "restore")
```

Both scripts are thin wrappers: they add `backend/` to `sys.path` and delegate
to the backup/restore core in `backend/app/backup.py`. All backup logic lives in
that core module, not in the wrappers. Operational usage is documented in
[../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)
and [DatabaseMaintenance.md](DatabaseMaintenance.md).

---

## 7. Runtime Data and Generated Files

These paths appear during use and are **not source code**. Do not edit them by
hand and do not commit them. All are git-ignored (§13).

| Path | What it is | Created by |
| --- | --- | --- |
| `backend/visitor_kiosk.db` | The operational SQLite database | Backend on first start |
| `backend/visitor_kiosk.db.old` | A stale/backup database copy | Manual/operational |
| `backend/logs/` | Rotating application and audit logs | Backend logging |
| `backend/uploads/photos/` | Visitor photos (PII) | Visitor check-in |
| `backend/uploads/badges/`, `qr-codes/`, `theme-logos/` | Generated badge artifacts and operator logos | Badge generation / admin |
| `backend/backups/` | Backup snapshots (contain the DB and visitor PII) | Backup tooling |
| `backend/config/system_settings.json` | Live, runtime-mutable system settings | Admin UI |
| `backend/config/user_themes.json` | User-created themes | Theme editor |
| `frontend/node_modules/` | Installed npm packages | `npm install` |
| `frontend/dist/` | Production build output | `npm run build` |
| `print-agent/downloaded-badges/` | Temporary badge downloads | Print agent |
| `repo_files.txt` | Generated repository inventory snapshot | On-demand tooling |
| `**/__pycache__/`, `**/.venv/` | Python bytecode caches and virtual environments | Python tooling |

> **Do not mistake runtime data for source.** In particular, `backend/config/`
> contains both a tracked **template** (`system_settings.template.json`) and
> git-ignored **live** files (`system_settings.json`, `user_themes.json`). The
> template is source; the live files are runtime state.

---

## 8. Configuration Examples

Three tracked `.env.example` files document each component's configuration.
Copies named `.env` are git-ignored and created locally (see
[LocalDevelopment.md](LocalDevelopment.md)).

| Tracked example | Consumed by | Local copy |
| --- | --- | --- |
| root `.env.example` | Backend (loaded from the repository root) | root `.env` |
| `frontend/.env.example` | Frontend build (`VITE_API_BASE`) | `frontend/.env` |
| `print-agent/.env.example` | Print agent | `print-agent/.env` |

There is **no** `backend/.env.example`; the backend's example lives at the
repository root. In addition, `backend/config/system_settings.template.json` is
the tracked template for the live system-settings file.

The authoritative variable reference is
[../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md).

---

## 9. Documentation Structure

```text
docs/
├── 00-Executive/       What the system is; glossary
├── 01-Architecture/    Overview, components, data/network/print architecture
├── 02-Deployment/      Canonical install/deploy guides
├── 03-Operations/      Administration, troubleshooting, backup/recovery
├── 05-Development/      This section (development and maintenance)
├── 06-Reference/       Environment variables, security, hardware/software matrices
├── history/            Archived historical material (tracked)
├── reviews/            Internal review reports (git-ignored)
├── INSTALL.md          Superseded → points to 02-Deployment
├── KNOWN_GOOD_BUILD.md Authoritative validated build record
├── PRINT-SERVER.md     Authoritative CUPS/print-server setup
├── DISASTER-RECOVERY.md Authoritative disaster-recovery runbook
├── ADMINISTRATION.md   Superseded → points to 03-Operations
├── TROUBLESHOOTING.md  Superseded → points to 03-Operations
└── CHEATSHEET.md       Superseded → points to 03-Operations
```

The numbered folders are the canonical, maintained documentation. Several
root-level Markdown files are retained with "superseded" banners that point to
the numbered sections; three (`KNOWN_GOOD_BUILD.md`, `PRINT-SERVER.md`,
`DISASTER-RECOVERY.md`) remain authoritative single sources of truth for their
topics.

> `docs/reviews/` is **git-ignored**. Its contents are internal, point-in-time
> review reports, not durable project documentation — see §11.

---

## 10. Tests and Test Organization

```text
backend/tests/
├── conftest.py                       Fixtures + in-memory DB isolation
├── test_account_lockout.py
├── test_auth_and_access.py
├── test_backup_restore.py
├── test_cors.py
├── test_m8_feature_completion.py
├── test_m92_health_liveness.py
├── test_m92_queue_visibility.py
├── test_m92_station_awareness.py
├── test_print_agent_credentials.py
├── test_print_job_ownership.py
├── test_print_job_redirect.py
├── test_reprint_destination.py
├── test_schema_contracts.py
├── test_station_routing.py
├── test_upload_boundary.py
└── test_visitor_find_minimization.py

frontend/src/
├── api.test.js                       Vitest tests (API client)
├── lib/viewModel.test.js             Vitest tests (view-model helpers)
└── test/setup.js                     Vitest setup
```

The backend suite runs under **pytest** from `backend/`; the frontend suite runs
under **Vitest** from `frontend/`. The print agent has **no** automated tests.
Details, commands, and demonstrated results are in [Testing.md](Testing.md).

---

## 11. Historical and Review Material

- **`docs/history/`** (tracked) holds archived historical material, e.g.
  `visitor-kiosk-requirements-v0.1.md`, kept for provenance with an archival
  banner. Treat it as history, not current instructions.
- **`docs/reviews/`** (git-ignored) holds internal milestone and documentation
  review reports. These are point-in-time working artifacts. **Do not** treat
  them as current, durable documentation, and do not link end-user or maintainer
  guidance to them as if they were canonical.

---

## 12. Files That Must Not Be Hand-Edited

| File / directory | Why | Change it via |
| --- | --- | --- |
| `backend/visitor_kiosk.db` and any `*.db*` | Operational data; binary SQLite | The application, or backup/restore tooling |
| `backend/logs/`, `backend/uploads/`, `backend/backups/` | Runtime output and visitor data | The application / backup tooling |
| `backend/config/system_settings.json`, `user_themes.json` | Live runtime settings | The admin UI / theme editor |
| `frontend/node_modules/`, `frontend/dist/` | Generated | `npm install` / `npm run build` |
| `frontend/package-lock.json` | npm-managed lockfile | npm commands, not by hand |
| `repo_files.txt` | Generated snapshot | Regenerate on demand |
| `**/__pycache__/`, `**/.venv/` | Tool-managed | Python tooling |

Tracked configuration **templates** (for example
`backend/config/system_settings.template.json` and the `.env.example` files)
*are* source and may be edited under normal change control.

---

## 13. Generated, Runtime, and Source-Controlled Boundaries

The `.gitignore` encodes the boundary between source and non-source. The key
rules:

- **Secrets:** `.env` and `.env.*` are ignored; `.env.example` files are tracked.
- **Databases:** all `*.db`, `*.sqlite*`, journals, and `*.db.old` are ignored.
- **Runtime output:** `backend/uploads/`, `backend/logs/`,
  `backend/backups/` (and `backups/`), and `print-agent/downloaded-badges/` are
  ignored.
- **Live config:** `backend/config/system_settings.json` and
  `backend/config/user_themes.json` are ignored; their template is tracked.
- **Tooling:** `.venv/`, `__pycache__/`, `node_modules`, `dist`, and the various
  cache directories are ignored.
- **Generated snapshot:** `repo_files.txt` is ignored.
- **Internal reviews:** `docs/reviews` is ignored (while `docs/history/` is
  tracked).

If a file is git-ignored, assume it is generated or runtime data and treat it
accordingly.

---

## 14. Where to Make Common Changes

| I want to change… | Start in | Related docs |
| --- | --- | --- |
| An API route or backend behavior | `backend/app/main.py` | [DevelopmentWorkflow.md](DevelopmentWorkflow.md) |
| A database model / schema | `backend/app/models.py` (+ inline migration in `main.py`) | [DatabaseMaintenance.md](DatabaseMaintenance.md) |
| Request/response validation | `backend/app/schemas.py` | [Testing.md](Testing.md) |
| Badge appearance | `backend/app/services/badge_*.py` | [../01-Architecture/PrintArchitecture.md](../01-Architecture/PrintArchitecture.md) |
| Authentication / JWT / hashing | `backend/app/auth.py` | [../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md) |
| CORS allowlist | `backend/app/cors_config.py` (+ env) | [../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md) |
| Frontend UI / flows | `frontend/src/App.jsx` | [DevelopmentWorkflow.md](DevelopmentWorkflow.md) |
| Frontend pure logic (testable) | `frontend/src/lib/viewModel.js` | [Testing.md](Testing.md) |
| Form fields, options, themes | `frontend/src/constants/*.js` | — |
| Print agent behavior | `print-agent/print_agent.py` | [../02-Deployment/RaspberryPiPrintAgent.md](../02-Deployment/RaspberryPiPrintAgent.md) |
| The product version | `backend/app/version.py` and `frontend/package.json` | [ReleaseManagement.md](ReleaseManagement.md) |
| Backup/restore logic | `backend/app/backup.py` | [DatabaseMaintenance.md](DatabaseMaintenance.md) |
