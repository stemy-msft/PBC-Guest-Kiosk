# 02 — Deployment

**Status:** Authoritative deployment documentation (Documentation Wave 4).
**Applies to release:** `v1.0.0-rc.2`.

This folder is the canonical, source-verified guide to installing and running the
PBC Guest Kiosk. Every command, path, environment variable, and port in these
documents is verified against the current application code — not against older
planning notes. Where the code and older documentation disagree, **the code
wins**.

> **Read this first:** As shipped, the kiosk runs as a **foreground backend
> process plus a foreground frontend dev server**, with **no** service/`systemd`
> unit for that native path. An **optional container deployment** (backend +
> frontend images, Docker Compose, and an optional Caddy reverse proxy with TLS)
> is now available and validated for pilot use — see
> [../container-deployment.md](../container-deployment.md). This documentation does
> **not** certify the native path for any particular operational use. See
> [ProductionReadiness.md](ProductionReadiness.md) for the full gap list and the
> documentation-versus-operational readiness distinction before deploying.

## Documents in this folder

| Document | Use it when you want to… |
| --- | --- |
| [QuickStart.md](QuickStart.md) | Stand up the whole system on one host by the shortest verified path (first run). |
| [LinuxDeployment.md](LinuxDeployment.md) | Deploy backend + frontend on a Linux host, with the writable paths, startup, and reboot realities spelled out. |
| [BackendDeployment.md](BackendDeployment.md) | Install and run only the FastAPI backend (API + SQLite + uploads + logs + backups). |
| [FrontendDeployment.md](FrontendDeployment.md) | Install, configure, build, and serve the React/Vite frontend. |
| [RaspberryPiPrintAgent.md](RaspberryPiPrintAgent.md) | Set up the Raspberry Pi + CUPS print agent that drives the Brother QL-800. |
| [ProductionReadiness.md](ProductionReadiness.md) | Understand exactly what is production-ready, what is technically possible but unsupported, and what is not implemented. |
| [../container-deployment.md](../container-deployment.md) | Deploy the backend and frontend as Docker containers (Compose, optional Caddy + HTTPS) — the containerized path. |

## Related references (do not duplicate — link)

- Environment variables: [../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md)
- Software / runtime versions: [../06-Reference/SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md)
- Hardware support classes: [../06-Reference/HardwareMatrix.md](../06-Reference/HardwareMatrix.md)
- Security controls: [../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md)
- Day-to-day operations: [../03-Operations/Administration.md](../03-Operations/Administration.md)
- Backup & recovery: [../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)
- Validated reference build (IPs, driver, media): [../KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md)
