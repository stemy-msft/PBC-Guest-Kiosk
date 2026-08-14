# syntax=docker/dockerfile:1.7
# PBC Visitor Kiosk — frontend (React 19 + Vite 8).
# Multi-stage: build the static bundle with Node, serve it with unprivileged nginx.

##############################  Stage 1: build  ##############################
FROM node:22-alpine AS build

WORKDIR /app

# API base is baked in at BUILD time. Empty ("") = same-origin: the browser
# calls /api, /uploads and /health on its own origin and nginx proxies those to
# the backend. Only override to call the API on a different origin.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

# Install dependencies from the lockfile first for reproducible, cached builds.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

##############################  Stage 2: serve  ##############################
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# The unprivileged image already runs as a non-root user (uid 101) and listens
# on 8080, so no extra hardening is required to avoid running nginx as root.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

# The base image provides the correct nginx entrypoint/CMD.
