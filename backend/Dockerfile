# syntax=docker/dockerfile:1.7
# PBC Visitor Kiosk — backend (FastAPI + uvicorn, SQLite).
# Multi-stage: build the dependency virtualenv once, ship a slim runtime image.

##############################  Stage 1: builder  ##############################
FROM python:3.13-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

# Compilers/headers are only needed if a wheel is unavailable for the target
# platform. Present here (builder only) so the runtime image stays lean.
RUN apt-get update \
 && apt-get install --no-install-recommends -y build-essential libffi-dev \
 && rm -rf /var/lib/apt/lists/*

# Isolated virtualenv keeps pip/build artifacts out of the runtime image.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build

# The tracked requirements.txt is UTF-16 (a OneDrive artifact). Normalize it to
# UTF-8 so pip parses it deterministically on any platform/toolchain.
COPY requirements.txt ./requirements.raw
RUN python -c "open('requirements.txt','w',encoding='utf-8').write(open('requirements.raw',encoding='utf-16').read())" \
 && pip install --upgrade pip \
 && pip install -r requirements.txt

##############################  Stage 2: runtime  ##############################
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app

# fonts-dejavu-core provides the TrueType fonts (DejaVuSans / DejaVuSans-Bold)
# that badge rendering requires; without them badge generation fails.
RUN apt-get update \
 && apt-get install --no-install-recommends -y fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# Non-root runtime account.
RUN groupadd --gid 10001 appuser \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin appuser

# Pre-built virtualenv from the builder stage.
COPY --from=builder /opt/venv /opt/venv

# Application code only (config/, tests/, local DB and uploads are excluded via
# .dockerignore and provided at runtime through volumes).
WORKDIR /app
COPY app ./app

# Ship only the tracked settings template. On first run the app seeds
# config/system_settings.json from it (main.py), and the empty config volume is
# initialized from this image path — so readiness (/health) is healthy without
# manual setup. Live config files are git-ignored and never baked in.
COPY config/system_settings.template.json ./config/system_settings.template.json

# Writable state:
#   /data          -> SQLite DB (runtime WORKDIR; DATABASE_URL is CWD-relative)
#   /app/uploads   -> visitor photos, badges, qr-codes, theme-logos (BASE_DIR)
#   /app/logs      -> rotating application log
#   /app/config    -> system settings / user themes JSON
RUN mkdir -p /data /app/uploads /app/logs /app/config \
 && chown -R appuser:appuser /app /data

USER appuser
WORKDIR /data

EXPOSE 8000

# Cheap, dependency-free liveness probe served by the app.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=3).status==200 else 1)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
