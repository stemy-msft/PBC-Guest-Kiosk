# Production Readiness

**Status:** Authoritative (Documentation Wave 4). **Release:** `v1.0.0-rc.2`.
**Purpose:** State plainly what is production-ready, what is technically possible
but unsupported, and what is not implemented — so no one relies on capabilities
this repository does not provide.

This page is grounded in the current code and shipped assets. Read it **before**
deploying the kiosk for any real activity.

Throughout, capabilities are bucketed as:

- ✅ **Implemented & documented** — ships and is covered by these docs.
- 🟡 **Technically possible, not supported** — you *could* build it, but the repo
  provides nothing for it and it is unvalidated.
- ❌ **Not implemented** — absent from the repository.

---

## 1. Current supported paths

| Path | Bucket | Where |
| --- | --- | --- |
| Single-host evaluation (backend + Vite dev server) | ✅ | [QuickStart.md](QuickStart.md) |
| Linux backend + frontend (foreground) | ✅ | [LinuxDeployment.md](LinuxDeployment.md) |
| Backend only | ✅ | [BackendDeployment.md](BackendDeployment.md) |
| Frontend build/serve (dev server) | ✅ | [FrontendDeployment.md](FrontendDeployment.md) |
| Raspberry Pi + CUPS print agent | ✅ | [RaspberryPiPrintAgent.md](RaspberryPiPrintAgent.md) |

The validated reference build (Windows 11 backend/frontend + Raspberry Pi 3B
printer) is recorded in [KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md).

---

## 2. Repository deployment assets

**What actually ships to deploy with:**

- Dependency manifests: `backend/requirements.txt`, `frontend/package.json`
  (+ lockfile), `print-agent/requirements.txt`.
- Configuration examples: root `.env.example`, `frontend/.env.example`,
  `print-agent/.env.example`.
- Application source for all three components.
- Operational tooling: backup/restore scripts and the
  [DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md) runbook.

**What does not ship (❌):** Dockerfiles, Docker Compose, `systemd`/init units,
reverse-proxy or web-server configs, TLS/certificate tooling, a production
static-frontend host, and CI/CD deployment pipelines. A repository search
confirms there are **no** `Dockerfile`, `docker-compose*`, `*.service`,
`Procfile`, or `gunicorn` files.

---

## 3. Manual steps required

Every deployment today is **manual**:

- Create virtual environments and install dependencies by hand.
- Copy and edit two (or three, with printing) `.env` files.
- Start the backend and frontend as **separate foreground processes**.
- Restart everything by hand after any reboot or crash.
- Enrol, approve, and assign the print agent through the admin UI.

There is no one-command install, no orchestration, and no unattended bring-up.

---

## 4. Persistence requirements

The following **must** be preserved and backed up (all under `backend/`):

- `backend/visitor_kiosk.db` — the SQLite datastore.
- `backend/uploads/` — photos, badges, QR codes, theme logos.
- `backend/config/` — system settings.
- `backend/backups/` — snapshots (ideally also copied off-host).

The database path is fixed in code (no `DATABASE_URL`); the file is created in
the backend's start directory, so the backend must be started from `backend/`.
See [BackendDeployment.md § 6–7](BackendDeployment.md#6-database-initialisation).

---

## 5. Startup / supervision gaps

- ❌ No `systemd` unit, init script, Windows service, or supervisor ships for the
  backend, frontend, or print agent.
- ✅ Processes start cleanly in the foreground and are self-initialising
  (database, directories, admin, in-place migrations all happen on start).
- 🟡 You can add your own supervision (e.g. a `systemd` service), but it is
  unsupported and unvalidated, and you must handle the working-directory
  requirement (start the backend from `backend/`) yourself.

**Consequence:** the system is **not unattended-restart-safe** as shipped. A
reboot leaves it down until a human restarts both processes.

---

## 6. Frontend hosting gap

- ✅ The Vite **dev server** (`npm run dev`) is the validated way the UI is
  served, and `npm run build` produces a static bundle in `frontend/dist/`.
- ❌ No production static-file host, web-server config, or CDN setup ships for
  `frontend/dist/`.
- 🟡 `npm run preview` can serve a built bundle for local checking, but it is a
  preview server, not a production host.

**Consequence:** running the UI behind a real web server is a bring-your-own,
unsupported step. See [FrontendDeployment.md § 8](FrontendDeployment.md#8-serving-the-built-frontend).

---

## 7. Reverse-Proxy / TLS Status

- ❌ No reverse proxy (nginx/Caddy/etc.) configuration ships.
- ❌ No TLS termination, certificate provisioning, or HTTPS setup ships. The
  backend serves plain HTTP; the dev server serves plain HTTP.
- The reference deployment operates on a **trusted LAN** rather than using TLS.

**Consequence:** there is no shipped HTTPS. Browsers expose the camera only in a **secure
context** (`localhost` or HTTPS), so a **remote** kiosk reaching the server over plain HTTP
— even on a trusted LAN — **may have its camera blocked**, depending on the browser. Camera
capture is guaranteed only from a `localhost` browser or an HTTPS origin you provide;
enabling it on remote kiosk devices over the network is an **unresolved production-readiness
gap**, not a supported configuration. Related:
[FrontendDeployment.md § 9](FrontendDeployment.md#9-browser-and-camera-requirements).

---

## 8. Backup / restore readiness

- ✅ Backup and restore **tooling** ships, with documented manual procedures
  ([BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)) and a
  [disaster-recovery runbook](../DISASTER-RECOVERY.md).
- ✅ The `/health` readiness check verifies the backup destination is writable.
- ❌ No **scheduled/automated** backup ships — backups are run manually.
- Secrets (`.env`) are intentionally excluded from backups; store them
  separately.

**Consequence:** recoverability is good, but the backup **cadence** is a manual
operational responsibility.

---

## 9. Monitoring / health readiness

- ✅ Health endpoints ship: `/health/live` (liveness) and `/health` (readiness
  with per-subsystem status and `503` on critical failure), plus an operational
  dashboard in the admin UI.
- ❌ No external monitoring, alerting, uptime checks, or metrics/log shipping
  integration ships.
- 🟡 You can point your own monitor at `/health`, but nothing is pre-wired.

Operational use: [Troubleshooting.md § 2](../03-Operations/Troubleshooting.md#2-system-health-checks).

---

## 10. Print-Agent Readiness

- ✅ The agent enrols, is approved, is assigned to a station, and prints via CUPS
  on the validated Pi + QL-800 build.
- ❌ No auto-start for the agent (foreground process; manual restart after
  reboot).
- 🟡 **Dependency-manifest defect (open RC defect):** `print-agent/requirements.txt`
  declares only `requests`, but `print_agent.py` imports `python-dotenv`
  (`from dotenv import load_dotenv`). On a clean host the agent will not start
  until `python-dotenv` is installed. Resolution requires an application/manifest
  correction (a code change, out of scope for this documentation) **plus
  clean-install validation** before RC sign-off; it is not a routine install
  step. See
  [RaspberryPiPrintAgent.md § 6](RaspberryPiPrintAgent.md#6-repository-and-agent-installation).
- ❌ No Windows print agent (CUPS-only).

---

## 11. Docker Status

❌ **Not implemented.** There are no Docker or Compose assets in this repository.
Containerisation is listed by the project as a future (Milestone 10 / RTM) item
that has not been started. Do not document or assume a container deployment path.

---

## 12. Windows Status

- ✅ Windows 11 is the **validated** backend/frontend host in the reference
  build (foreground `uvicorn` + `npm run dev`).
- ❌ No Windows **service** packaging ships (running unattended as a service is a
  future RTM item).
- ❌ No Windows **print agent** (printing requires Linux/CUPS on a separate host).

---

## 13. Production risks

| Risk | Cause | Mitigation today |
| --- | --- | --- |
| Downtime after reboot/crash | No process supervision (§ 5) | Manual restart; add your own supervision. |
| Data loss | Single SQLite file; manual backups (§ 4, § 8) | Frequent manual backups + off-host copies. |
| No transport encryption | No TLS (§ 7) | Trusted, isolated LAN only. |
| Camera blocked off secure origin | No HTTPS (§ 7) | Serve via `localhost`/`127.0.0.1`, or add HTTPS/TLS yourself; a plain-HTTP trusted LAN is **not** a secure context (§ 7). |
| Print agent won't start on clean host | Missing `python-dotenv` (§ 10) | Install `python-dotenv` manually. |
| Indefinite PII retention | No retention/purge feature | Operational policy; see [SecurityControls.md](../06-Reference/SecurityControls.md). |
| Concurrency limits | Single-process SQLite | Single backend process only; do not run multiple workers. |

---

## 14. Recommended pre-production validation

Before relying on the system for a real event:

- [ ] Full run-through of [QuickStart.md](QuickStart.md) on the target hardware.
- [ ] `/health` returns `200` with all subsystems `ok`.
- [ ] End-to-end check-in **and** print on the real printer
      ([PrintOperations.md § 12](../03-Operations/PrintOperations.md#12-validation-checklist)).
- [ ] A **restore drill** from a backup on a scratch copy
      ([BackupAndRecovery.md § 6](../03-Operations/BackupAndRecovery.md#6-validation-after-restore)).
- [ ] A documented manual restart procedure for after a reboot.
- [ ] Network isolation / trusted-LAN confirmation (no TLS is provided).
- [ ] A decided, written backup cadence and off-host copy plan.

---

## 15. Verdict: READY / NOT READY

This verdict separates documentation completeness from system and operational
readiness. They are not the same, and operational approval cannot be inferred
from documentation alone.

- **Documentation readiness:** READY. The supported manual deployment paths in
  this folder are complete and source-verified.
- **Deployment documentation scope:** Complete for the currently supported manual
  deployment paths (single-host, Linux backend + frontend, backend-only,
  frontend build/serve, and the Raspberry Pi + CUPS print agent). It does not
  cover production packaging, which is not implemented.
- **Production readiness:** NOT READY. Process supervision / auto-start (§ 5),
  production frontend hosting (§ 6), TLS / reverse proxy (§ 7), and scheduled
  backups (§ 8) are not implemented, and the print-agent dependency-manifest
  defect (§ 10) is an open RC defect.
- **Operational readiness:** Not established by this documentation. Whether the
  system may be used for any real activity depends on completing or confirming
  the RC validation campaign (§ 14). Do not infer operational approval from these
  documents.

The blocking gaps for unattended production are, in priority order:

1. No process supervision / auto-start (§ 5).
2. No production frontend host (§ 6).
3. No TLS / reverse proxy (§ 7).
4. Manual-only backups — no schedule (§ 8).
5. Print-agent dependency-manifest defect (§ 10).

These align with the project's own roadmap, which places production packaging and
containerisation at Milestone 10 (RTM) — not yet started. Any deployment carried
out from these documents must be treated as unvalidated until the § 14 checks
have been completed on the target hardware, and must not be run unattended.
