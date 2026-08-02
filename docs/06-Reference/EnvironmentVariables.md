# Environment Variables — Reference

**Status:** Authoritative reference (Documentation Wave 2, P0).
**Applies to release:** `v1.0.0-rc.2`.
**Rule:** This document is the single source of truth for configuration. Other
documents link here rather than restate variables. Every entry below was verified
against the code that reads it; the reading location is cited so the value can be
re-verified.

> **Where values come from.** Each component loads a git-ignored `.env` file at
> startup (via `python-dotenv` for the backend and print agent, and Vite for the
> frontend). Copy the tracked example and edit the copy — never commit the real
> `.env`:
>
> | Component | Example file | Real file (git-ignored) |
> | --- | --- | --- |
> | Backend | [.env.example](../../.env.example) | `.env` (repo root) |
> | Frontend | [frontend/.env.example](../../frontend/.env.example) | `frontend/.env` |
> | Print agent | [print-agent/.env.example](../../print-agent/.env.example) | `print-agent/.env` |

---

## 1. Backend

Read by the FastAPI backend under `backend/app/`. Values are read once at process
startup, so a change requires a backend restart.

### 1.1 Authentication (JWT)

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `JWT_SECRET_KEY` | **Yes** | *(none — startup fails if unset)* | `backend/app/auth.py` |
| `JWT_ALGORITHM` | Optional | `HS256` | `backend/app/auth.py` |
| `JWT_EXPIRE_MINUTES` | Optional | `480` (8 hours) | `backend/app/auth.py` |

- **`JWT_SECRET_KEY`** — Signing key for staff session tokens.
  - *Description:* HMAC signing secret for issued JWTs. If unset, the backend
    raises `RuntimeError` at startup and refuses to run (fail-fast).
  - *Security implications:* **Highest-sensitivity secret in the system.** Anyone
    who knows it can forge valid staff sessions. Use a long (32+ character) random
    value. Changing it invalidates every existing login session. Only its
    *presence* is enforced today — strength/placeholder text is **not** validated
    (see [SecurityControls.md](SecurityControls.md#known-residuals)).
  - *Example:* `JWT_SECRET_KEY=8s2f...long-random-secret...9dQ2`
- **`JWT_ALGORITHM`** — Signature algorithm. Decoding pins this exact algorithm,
  preventing algorithm-substitution attacks. Leave at `HS256` unless you have a
  specific reason to change it. *Example:* `JWT_ALGORITHM=HS256`
- **`JWT_EXPIRE_MINUTES`** — Session token lifetime in minutes. Lower values
  reduce the window a stolen token is usable; higher values reduce re-login
  friction at a front desk. *Example:* `JWT_EXPIRE_MINUTES=480`

### 1.2 Initial administrator bootstrap

Used **only** to create the first administrator when no user exists yet
(`backend/app/config.py`, consumed by `backend/app/bootstrap.py`). Ignored once an
account exists.

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `PBC_DEFAULT_ADMIN_USERNAME` | Optional | `admin` | `backend/app/config.py` |
| `PBC_DEFAULT_ADMIN_PASSWORD` | Optional | `ChangeMeNow!` | `backend/app/config.py` |
| `PBC_DEFAULT_ADMIN_DISPLAY_NAME` | Optional | `Administrator` | `backend/app/config.py` |

- *Security implications:* The bootstrap account is created with "must change
  password" enabled, so the default password must be changed at first login.
  **Do not leave `PBC_DEFAULT_ADMIN_PASSWORD` at its default** for any reachable
  deployment — set a strong value before first startup, or change the password
  immediately after. These variables are only consulted while no user exists.
- *Example:* `PBC_DEFAULT_ADMIN_USERNAME=admin` / `PBC_DEFAULT_ADMIN_PASSWORD=<strong-unique-password>`

### 1.3 Account lockout (F-009)

Brute-force protection for the login endpoint (`backend/app/main.py`). These
environment values are the **fallback default**; if the System Settings screen
(`config/system_settings.json`) defines the policy, that file wins. See
[SecurityControls.md](SecurityControls.md#3-account-lockout-f-009).

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `PBC_LOGIN_LOCKOUT_THRESHOLD` | Optional | `5` | `backend/app/main.py` |
| `PBC_LOGIN_LOCKOUT_MINUTES` | Optional | `15` | `backend/app/main.py` |

- **`PBC_LOGIN_LOCKOUT_THRESHOLD`** — Consecutive failed logins before the account
  locks. **Set to `0` to disable lockout entirely.** *Example:* `5`
- **`PBC_LOGIN_LOCKOUT_MINUTES`** — How long an account stays locked before it
  auto-unlocks. *Example:* `15`
- *Security implications:* Lower threshold / longer minutes hardens against
  password guessing but increases the chance of a legitimate lockout at a busy
  desk. A threshold of `0` removes brute-force protection — not recommended.

### 1.4 CORS / cross-origin access (F-008)

Controls which browser origins may call the API (`backend/app/main.py`, resolver
in `backend/app/cors_config.py`). See
[SecurityControls.md](SecurityControls.md#4-cross-origin-resource-sharing-cors-f-008).

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `PBC_ENV` | Optional | `development` | `backend/app/main.py` |
| `PBC_CORS_ALLOWED_ORIGINS` | **Required in production** | *(none)* | `backend/app/main.py` |

- **`PBC_ENV`** — `development` (default) or `production`. In `development`, if
  `PBC_CORS_ALLOWED_ORIGINS` is unset, safe localhost defaults
  (`http://localhost:5173`, `http://127.0.0.1:5173`) are applied. In
  `production`, an empty allowlist is a fatal startup error. *Example:* `production`
- **`PBC_CORS_ALLOWED_ORIGINS`** — Comma-separated list of exact origins
  (`scheme://host[:port]`, no trailing slash or path). List every browser origin
  that serves the kiosk/admin UI. Same-origin behind a reverse proxy needs no
  entry.
  - *Security implications:* Authentication is bearer-token only (no cookies), so
    credentialed CORS is disabled and a wildcard `*` is neither needed nor
    accepted with credentials. Keep this list to exactly the origins you serve.
  - *Example:* `PBC_CORS_ALLOWED_ORIGINS=https://kiosk.example.org,https://admin.example.org`

### 1.5 Uploads / image limits (F-010)

Bounds for user-supplied images — visitor photos and theme logos
(`backend/app/main.py`). Every upload is decoded through Pillow and re-encoded.
See [SecurityControls.md](SecurityControls.md#5-upload-boundaries-f-010).

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `PBC_MAX_PHOTO_UPLOAD_BYTES` | Optional | `5242880` (5 MB) | `backend/app/main.py` |
| `PBC_MAX_PHOTO_DIMENSION` | Optional | `1600` (px, longest edge) | `backend/app/main.py` |
| `PBC_MAX_LOGO_UPLOAD_BYTES` | Optional | `2097152` (2 MB) | `backend/app/main.py` |
| `PBC_MAX_LOGO_DIMENSION` | Optional | `512` (px, longest edge) | `backend/app/main.py` |
| `PBC_MAX_IMAGE_PIXELS` | Optional | `24000000` (24 MP) | `backend/app/main.py` |

- **`*_UPLOAD_BYTES`** — Raw upload larger than this is rejected with HTTP 413
  *before* any decoding.
- **`*_DIMENSION`** — Longest-edge pixel cap; larger images are downscaled.
- **`PBC_MAX_IMAGE_PIXELS`** — Global decoded-pixel ceiling applied to **every**
  image decode (photos, logos, and badge reuse). Guards against decompression
  "bomb" files regardless of on-disk size.
- *Security implications:* These are the DoS/memory-exhaustion guardrails on the
  public photo-upload path. Raising them materially increases the memory a single
  request can allocate. *Example:* `PBC_MAX_PHOTO_UPLOAD_BYTES=5242880`

### 1.6 Badge rendering

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `PBC_BADGE_THEME` | Optional | `PBC_standard` | `backend/app/services/badge_service.py` |

- **`PBC_BADGE_THEME`** — Post-RTM scaffolding for selectable badge themes; **not an
  operational control in v1.** There is no UI to choose or create badge themes, and no
  alternative theme has been built or tested — the only other named theme is identical
  to `PBC_standard`, so changing the value does not change the badge. Badge colors,
  styling, and **layout** (dimensions/positions) are fixed in code for v1. **Leave at
  the default.**
  - *Security implications:* None directly. An unrecognized value produces
    incorrect or failed badge rendering. *Example:* `PBC_BADGE_THEME=PBC_standard`

> **Not environment-configurable (do not add).** The database location is
> hard-coded to `sqlite:///visitor_kiosk.db` in `backend/app/database.py` — there
> is **no** `DATABASE_URL` environment variable. Log directory and backup paths
> are computed from the backend directory, not read from the environment.

---

## 2. Frontend

Read by the Vite/React frontend at **build time** (`frontend/src/`). A change
requires rebuilding (`npm run build`) or restarting the dev server.

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `VITE_API_BASE` | Optional | `""` (empty = same origin) | `frontend/src/api.js`, `frontend/src/App.jsx` |

- **`VITE_API_BASE`** — Base URL of the backend API as reachable from the kiosk
  **browser** (not from the server). When empty, the frontend calls the API on its
  own origin — correct when the UI and API are served together behind one
  host/proxy. Set it to the backend host/IP when the UI is served separately.
  - *Security implications:* Must be an origin the browser can reach; if the
    backend enforces CORS in production, this origin's page must be listed in
    `PBC_CORS_ALLOWED_ORIGINS`. Only the `VITE_`-prefixed value is exposed to the
    browser bundle — never place secrets in frontend env vars.
  - *Example:* `VITE_API_BASE=http://192.168.0.210:8000`

---

## 3. Print Agent

Read by `print-agent/print_agent.py` on the print server (Raspberry Pi / Linux).
Read at agent startup.

| Variable | Required | Default | Read at |
| --- | --- | --- | --- |
| `PBC_API_BASE` | Optional | `http://192.168.0.210:8000` | `print-agent/print_agent.py` |
| `PBC_PRINTER_NAME` | Optional | `QL800_BROTHER` | `print-agent/print_agent.py` |
| `PBC_PRINT_AGENT_POLL_SECONDS` | Optional | `2` | `print-agent/print_agent.py` |
| `PBC_PRINT_TIMEOUT_SECONDS` | Optional | `60` | `print-agent/print_agent.py` |
| `PBC_PRINT_DOWNLOAD_DIR` | Optional | `./downloaded-badges` | `print-agent/print_agent.py` |
| `PBC_PRINT_AGENT_TOKEN` | Optional | `""` (empty) | `print-agent/print_agent.py` |
| `PBC_PRINT_AGENT_KEY` | Optional (managed) | `""` (empty) | `print-agent/print_agent.py` |
| `PBC_PRINT_STATION_SLUG` | Optional (managed) | `""` (empty) | `print-agent/print_agent.py` |

- **`PBC_API_BASE`** — Backend API URL reachable from the print server. A trailing
  slash is stripped. Point this at your real backend host. *Example:*
  `http://192.168.0.210:8000`
- **`PBC_PRINTER_NAME`** — CUPS printer **queue** name on the print server (as
  shown by `lpstat -p`). *Example:* `QL800_BROTHER`
- **`PBC_PRINT_AGENT_POLL_SECONDS`** — How often the agent polls the backend for
  pending jobs. Lower = faster printing, more requests. *Example:* `2`
- **`PBC_PRINT_TIMEOUT_SECONDS`** — Per-job print timeout. *Example:* `60`
- **`PBC_PRINT_DOWNLOAD_DIR`** — Local directory the agent uses to stage badge
  images before printing. *Example:* `./downloaded-badges`
- **`PBC_PRINT_AGENT_TOKEN`** — Optional bearer token sent to the backend if set;
  leave blank if unused.
  - *Security implications:* When set, this is a credential — keep the agent
    `.env` readable only by the agent's user.
- **`PBC_PRINT_AGENT_KEY`** and **`PBC_PRINT_STATION_SLUG`** — Station-enrollment
  identity. **These are managed automatically:** the agent writes them back to its
  own `.env` the first time it registers with the backend and is assigned to a
  print station. Leave both blank on a fresh install; do not set them by hand.
  - *Security implications:* `PBC_PRINT_AGENT_KEY` is the agent's issued identity
    key — treat the agent `.env` as secret once enrollment has populated it.
  - *Example:* *(blank on first run; populated by the agent after enrollment)*

---

## 4. Precedence and startup rules (summary)

- **Restart to apply.** Backend and print-agent variables are read once at
  startup; the frontend reads them at build/dev-server start. Restart or rebuild
  after any change.
- **Settings file overrides env for lockout.** The account-lockout policy uses
  `config/system_settings.json` when present; `PBC_LOGIN_LOCKOUT_*` is only the
  first-run/fallback default.
- **Production fails fast on missing CORS.** With `PBC_ENV=production`, the backend
  refuses to start if `PBC_CORS_ALLOWED_ORIGINS` is empty.
- **Missing JWT secret is fatal.** The backend refuses to start if
  `JWT_SECRET_KEY` is unset.
- **Secrets live in `.env`, never in git.** All three `.env` files are
  git-ignored. Keep secret-bearing files (`JWT_SECRET_KEY`, admin password, agent
  key/token) out of backups that are stored less securely than the host — see
  [SecurityControls.md](SecurityControls.md#10-secrets-handling).

---

## Related references

- [SecurityControls.md](SecurityControls.md) — how these variables enforce the
  security posture.
- [HardwareMatrix.md](HardwareMatrix.md) — where each component runs.
- [SoftwareMatrix.md](SoftwareMatrix.md) — runtimes that read these variables.
- Component examples: [.env.example](../../.env.example),
  [frontend/.env.example](../../frontend/.env.example),
  [print-agent/.env.example](../../print-agent/.env.example).
