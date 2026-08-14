# Container Deployment Guide

This guide describes how to deploy the **PBC Visitor Kiosk** as Docker
containers: one container for the **backend** (FastAPI) and one for the
**frontend** (React SPA served by nginx).

> The **print agent** is **not** containerized. It continues to run separately
> (typically on a Raspberry Pi) and only needs network access to the backend.
> See the existing print-agent documentation for its setup.

---

## 1. Architecture overview

```text
                         ┌──────────────────────────────────────────┐
                         │            Docker network                 │
                         │              (kiosk-net)                  │
   Browser / kiosk       │                                          │
        │                │   ┌───────────────┐    ┌──────────────┐  │
        │  HTTP(S)        │   │   frontend    │    │   backend    │  │
        └───────────────────▶│ nginx :8080   │───▶│ uvicorn :8000│  │
        (published port      │  SPA + proxy  │    │  FastAPI     │  │
         or via Caddy)       └───────────────┘    │  SQLite      │  │
                         │        proxies:         └──────┬───────┘  │
                         │        /api /uploads /health   │          │
                         └────────────────────────────────┼──────────┘
                                                          │ volumes
                                          kiosk_db / kiosk_uploads /
                                          kiosk_logs / kiosk_config

  Raspberry Pi print agent ──▶ public frontend/Caddy origin ──▶ backend /api
```

- The **frontend** container serves the compiled SPA and reverse-proxies
  `/api`, `/uploads` and `/health` to the backend. Because the browser talks to
  a single origin, **no cross-origin (CORS) requests occur** in normal use.
- The **backend** container is **not published** to the host. It is reachable
  only from the frontend (and Caddy) over the internal Docker network.
- All mutable state lives in **named volumes**. Rebuilds/upgrades preserve it
  only when the same Compose project volumes are reused and `-v` is not used.

Two deployment options are provided:

| Option | Compose file | Public entry point | TLS |
|--------|--------------|--------------------|-----|
| **A — Direct** | `docker-compose.yml` | `http://<host>:<FRONTEND_PORT>` | none |
| **B — Caddy** | `docker-compose.caddy.yml` | `http(s)://<CADDY_SITE_ADDRESS>` | automatic HTTPS capability; public ACME untested |

Commands below use `docker compose` for Option A. For Option B, use
`docker compose -f docker-compose.caddy.yml` for **every** lifecycle, status,
backup, restore, and log command. Do not switch Compose files or override the
project name mid-deployment: that can select a different set of named volumes.

**Validation boundary:** clean image builds, direct Compose runtime, health
checks, nginx routing/DNS re-resolution, SQLite persistence, print-agent API
proxy reachability, and the Caddy **HTTP** proxy chain were tested in Docker
Desktop. Public ACME certificate issuance, a real printer, a real camera, and
cross-release database restore compatibility were **not** tested. This deployment
is approved for pilot validation, not production approval.

---

## 2. Container layout

| Container | Base image | Process | Runs as | Listens |
|-----------|-----------|---------|---------|---------|
| `backend` | `python:3.13-slim` | `uvicorn app.main:app` | `appuser` (uid 10001) | `8000` (internal) |
| `frontend`| `nginxinc/nginx-unprivileged:1.27-alpine` | nginx | `nginx` (uid 101) | `8080` |
| `caddy` *(Option B)* | `caddy:2-alpine` | Caddy | root (official image default; binds privileged ports) | `80`, `443` |

### Files

```text
backend/
  Dockerfile            # multi-stage build; ships fonts-dejavu-core for badges
  .dockerignore
frontend/
  Dockerfile            # Node build -> unprivileged nginx
  .dockerignore
  nginx.conf            # SPA + reverse proxy to backend
deployment/
  docker-compose.yml            # Option A (direct IP:PORT)
  docker-compose.caddy.yml      # Option B (Caddy reverse proxy + HTTPS)
  Caddyfile
  .env.example                  # copy to .env
docs/
  container-deployment.md       # this guide
```

---

## 3. Port mappings

| Port | Container | Published? | Notes |
|------|-----------|------------|-------|
| `8000` | backend | No (`expose` only) | Internal API; never exposed to the host. |
| `8080` | frontend | Option A: `${FRONTEND_PORT}:8080`. Option B: internal only. | nginx serves SPA + proxy. |
| `80` / `443` | caddy | Option B only | HTTP/HTTPS termination. |

---

## 4. Environment variables

All variables live in `deployment/.env` (copied from `.env.example`). Compose
reads this file for both interpolation and the backend runtime environment.

### Deployment / compose

| Variable | Default | Purpose |
|----------|---------|---------|
| `FRONTEND_PORT` | `8080` | Host port for the frontend (Option A). |
| `IMAGE_TAG` | `latest` | Tag applied to built images. |
| `VITE_API_BASE` | *(empty)* | **Build-time** API base baked into the SPA. Leave empty for same-origin proxying. |
| `CADDY_SITE_ADDRESS` | `:80` | Caddy site address (Option B). Use a domain for automatic HTTPS. |

The frontend nginx always listens on container port `8080`; `FRONTEND_PORT`
changes only the Option A host-side published port. Backend port `8000` is
internal-only in both variants.

### Backend runtime (see `.env.example` for the full annotated list)

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET_KEY` | **Yes** | Session-token signing key (32+ random chars). |
| `PBC_ENV` | **Yes** (`production`) | Enables production checks. |
| `PBC_CORS_ALLOWED_ORIGINS` | **Yes in production** | Comma-separated exact origins that serve the UI. Set to your public origin. |
| `PBC_DEFAULT_ADMIN_USERNAME` / `PBC_DEFAULT_ADMIN_PASSWORD` / `PBC_DEFAULT_ADMIN_DISPLAY_NAME` | No | First-run admin bootstrap. |
| `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` | No | JWT tuning. |
| `PBC_LOGIN_LOCKOUT_THRESHOLD`, `PBC_LOGIN_LOCKOUT_MINUTES` | No | Brute-force lockout. |
| `PBC_MAX_PHOTO_UPLOAD_BYTES`, `PBC_MAX_PHOTO_DIMENSION`, `PBC_MAX_LOGO_UPLOAD_BYTES`, `PBC_MAX_LOGO_DIMENSION`, `PBC_MAX_IMAGE_PIXELS` | No | Upload / image bounds. |
| `PBC_BADGE_THEME` | No | Default badge theme. |

> **Important:** `VITE_API_BASE` is consumed at **build time**. Changing it
> requires rebuilding the frontend image (`--build`).

On the first backend start, the tracked `system_settings.template.json` included
in the image seeds `/app/config/system_settings.json` when no live settings file
exists. The `kiosk_config` volume then preserves live system settings and user
themes across rebuilds and upgrades **only while that same volume is reused**;
an existing live file is never overwritten by image initialization.

---

## 5. Build instructions

Prerequisites: Docker Engine 24+ with Docker Compose v2 and BuildKit (included
with current Docker Desktop), internet access for the first build, and a free
host port (`FRONTEND_PORT`, default `8080`). Legacy `docker-compose` v1 is not
supported.

```bash
cd deployment
cp .env.example .env
# Edit .env — set JWT_SECRET_KEY, admin password, and PBC_CORS_ALLOWED_ORIGINS.

# Build both images without starting:
docker compose build
```

On Windows PowerShell, replace `cp .env.example .env` with
`Copy-Item .env.example .env`. The remaining Docker commands are the same.

Images are tagged `pbc-guest-kiosk-backend:${IMAGE_TAG}` and
`pbc-guest-kiosk-frontend:${IMAGE_TAG}`.

---

## 6. Deployment instructions

### Option A — Direct IP:PORT access

```bash
cd deployment
cp .env.example .env          # edit values first
docker compose up -d --build
```

Access the kiosk at `http://<host-ip>:${FRONTEND_PORT}` (default `:8080`).
Set `PBC_CORS_ALLOWED_ORIGINS=http://<host-ip>:8080` to match.

### Option B — Caddy reverse proxy (HTTPS)

```bash
cd deployment
cp .env.example .env
# Set CADDY_SITE_ADDRESS=kiosk.example.org  (DNS must point at this host)
# Set PBC_CORS_ALLOWED_ORIGINS=https://kiosk.example.org
docker compose -f docker-compose.caddy.yml up -d --build
```

Caddy obtains and renews a Let's Encrypt certificate automatically when
`CADDY_SITE_ADDRESS` is a public domain and ports 80/443 are reachable. For
plain HTTP / IP access, set `CADDY_SITE_ADDRESS=:80`.

Only the Caddy HTTP proxy chain was validated locally. Public DNS, ACME account/
certificate issuance, renewal, and HTTPS camera behavior remain production-site
acceptance tests.

### Verify

```bash
docker compose ps                         # both services should be "healthy"
curl -f http://<host>:8080/healthz        # frontend -> "ok"
curl -f http://<host>:8080/health/live    # proxied backend -> {"status":"alive"}
curl -f http://<host>:8080/health         # deep readiness -> status "healthy"
```

`/health/live` proves only that the backend process responds. `/health` checks
the database, writable directories, live configuration, backup subsystem, and
print infrastructure; it returns HTTP `503` with details when a critical check
fails. With Caddy, use the public Caddy origin instead of `:8080`.

---

## 7. Upgrade instructions

**Before every upgrade, create and copy a verified snapshot off the Docker
volumes using §11.** Do not rely on image tags alone: application rollback does
not roll back SQLite data, uploads, or live configuration.

> **CAUTION — volume deletion:** never use `docker compose down -v` or
> `docker volume rm` during a normal upgrade. Both can permanently remove the
> active data needed for upgrade or rollback.

```bash
cd deployment
docker compose ps                          # start only from a healthy stack
# Complete the verified pre-upgrade backup in §11 before continuing.
git pull                                  # get the new code
docker compose build --pull               # rebuild images
docker compose up -d                      # recreate containers
docker compose ps                          # confirm both services are healthy
curl -f http://<host>:8080/health         # confirm deep readiness
```

Named volumes are preserved across upgrades, so the database, uploads, logs and
config survive when the same Compose project and volumes are reused. If
`VITE_API_BASE` changed, ensure the frontend was rebuilt (`--build` / `build`).

> **CAUTION — rollback images:** `docker image prune -f` removes unused image
> layers and may remove the local image needed for rollback. Run it only after
> the upgrade is accepted and a known-good image is available elsewhere.

---

## 8. Rollback instructions

Images are tagged, so roll back by redeploying a previous tag:

```bash
cd deployment
# Set IMAGE_TAG=known-good in deployment/.env to reuse a saved image, then:
docker compose up -d

# Or check out the previous code revision and rebuild:
git checkout <previous-commit>
docker compose up -d --build
```

Because data is in volumes, application rollback does **not** roll back data.
For a data rollback, restore from a backup snapshot (see §11) **before**
starting the older image, and verify the schema is compatible.

Tip: before building, set `IMAGE_TAG` in `deployment/.env` to a dated value such
as `20260814`. This keeps a tagged image you can return to. Restore the intended
`IMAGE_TAG` value in `.env` after rollback or testing.

---

## 9. Troubleshooting

| Symptom | Likely cause | Resolution |
|---------|--------------|------------|
| `backend` exits immediately | `PBC_ENV=production` with empty `PBC_CORS_ALLOWED_ORIGINS`, or missing `JWT_SECRET_KEY` | Set both in `.env`; `docker compose logs backend`. |
| Frontend loads but API calls 502 | Backend not healthy yet / crashed | `docker compose ps`; `docker compose logs backend`. Frontend `depends_on` backend health, so this usually self-resolves. |
| Photos/badges 404 | `/uploads` not proxied or volume empty | Confirm `nginx.conf` `/uploads/` block; check `kiosk_uploads` volume. |
| Login always fails after redeploy | `JWT_SECRET_KEY` changed | Expected — tokens are invalidated; log in again. |
| Badge generation errors about fonts | Font package missing (custom image) | The backend image installs `fonts-dejavu-core`; rebuild the backend image. |
| Caddy TLS not issued | DNS/ports not reachable | Ensure `CADDY_SITE_ADDRESS` domain resolves to this host and 80/443 are open; `docker compose logs caddy`. |
| Print agent can't reach API | Backend not published | The backend is internal-only. Point the agent at the **frontend** origin (which proxies `/api`) or publish 8000 deliberately on a trusted network. |

Useful commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose exec backend python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8000/health').read())"
```

---

## 10. Security recommendations

- **Secrets:** never commit `.env`. Use a strong, unique `JWT_SECRET_KEY` and a
  strong admin password; change the bootstrap admin password at first login.
- **Least exposure:** the backend is `expose`-only (no host port). Keep it that
  way; the print agent should reach the API via the frontend origin.
- **Non-root:** both app containers run as non-root users; keep it so.
- **TLS:** prefer Option B (Caddy) for anything beyond a trusted LAN.
- **CORS:** set `PBC_CORS_ALLOWED_ORIGINS` to the exact public origin only — no
  wildcards.
- **Updates:** rebuild periodically with `--pull` to pick up base-image
  security patches.
- **Firewall:** restrict access to the kiosk host to the networks that need it.

---

## 11. Backup and restore

### Persistent data

All persistent state is in named volumes:

| Volume | Mount | Contents |
|--------|-------|----------|
| `kiosk_db` | `/data` | `visitor_kiosk.db` (SQLite database) |
| `kiosk_uploads` | `/app/uploads` | Visitor photos, generated badges, QR codes, theme logos |
| `kiosk_logs` | `/app/logs` | Rotating application log |
| `kiosk_config` | `/app/config` | System settings / user themes JSON |

The Caddy `caddy_data` volume stores certificates and account state; back it up
when using Option B. The `caddy_config` volume is runtime state and is also
preserved by Compose. Do not delete either Caddy volume unintentionally. The
repository-root/deployment `.env` files contain secrets and are deliberately
excluded from application snapshots; store an encrypted copy separately.

### Create a verified application snapshot (SAFE while running)

Use the built-in backup tool with the **container paths explicitly supplied**.
Its native defaults point under `/app` and do not locate the container database
at `/data/visitor_kiosk.db`. The command below uses SQLite's online-backup API,
captures uploads plus live configuration, verifies the snapshot, and stores it
temporarily under `/data/backups` on the database volume:

```bash
docker compose exec -T backend python -m app.backup backup \
  --db /data/visitor_kiosk.db \
  --uploads /app/uploads \
  --config-dir /app/config \
  --dest /data/backups \
  --label pre-upgrade

docker compose exec -T backend python -m app.backup list --dest /data/backups
```

Copy the reported snapshot directory off the Docker volume immediately (replace
`<snapshot>` with the directory name printed by the backup command):

```bash
# Unix/Linux/macOS
mkdir -p backups
docker compose cp backend:/data/backups/<snapshot> ./backups/<snapshot>
```

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force -Path backups | Out-Null
docker compose cp backend:/data/backups/<snapshot> ./backups/<snapshot>
```

Copy the resulting `backups/` directory to separate storage. A snapshot left
only in `kiosk_db` is **not** an off-host backup and will be lost if that volume
is deleted.

### Restore a verified snapshot (DESTRUCTIVE)

> **CAUTION — data replacement:** restore reproduces the snapshot exactly. Live
> database content, managed upload categories, and live configuration absent
> from the snapshot are replaced or removed. Stop the backend and print agents,
> keep the automatic pre-restore safety snapshot enabled, and never use
> `--no-safety` during normal operations. Use only a verified snapshot already
> copied off the Docker volumes.

Copy the snapshot into the existing backend container, stop writes, restore
through a one-off backend container using explicit paths, then verify readiness:

```bash
docker compose cp ./backups/<snapshot> backend:/data/backups/<snapshot>
docker compose stop backend

docker compose run --rm --no-deps backend python -m app.backup restore \
  --from /data/backups/<snapshot> \
  --db /data/visitor_kiosk.db \
  --uploads /app/uploads \
  --config-dir /app/config

docker compose start backend
docker compose ps
curl -f http://<host>:8080/health
```

The restore command verifies the source first and creates a `pre-restore`
safety snapshot under `/data/backups` before changing live data. Copy that
safety snapshot off-volume before any subsequent cleanup. Restore an older
release's data only after engineering confirms schema compatibility.

### Shutdown versus permanent deletion

- **SAFE:** `docker compose stop` and `docker compose down` stop/remove
  containers and networks but preserve named volumes.
- **DESTRUCTIVE:** `docker compose down -v` deletes the database, uploads, logs,
  live configuration, and (for the Caddy variant) certificate volumes.
- **DESTRUCTIVE:** `docker volume rm pbc-guest-kiosk_<volume>` permanently
  deletes that volume. Never use either destructive command as routine shutdown.

> Volume names are prefixed with the compose project name (`pbc-guest-kiosk`).
> Confirm exact names with `docker volume ls`. Changing the project name (for
> example with `-p` or `COMPOSE_PROJECT_NAME`) creates/selects a different set
> of named volumes and can make existing data appear missing.

---

## 12. Remaining manual steps

- Copy `.env.example` to `.env` and set real values (secrets, origins, domain).
- Point DNS at the host and open ports 80/443 (Option B) or the chosen
  `FRONTEND_PORT` (Option A).
- Configure the separate print agent's `PBC_API_BASE` to reach the backend
  using the origin only, with no `/api` suffix: the frontend origin for Option A
  (e.g. `http://<host>:8080`) or the HTTPS Caddy origin for Option B. Never use
  container-internal `backend:8000` from the print-agent host.
- Change the bootstrap administrator password at first login.
- Complete physical printer and camera acceptance testing; neither was part of
  the Docker runtime validation.
