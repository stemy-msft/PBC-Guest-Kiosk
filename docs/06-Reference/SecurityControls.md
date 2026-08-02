# Security Controls — Reference

**Status:** Authoritative reference (Documentation Wave 2, P0).
**Applies to release:** `v1.0.0-rc.2`.
**Scope of this document:** **Implemented** controls only. Every control below was
verified against current code with its implementation location cited. Planned or
proposed controls are **not** described here; genuine gaps are listed under
[Known residuals](#known-residuals) so they are not mistaken for controls.

Configuration values referenced here are defined in
[EnvironmentVariables.md](EnvironmentVariables.md).

---

## 1. Authentication

**Purpose:** Establish who a staff user is before granting access to protected
operations.

**Scope:** All staff/admin API operations. The public kiosk paths (visitor
check-in, visitor photo upload, guest print-status polling) are intentionally
unauthenticated self-service and are out of scope for staff authentication.

**Implementation location:** `backend/app/auth.py`; login endpoint in
`backend/app/main.py` (`POST /api/auth/login`).

- **Bearer JWT sessions, no cookies.** On successful login the backend issues a
  signed JWT (`create_access_token`). Clients send it as
  `Authorization: Bearer <token>`; the frontend holds it in `localStorage`. No
  session cookies are used — which is why credentialed CORS is disabled (see §4).
- **Token validation.** `_decode_username` verifies the signature and pins the
  algorithm (`algorithms=[JWT_ALGORITHM]`, default `HS256`), preventing
  algorithm-substitution attacks. A missing/invalid token yields `401`.
- **Database-backed session check.** `get_current_user` re-loads the user on every
  request and rejects the token (`401`) if the account was since deleted or
  disabled — a token cannot outlive its account.
- **Password storage.** Passwords are hashed with `pwdlib`'s recommended hasher
  (Argon2, `argon2-cffi`) via `hash_password` / `verify_password`. Plaintext
  passwords are never stored.
- **Fail-fast secret.** The backend refuses to start if `JWT_SECRET_KEY` is unset
  (`RuntimeError`).

**Operational considerations:** Set a long, random `JWT_SECRET_KEY`; rotating it
logs everyone out. Session lifetime is `JWT_EXPIRE_MINUTES` (default 8h) — tune to
your front-desk risk tolerance. Because the token lives in browser storage, serve
the UI over a trusted network or HTTPS.

---

## 2. Authorization (RBAC)

**Purpose:** Restrict privileged operations to administrators.

**Scope:** Administrative endpoints — system settings, user management, theme
management, print-station management, and print-agent approval/rotation.

**Implementation location:** `backend/app/auth.py` (`require_admin`);
`user.role` column in `backend/app/models.py`; enforced across
`backend/app/main.py` via `Depends(require_admin)`.

- **Two effective privilege levels, enforced in code:**
  1. **Administrator** — the only role the code checks. `require_admin` compares
     the user's stored role to the exact string `"Administrator"` and returns
     `403` otherwise. The role is always read from the user's **current database
     record**, never trusted from the client.
  2. **Authenticated staff** — any enabled user with a valid token, gated by
     `get_current_user`, may use general protected endpoints that are not
     admin-only.
- **Role is a free-form string.** `role` is stored as an unconstrained string
  column. The system enforces exactly one distinction — Administrator vs.
  non-Administrator. Any other role labels that may be assigned (for example
  descriptive labels for front-desk staff) carry **no separate code-enforced
  permissions** today; they have the same effective access as any authenticated
  staff user. Do not assume finer-grained role enforcement than this.
- **Built-in administrator protection.** The built-in administrator account cannot
  be disabled (guarded in the user-management endpoint).

**Operational considerations:** Grant the Administrator role sparingly. Treat all
non-administrator accounts as having equivalent (authenticated-staff) access when
planning least-privilege.

---

## 3. Account lockout (F-009)

**Purpose:** Blunt online password-guessing against the login endpoint.

**Scope:** `POST /api/auth/login` for all staff accounts.

**Implementation location:** `backend/app/main.py` (login handler and
`_load_lockout_policy`); `User.locked_until` and `User.failed_login_count` in
`backend/app/models.py`. Policy inputs: `config/system_settings.json` (source of
truth) with `PBC_LOGIN_LOCKOUT_THRESHOLD` / `PBC_LOGIN_LOCKOUT_MINUTES` as
fallback.

- **Lock before verify.** An account with an active lock is rejected (`401`)
  *before* the password is checked, so a locked account cannot be probed even with
  the correct password.
- **Threshold and window.** After `THRESHOLD` consecutive failures the account is
  locked for `MINUTES`. A threshold of `0` disables lockout. The window
  auto-unlocks on expiry and the failure counter resets on any successful login.
- **Policy precedence.** The System Settings screen writes
  `config/system_settings.json`, which wins; the environment variables are the
  first-run/fallback default only.
- **Auditability.** Login outcomes are recorded via the audit log with actions
  `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_LOCKED`, `ACCOUNT_UNLOCKED`, and
  `LOGIN` (see §6).

**Operational considerations:** At a busy shared front desk, an overly aggressive
threshold can lock legitimate staff — the default (5 attempts / 15 minutes) is a
reasonable starting point. Administrators can adjust the policy live on the
Settings screen without a restart.

---

## 4. Cross-Origin Resource Sharing (CORS) (F-008)

**Purpose:** Constrain which browser origins may call the API.

**Scope:** All browser-originated API requests.

**Implementation location:** resolver `backend/app/cors_config.py`
(`resolve_cors_origins`); middleware wiring in `backend/app/main.py`. Inputs:
`PBC_ENV`, `PBC_CORS_ALLOWED_ORIGINS`.

- **Credentials disabled.** `allow_credentials=False` — auth is bearer-token, not
  cookie-based, so credentialed CORS is unnecessary and a wildcard origin is
  neither needed nor accepted alongside credentials.
- **Strict allowlist.** Origins are validated as `scheme://host[:port]` (http/https
  only; no path/query/fragment; no malformed port). Malformed entries are
  rejected. Duplicates are de-duplicated.
- **Environment-aware fail-fast.** In `production`, an empty allowlist is a fatal
  startup error. In `development`, an empty allowlist falls back to localhost
  defaults (`http://localhost:5173`, `http://127.0.0.1:5173`).
- **Method/header surface.** Allowed methods are
  `GET, POST, PUT, PATCH, DELETE, OPTIONS`; allowed request headers are
  `Authorization, Content-Type`; `Content-Disposition` is exposed for downloads.

**Operational considerations:** List exactly the origins that serve the kiosk/admin
UI. If the UI and API are same-origin behind a reverse proxy, no origin entry is
required for that path. Setting `PBC_ENV=production` without
`PBC_CORS_ALLOWED_ORIGINS` will (by design) stop the backend from starting.

---

## 5. Upload boundaries (F-010)

**Purpose:** Contain the risk of user-supplied image uploads (memory exhaustion,
decompression bombs, embedded payloads, path traversal).

**Scope:** The two upload endpoints — the **public** visitor-photo upload
(`POST /api/visitors/{id}/photo`, intentionally unauthenticated kiosk
self-service) and the **admin** theme-logo upload (`POST /api/themes/{id}/logo`).

**Implementation location:** `backend/app/main.py` (`upload_photo`, theme-logo
handler, and the global `Image.MAX_IMAGE_PIXELS` setting). Limits from
`PBC_MAX_PHOTO_*`, `PBC_MAX_LOGO_*`, `PBC_MAX_IMAGE_PIXELS`.

- **Byte cap before decode.** The raw upload is read against its size cap and
  rejected with `413` if it exceeds the limit, before any decoding — an empty body
  yields `400`.
- **Safe decode.** The image is opened and loaded inside a `try/except`; any decode
  failure (non-image or truncated file) returns `400`, never a `500`.
- **Decompression-bomb guard.** A global `Image.MAX_IMAGE_PIXELS` ceiling applies
  to **every** decode path in the app (photos, logos, and badge reuse), so an image
  that is small on disk but enormous when decoded is rejected.
- **Re-encode strips payloads.** Accepted images are transposed by EXIF
  orientation, converted to RGB, downscaled to the dimension cap, and re-encoded.
  Re-encoding discards any embedded/non-image payload.
- **Server-controlled filename.** The stored filename is derived from the integer
  visitor/theme id, so a malicious client-supplied filename cannot cause path
  traversal.

**Operational considerations:** The photo endpoint is deliberately public for
walk-up self-service; its protection is the size/pixel bounds above, not
authentication. Raising the limits increases per-request memory use. There is no
per-client rate limit on the public photo endpoint today (see
[Known residuals](#known-residuals)).

---

## 6. Audit logging

**Purpose:** Provide an append-only operational record of security-relevant and
administrative actions.

**Scope:** Authentication outcomes, administrative changes (users, themes,
settings, stations, print-agent approval), print-queue actions, and visitor
check-in/checkout — including anonymous kiosk check-ins.

**Implementation location:** `backend/app/main.py` — `audit_logger` and the
`audit(user, action, details)` helper; records are written to `logs/audit.log`
using a rotating file handler (5 MB × 10 backups).

- **Structured lines.** Each entry records the acting user (or the submitted
  username / `anonymous` context), an action code, and details.
- **Coverage examples.** `LOGIN`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`,
  `ACCOUNT_UNLOCKED`, `CHANGE_PASSWORD`, `CREATE/UPDATE/DELETE_THEME`,
  `UPLOAD_THEME_LOGO`, check-in/checkout events, print-job and print-station
  operations, and print-agent approvals.
- **Crash-resilient rotation.** A `SafeRotatingFileHandler` keeps logging even if a
  rotation rename is transiently blocked (a real issue when the repository lives on
  a file-syncing folder such as OneDrive), so audit continuity is preserved.

**Operational considerations:** The audit log is on the application host's disk.
Include `logs/` in operational backups or ship it off-host if you need tamper-
evident retention. Rotation caps on-disk size; increase `backupCount` if you need
longer local history.

---

## 7. Print-agent authentication

**Purpose:** Ensure only enrolled, approved print agents can claim and complete
print jobs.

**Scope:** All print-agent API endpoints.

**Implementation location:** `backend/app/auth.py` — `require_print_agent`,
`resolve_print_agent_credential`, `generate_agent_token`, `hash_agent_verifier`;
`PrintAgent` / `PrintAgentCredential` in `backend/app/models.py`.

- **Per-agent bearer credential.** Each agent authenticates with its own token of
  the form `selector.verifier` — never a staff JWT. The selector is a public
  lookup handle stored in plaintext; only a one-way hash of the verifier is
  persisted.
- **Strict enforcement.** No `Authorization: Bearer` header → `401`. A well-formed
  token with a missing/revoked credential or verifier mismatch, or whose owning
  agent no longer exists → `401`. A valid token for a **disabled** agent → `403`.
- **Admin approval.** Agents are approved/disabled by an administrator before they
  operate; credentials can be issued and revoked.

**Operational considerations:** Treat the agent's `.env` (which holds its issued
key/token) as secret. Disabling an agent in the admin UI immediately blocks its
access. See station-enrollment mechanics in
[EnvironmentVariables.md](EnvironmentVariables.md#3-print-agent)
(`PBC_PRINT_AGENT_KEY` / `PBC_PRINT_STATION_SLUG`).

---

## 8. Backup protections

**Purpose:** Produce restorable, integrity-checked snapshots without corrupting a
running database.

**Scope:** The operational SQLite database, uploads (photos, badges, QR codes,
theme logos), and runtime-mutable config.

**Implementation location:** `backend/app/backup.py` (stdlib-only; decoupled from
the app so it runs as a standalone tool and is unit-testable). Operational runbook:
[DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md).

- **Crash-consistent DB copy.** The database is copied with SQLite's online backup
  API (`sqlite3.Connection.backup`), never a raw file copy, so a snapshot taken
  while the backend runs is transactionally consistent.
- **Integrity verification.** Every snapshot's database copy is verified with
  `PRAGMA integrity_check`; a copy that fails is not counted as a valid backup.
- **Manifest + scoped contents.** Each snapshot carries a `manifest.json` and
  captures uploads and the runtime config files; the tracked settings **template**
  is intentionally excluded (it is not runtime state).
- **Restore safety.** On restore, stale SQLite sidecar files (`-wal`, `-shm`,
  `-journal`) are cleared so an old journal cannot shadow the restored database;
  backup labels are validated to prevent path escape.

**Operational considerations:** Backups contain visitor PII (photos) and runtime
config. Store them with access controls at least as strong as the host, and keep
secret-bearing `.env` files out of the same low-trust location (see §10). Follow
[DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md) for procedures and retention.

---

## 9. Configuration and startup protections

**Purpose:** Prevent the system from running in an unsafe or half-configured state.

**Scope:** Backend startup and configuration loading.

**Implementation location:** `backend/app/auth.py` (JWT presence check);
`backend/app/main.py` and `backend/app/cors_config.py` (CORS fail-fast); settings
seeding in `backend/app/main.py`.

- **Fail-fast on missing secret.** No `JWT_SECRET_KEY` → the backend refuses to
  start.
- **Fail-fast on missing production CORS.** `PBC_ENV=production` with an empty
  `PBC_CORS_ALLOWED_ORIGINS` → startup error.
- **Settings seeding.** On first run the live `config/system_settings.json` is
  seeded from the tracked `system_settings.template.json`; the live file is
  git-ignored runtime state.

**Operational considerations:** Treat a failed startup as a configuration signal,
not a bug — check the missing secret or CORS allowlist first.

---

## 10. Secrets handling

**Purpose:** Keep credentials out of source control and out of low-trust copies.

**Scope:** `JWT_SECRET_KEY`, the bootstrap admin password, and print-agent
key/token.

**Implementation location:** git-ignored `.env` files loaded via `python-dotenv`
(`backend/app/auth.py`, `backend/app/config.py`, `print-agent/print_agent.py`).

- **`.env` is git-ignored** in all three components; only `*.env.example`
  placeholders are tracked.
- **Secrets are not part of the backup set’s config capture** — backups capture
  runtime operator config, not the root `.env`.

**Operational considerations:** Restrict filesystem permissions on each `.env` to
the account that runs the component. When storing backups off-host, do not co-locate
the `.env` secrets in the same lower-trust destination.

---

## 11. Health-monitoring protections

**Purpose:** Distinguish "process is up" from "able to serve check-in", so an
operator or uptime monitor can react before visitors are affected.

**Scope:** Readiness and liveness endpoints.

**Implementation location:** `backend/app/main.py` (`GET /health`,
`GET /health/live`); liveness math in `backend/app/liveness.py`.

- **Readiness with real dependency checks.** `GET /health` checks the database,
  required directories, configuration, and the backup subsystem, and returns
  **HTTP 503** if any *critical* check fails. It reports the running `version` and
  `release`. Print-infrastructure state (online agents, enabled stations) is
  reported but is **informational only** — zero online agents does not flip the
  service to unhealthy.
- **Liveness.** `GET /health/live` is a lightweight "process alive" probe.
- **Canonical liveness definition.** `liveness.py` is the single, timezone-safe
  source of truth for whether an agent is "online" (60-second window) and a
  station's status (`online` / `stale` / `offline` / `maintenance`), so the
  dashboard, lists, and `/health` never disagree.

**Operational considerations:** Point an uptime monitor at `/health` and treat 503
as "stop sending visitors here". These endpoints expose only coarse operational
state and no secrets. Deeper monitoring/alerting runbook guidance is future
Operations documentation, not part of this reference.

---

## Known residuals

These are **not** implemented controls; they are documented so the posture is not
overstated. (Sourced from the M9.3.4 security-validation review.)

- **JWT secret strength is not validated** — only presence is enforced. A weak or
  placeholder `JWT_SECRET_KEY` is accepted silently. Operational mitigation: set a
  strong secret (see [EnvironmentVariables.md](EnvironmentVariables.md#11-authentication-jwt)).
- **Username enumeration (low).** A disabled account returns `403` while an unknown
  username returns `401`, which can distinguish the two. Low severity.
- **No rate limit on the public photo-upload endpoint** — it is bounded by size and
  pixel caps (§5) but not by per-client request rate.

---

## Related references

- [EnvironmentVariables.md](EnvironmentVariables.md) — configuration inputs for
  these controls.
- [DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md) — authoritative backup/restore
  runbook.
- [HardwareMatrix.md](HardwareMatrix.md) / [SoftwareMatrix.md](SoftwareMatrix.md) —
  platform context.
