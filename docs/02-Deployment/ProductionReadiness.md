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

**What does not ship (❌):** `systemd`/init units, `Procfile`/`gunicorn` process
management, and CI/CD deployment pipelines.

**What now ships (✅, added post-RC):** an optional container deployment —
Dockerfiles, Docker Compose (direct and Caddy variants), an nginx reverse proxy
for the frontend, and optional Caddy TLS termination. See
[../container-deployment.md](../container-deployment.md). This path is validated
for pilot use; the native foreground process remains the default described below.

---

## 3. Manual steps required

The native deployment path is **manual**:

- Create virtual environments and install dependencies by hand.
- Copy and edit two (or three, with printing) `.env` files.
- Start the backend and frontend as **separate foreground processes**.
- Restart everything by hand after any reboot or crash.
- Enrol, approve, and assign the print agent through the admin UI.

The optional container path provides Compose orchestration and `restart:
unless-stopped` for the backend/frontend containers, but still requires manual
environment setup, backup scheduling, print-agent setup, and release operations.
See [../container-deployment.md](../container-deployment.md).

---

## 4. Persistence requirements

For the native path, the following **must** be preserved and backed up (all
under `backend/`):

- `backend/visitor_kiosk.db` — the SQLite datastore.
- `backend/uploads/` — photos, badges, QR codes, theme logos.
- `backend/config/` — system settings.
- `backend/backups/` — snapshots (ideally also copied off-host).

The database path is fixed in code (no `DATABASE_URL`); the file is created in
the backend's start directory, so the backend must be started from `backend/`.
See [BackendDeployment.md § 6–7](BackendDeployment.md#6-database-initialisation).

For containers, the equivalent state is stored in the `kiosk_db`,
`kiosk_uploads`, `kiosk_logs`, and `kiosk_config` named volumes. The database is
`/data/visitor_kiosk.db`; live settings/themes are under `/app/config`. See
[Container Deployment §11](../container-deployment.md#11-backup-and-restore).

---

## 5. Startup / supervision gaps

- ❌ No `systemd` unit, init script, Windows service, or supervisor ships for the
  backend, frontend, or print agent.
- ✅ Processes start cleanly in the foreground and are self-initialising
  (database, directories, admin, in-place migrations all happen on start).
- 🟡 You can add your own supervision (e.g. a `systemd` service), but it is
  unsupported and unvalidated, and you must handle the working-directory
  requirement (start the backend from `backend/`) yourself.

**Consequence:** the native path is **not unattended-restart-safe** as shipped.
A reboot leaves it down until a human restarts both processes. The container
backend/frontend use `restart: unless-stopped`; the separate print agent still
requires its own startup supervision or a manual restart.

---

## 6. Frontend hosting gap

- ✅ The Vite **dev server** (`npm run dev`) is the validated way the UI is
  served, and `npm run build` produces a static bundle in `frontend/dist/`.
- ✅ The optional container path serves `frontend/dist/` with unprivileged nginx
  and has been validated for pilot use.
- ❌ The native path does not ship a standalone production static-file service,
  service unit, or CDN setup for `frontend/dist/`.
- 🟡 `npm run preview` can serve a built bundle for local checking, but it is a
  preview server, not a production host.

**Consequence:** native production hosting remains bring-your-own. Use the
pilot-validated container path when the shipped nginx configuration is
appropriate. See [FrontendDeployment.md § 8](FrontendDeployment.md#8-serving-the-built-frontend)
and [Container Deployment](../container-deployment.md).

---

## 7. Reverse-Proxy / TLS Status

- ✅ The container path ships nginx reverse-proxy configuration and an optional
  Caddy variant configured to request automatic HTTPS for an authorized public
  domain; public ACME issuance remains a production-site acceptance test.
- ❌ The native foreground path does not provide TLS termination or certificate
  provisioning; the backend and Vite dev server use plain HTTP.
- The validated native reference deployment operates on a **trusted LAN**.

**Consequence:** native/direct HTTP deployments do not provide a secure origin.
Browsers expose the camera only in a **secure context** (`localhost` or HTTPS),
so a **remote** kiosk reaching the server over plain HTTP
— even on a trusted LAN — **may have its camera blocked**, depending on the browser. Camera
capture is guaranteed only from a `localhost` browser or an HTTPS origin. For
remote container kiosks, use the Caddy/HTTPS variant; public certificate issuance
still requires operator-controlled DNS and reachable ports 80/443. Related:
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
- ✅ **Dependencies declared:** `print-agent/requirements.txt` declares both
  `requests` and `python-dotenv`, matching the agent's imports, so a clean
  `pip install -r requirements.txt` installs everything `print_agent.py` needs.
  See
  [RaspberryPiPrintAgent.md § 6](RaspberryPiPrintAgent.md#6-repository-and-agent-installation).
- ❌ No Windows print agent (CUPS-only).

---

## 11. Docker Status

✅ **Available (optional).** The repository now ships a container deployment:
backend and frontend Dockerfiles, Docker Compose (direct and Caddy variants),
and named-volume persistence. It has been validated end-to-end on Docker Desktop
and is **approved for pilot** use. Full instructions:
[../container-deployment.md](../container-deployment.md). The native foreground
process (documented in this folder) remains the default path.

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
| Downtime after reboot/crash | Native path and print agent lack supervision (§ 5) | Use container restart policies for backend/frontend; provide print-agent/native supervision or a manual restart procedure. |
| Data loss | Single SQLite file; manual backups (§ 4, § 8) | Frequent manual backups + off-host copies. |
| No transport encryption (native/direct HTTP) | TLS not enabled (§ 7) | Trusted isolated LAN only, or use the container Caddy/HTTPS variant. |
| Camera blocked off secure origin | Plain HTTP (§ 7) | Serve via `localhost`/`127.0.0.1` or use the container Caddy/HTTPS variant; a plain-HTTP trusted LAN is **not** a secure context. |
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
- [ ] For native/direct HTTP: network isolation and trusted-LAN confirmation.
  For remote kiosks: Caddy/HTTPS with authorized DNS and validated camera access.
- [ ] A decided, written backup cadence and off-host copy plan.

For a container deployment, also complete the checks in
[Container Deployment §6](../container-deployment.md#6-deployment-instructions),
verify `/health` through the published frontend/Caddy origin, complete a
backup/restore drill, and verify the separate print agent against that same
public origin.

---

## 15. Verdict: READY / NOT READY

This verdict separates documentation completeness from system and operational
readiness. They are not the same, and operational approval cannot be inferred
from documentation alone.

- **Documentation readiness:** **READY FOR RTM DOCUMENTATION FREEZE PENDING
  OWNER CONTENT.** The supported manual deployment paths in this folder and the
  pilot-validated container path are complete and source-verified.
- **Deployment documentation scope:** Complete for the currently supported manual
  deployment paths (single-host, Linux backend + frontend, backend-only,
  frontend build/serve, and the Raspberry Pi + CUPS print agent), plus the
  optional pilot-validated container path.
- **Production readiness:** NOT READY. The container path addresses backend/
  frontend restart policy, static hosting, reverse proxy, and optional TLS, but
  public TLS issuance, print-agent startup supervision, scheduled backups, and
  final operational acceptance remain operator responsibilities.
- **Operational readiness:** Not established by this documentation. Whether the
  system may be used for any real activity depends on completing or confirming
  the RC validation campaign (§ 14). Do not infer operational approval from these
  documents.

The remaining product and operational release gates are, in priority order:

1. Production-domain DNS, public TLS issuance, and network validation (§ 7).
2. Physical printer and camera acceptance testing on target hardware (§ 14).
3. Backup scheduling and off-host retention ownership (§ 8).
4. Print-agent startup supervision / auto-start (§ 5, § 10).
5. Final release acceptance evidence (§ 14).

The project roadmap placed production packaging and containerisation at Milestone
10 (RTM); the container path is now available (§ 11,
[../container-deployment.md](../container-deployment.md)) and validated for pilot.
Any native deployment carried out from these documents must be treated as
unvalidated until the § 14 checks have been completed on the target hardware, and
must not be run unattended.
