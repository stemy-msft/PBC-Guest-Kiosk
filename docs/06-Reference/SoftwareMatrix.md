# Software Matrix — Reference

**Status:** Authoritative reference (Documentation Wave 2, P0).
**Applies to release:** `v1.0.0-rc.1`.
**Purpose:** Define the operating systems, runtimes, dependencies, and browser
support for each component, and mark each as **Required**, **Recommended**, or
**Optional**. Versions are drawn from the project's dependency manifests and
[KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md); hardware context is in
[HardwareMatrix.md](HardwareMatrix.md).

## Support-level legend

| Level | Meaning |
| --- | --- |
| **Required** | Must be present at (at least) the stated version for the component to run. |
| **Recommended** | The validated / preferred choice; other valid options exist. |
| **Optional** | Only needed for a specific optional capability. |

---

## 1. Operating systems

| Component | OS | Level | Notes |
| --- | --- | --- | --- |
| Backend | Windows 11 | **Recommended** | The validated backend host (known-good build). |
| Backend | Linux (x86-64) | Optional | Portable Python; not the validated host. |
| Frontend | Windows 11 | **Recommended** | Validated host; any OS with Node 20+ can build/serve. |
| Print agent | Raspberry Pi OS Lite (64-bit) / Linux with CUPS | **Required** | The agent uses CUPS (`lp`/`lpstat`); a CUPS-capable Linux host is mandatory. Windows is **not supported** — see [HardwareMatrix.md](HardwareMatrix.md#4-print-agents). |

---

## 2. Runtimes

| Runtime | Component | Level | Version |
| --- | --- | --- | --- |
| Python | Backend | **Required** | **3.12+** required; **3.13** validated (known-good build). |
| Python | Print agent | **Required** | **3.13** validated on Raspberry Pi OS Lite 64-bit. |
| Node.js | Frontend (build/dev) | **Required** | **20+** (Vite 8 requires a current LTS Node). Node is a build/serve dependency, not a runtime the visitor device needs. |
| npm | Frontend (build/dev) | **Required** | Bundled with Node; installs frontend dependencies. |

---

## 3. Backend runtime dependencies

Source of truth: `backend/requirements.txt`. All are **Required** for the backend
to run. Key packages:

| Package | Version | Role |
| --- | --- | --- |
| `fastapi` | 0.139.0 | Web framework / API. |
| `uvicorn[standard]` | 0.51.0 | ASGI server. |
| `starlette` | 1.3.1 | ASGI toolkit (FastAPI dependency, pinned). |
| `sqlalchemy` | 2.0.51 | ORM over SQLite. |
| `pydantic` | 2.13.4 | Request/response validation. |
| `python-jose[cryptography]` | 3.5.0 | JWT encode/decode. |
| `pwdlib[argon2]` | 0.3.0 | Password hashing (Argon2). |
| `argon2-cffi` | 25.1.0 | Argon2 backend for `pwdlib`. |
| `python-multipart` | 0.0.32 | Multipart/form-data (uploads). |
| `Pillow` | 12.3.0 | Image decode/normalize/re-encode; bomb guard. |
| `qrcode[pil]` | 8.2 | Badge QR-code generation. |
| `python-dotenv` | 1.2.2 | Loads `.env`. |
| `cryptography` | 49.0.0 | Crypto primitives (JOSE/argon2 support). |

> **Database:** SQLite via SQLAlchemy — **no separate database server is
> required**. The database file path is fixed in code (see
> [EnvironmentVariables.md](EnvironmentVariables.md)). This is a **Required**,
> zero-install dependency (bundled with Python).

---

## 4. Frontend dependencies

Source of truth: `frontend/package.json` (name "PBC Guest Kiosk",
version `1.0.0-rc.1`). All are **Required** to build; they are compiled into a
static bundle (the visitor's browser needs only the browser itself).

| Package | Version | Role |
| --- | --- | --- |
| `react` / `react-dom` | ^19.2.7 | UI runtime. |
| `vite` | ^8.1.1 | Build tool / dev server (`--host 0.0.0.0`). |
| `@vitejs/plugin-react` | ^6.0.3 | React support for Vite. |
| `vitest` | ^3.2.4 | Unit-test runner (dev only). |
| `jsdom` | ^25.0.1 | DOM for tests (dev only). |
| `eslint` | ^10.6.0 | Linting (dev only). |

---

## 5. Print-agent dependencies

Source of truth: `print-agent/requirements.txt`.

| Item | Version | Level | Role |
| --- | --- | --- | --- |
| `requests` | 2.34.2 | **Required** | HTTP polling of the backend. |
| CUPS (`lp`, `lpstat`) | System | **Required** | The agent shells out to CUPS to print and to query the queue. Must be installed and configured on the host. |
| Brother `ql800pdrv` driver | 2.1.4-0 | **Recommended** | Best photo quality on the QL-800 (validated). |
| `ptouch-ql` driver | System | Optional | Open-source alternative; works with visible halftoning (see [PRINT-SERVER.md](../PRINT-SERVER.md)). |

---

## 6. Browser compatibility (kiosk / admin UI)

A current browser with camera (`getUserMedia`) support is **Required** for
photo check-in. Validated browsers (from
[reviews/m8-completion-report.md](../reviews/m8-completion-report.md)):

| Browser / platform | Level | Notes |
| --- | --- | --- |
| Safari on iPad | **Recommended** | Primary validated check-in browser. |
| Chrome on iPad | **Recommended** | Validated. |
| Chrome / Edge on Android (incl. Pixel) | **Recommended** | Validated on Android phone + Pixel 9 Pro XL. |
| Desktop Chromium browsers (Chrome/Edge) | **Recommended** | Desktop PC validated. |
| Browser on Amazon Fire tablet | Optional | Validated. |
| Other modern evergreen browsers | Optional | Standards-based responsive UI; expected to work, not individually validated. |

Requirements for the check-in flow: a camera and permission to use it, and
(if the UI and API are on different origins) network reachability to
`VITE_API_BASE` — see [EnvironmentVariables.md](EnvironmentVariables.md#2-frontend).

---

## 7. External dependencies

The system is **self-contained on the local network** and requires **no external
SaaS, cloud service, or internet access at runtime**.

| Dependency | Level | Notes |
| --- | --- | --- |
| Internet access | Optional | Needed only to **install** dependencies (`pip`, `npm`, OS packages). Not needed to run. |
| LAN connectivity between components | **Required** | Backend, kiosk browser(s), and print agent communicate over the local network (HTTP). |
| Package registries (PyPI / npm) | Optional | Install-time only. |
| Docker / container runtime | **Not used** | The project ships no container assets; there is no container-based deployment path in v1. |

---

## Related references

- [HardwareMatrix.md](HardwareMatrix.md) — physical platforms these run on.
- [EnvironmentVariables.md](EnvironmentVariables.md) — configuration read by these runtimes.
- [SecurityControls.md](SecurityControls.md) — how the auth/upload dependencies are used.
- [KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md) — the validated version snapshot.
