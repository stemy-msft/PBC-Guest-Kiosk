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

   Raspberry Pi print agent ──▶ backend /api (separate host, not in Docker)
```

- The **frontend** container serves the compiled SPA and reverse-proxies
  `/api`, `/uploads` and `/health` to the backend. Because the browser talks to
  a single origin, **no cross-origin (CORS) requests occur** in normal use.
- The **backend** container is **not published** to the host. It is reachable
  only from the frontend (and Caddy) over the internal Docker network.
- All mutable state lives in **named volumes**, so containers can be rebuilt or
  upgraded without data loss.

Two deployment options are provided:

| Option | Compose file | Public entry point | TLS |
|--------|--------------|--------------------|-----|
| **A — Direct** | `docker-compose.yml` | `http://<host>:<FRONTEND_PORT>` | none |
| **B — Caddy** | `docker-compose.caddy.yml` | `http(s)://<CADDY_SITE_ADDRESS>` | automatic (Let's Encrypt) |

---

## 2. Container layout

| Container | Base image | Process | Runs as | Listens |
|-----------|-----------|---------|---------|---------|
| `backend` | `python:3.13-slim` | `uvicorn app.main:app` | `appuser` (uid 10001) | `8000` (internal) |
| `frontend`| `nginxinc/nginx-unprivileged:1.27-alpine` | nginx | `nginx` (uid 101) | `8080` |
| `caddy` *(Option B)* | `caddy:2-alpine` | Caddy | non-root | `80`, `443` |

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

---

## 5. Build instructions

Prerequisites: Docker Engine 24+ and the Docker Compose plugin.

```bash
cd deployment
cp .env.example .env
# Edit .env — set JWT_SECRET_KEY, admin password, and PBC_CORS_ALLOWED_ORIGINS.

# Build both images without starting:
docker compose build
```

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

### Verify

```bash
docker compose ps                         # both services should be "healthy"
curl -f http://<host>:8080/healthz        # frontend -> "ok"
curl -f http://<host>:8080/health/live    # proxied backend -> {"status":"alive"}
```

---

## 7. Upgrade instructions

```bash
cd deployment
git pull                                  # get the new code
docker compose build --pull               # rebuild images
docker compose up -d                      # recreate containers

# Optional: remove the now-unused old image layers
docker image prune -f
```

Named volumes are preserved across upgrades, so the database, uploads, logs and
config survive. If `VITE_API_BASE` changed, ensure the frontend was rebuilt
(`--build` / `build`).

---

## 8. Rollback instructions

Images are tagged, so roll back by redeploying a previous tag:

```bash
cd deployment
# Rebuild a known-good commit under a distinct tag, or reuse a saved image:
IMAGE_TAG=known-good docker compose up -d

# Or check out the previous code revision and rebuild:
git checkout <previous-commit>
docker compose up -d --build
```

Because data is in volumes, application rollback does **not** roll back data.
For a data rollback, restore from a backup snapshot (see §11) **before**
starting the older image, and verify the schema is compatible.

Tip: capture a restore point before upgrading —
`IMAGE_TAG=$(date +%Y%m%d) docker compose build` keeps a dated image you can
return to.

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

## 11. Backup considerations

All persistent state is in named volumes:

| Volume | Mount | Contents |
|--------|-------|----------|
| `kiosk_db` | `/data` | `visitor_kiosk.db` (SQLite database) |
| `kiosk_uploads` | `/app/uploads` | Visitor photos, generated badges, QR codes, theme logos |
| `kiosk_logs` | `/app/logs` | Rotating application log |
| `kiosk_config` | `/app/config` | System settings / user themes JSON |

Back up the database and uploads together to keep them consistent. Example
snapshot to a tarball on the host:

```bash
# Database
docker run --rm -v pbc-guest-kiosk_kiosk_db:/data -v "$PWD":/backup alpine \
  tar czf /backup/kiosk_db-$(date +%F).tar.gz -C /data .

# Uploads
docker run --rm -v pbc-guest-kiosk_kiosk_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/kiosk_uploads-$(date +%F).tar.gz -C /data .
```

Restore by extracting the tarballs back into the same volumes **while the stack
is stopped** (`docker compose down`), then starting it again. The application
also ships its own backup/restore tooling (`backend/app/backup.py`,
`scripts/`), which can be run inside the backend container against `/data`,
`/app/uploads` and `/app/config`.

> Volume names are prefixed with the compose project name (`pbc-guest-kiosk`).
> Confirm exact names with `docker volume ls`.

---

## 12. Remaining manual steps

- Copy `.env.example` to `.env` and set real values (secrets, origins, domain).
- Point DNS at the host and open ports 80/443 (Option B) or the chosen
  `FRONTEND_PORT` (Option A).
- Configure the separate print agent's `PBC_API_BASE` to reach the backend
  (via the frontend origin, e.g. `http://<host>:8080`).
- Change the bootstrap administrator password at first login.
