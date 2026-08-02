# Quick-Start Deployment

**Status:** Authoritative (Documentation Wave 4). **Release:** `v1.0.0-rc.2`.
**Audience:** A technically competent volunteer standing the system up for the
first time on a single clean host.

This is the **shortest verified path** to a running kiosk. It favours the
commands that the project actually ships and that were used in the
[validated reference build](../KNOWN_GOOD_BUILD.md). It is **not** a
production-hardening guide — see [ProductionReadiness.md](ProductionReadiness.md).

Every command below is grounded in the current code. Where a longer explanation
exists, this page links to it rather than repeating it.

---

## 1. Purpose and scope

By the end of this page you will have, on one host:

- the **backend** API running on port `8000`,
- the **frontend** kiosk UI running on port `5173`,
- a **default administrator** account created automatically,
- (optionally) a **Raspberry Pi print agent** printing test badges.

Out of scope here: unattended/production hosting, auto-start on reboot, TLS,
and reverse proxying. Those gaps are catalogued in
[ProductionReadiness.md](ProductionReadiness.md).

---

## 2. Supported deployment model

| Component | How it runs in this guide | Notes |
| --- | --- | --- |
| Backend | Foreground `uvicorn` process | Started from the `backend/` directory. |
| Frontend | Foreground Vite dev server (`npm run dev`) | This is the validated runtime for the kiosk UI. |
| Database | SQLite file, created automatically | No separate database server. |
| Print agent | Optional, Raspberry Pi + CUPS only | Not required to check visitors in. |

There is **no** supported way in this repository to run these as background
services; both processes run in the foreground and stop when their terminal
closes. See [LinuxDeployment.md § Startup after reboot](LinuxDeployment.md#14-startup-after-a-reboot).

---

## 3. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Python | **3.12+** (3.13 validated) | Backend + (optionally) the print agent. See [SoftwareMatrix.md § 2](../06-Reference/SoftwareMatrix.md#2-runtimes). |
| Node.js + npm | **20+** | Frontend build/serve. |
| Git | any recent | To clone the repository. |
| A modern browser with a camera | — | Photo check-in needs `getUserMedia`. See [SoftwareMatrix.md § 6](../06-Reference/SoftwareMatrix.md#6-browser-compatibility-kiosk--admin-ui). |

The reference build used Windows 11 for the backend/frontend host; any OS with
the runtimes above can run this guide. Printing additionally requires a
Raspberry Pi (or Linux host) with CUPS — see
[RaspberryPiPrintAgent.md](RaspberryPiPrintAgent.md).

---

## 4. Get the code

```bash
git clone <your-repository-url> PBC-guest-kiosk
cd PBC-guest-kiosk
```

All paths below are relative to this cloned `PBC-guest-kiosk/` root.

---

## 5. Backend setup

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

- **Windows (PowerShell):** `.venv\Scripts\Activate.ps1`
- **Linux / macOS:** `source .venv/bin/activate`

Install dependencies:

```bash
pip install -r requirements.txt
```

> Full backend detail (SQLite behaviour, runtime directories, health endpoints)
> is in [BackendDeployment.md](BackendDeployment.md).

---

## 6. Frontend setup

From the repository root, in a **separate** terminal:

```bash
cd frontend
npm install
```

> Full frontend detail (build output, serving options, camera requirements) is
> in [FrontendDeployment.md](FrontendDeployment.md).

---

## 7. Initial configuration

Two `.env` files must exist. Copy the shipped examples and edit the required
values.

**Backend configuration — repository root `.env`:**

```bash
# from the repository root
cp .env.example .env
```

Then edit `.env` and set, at minimum:

- `JWT_SECRET_KEY` — **required**; the backend refuses to start if it is unset.
  Use a long random value.
- `PBC_DEFAULT_ADMIN_PASSWORD` — the first administrator password.

**Frontend configuration — `frontend/.env`:**

```bash
# from the repository root
cp frontend/.env.example frontend/.env
```

Then edit `frontend/.env` and set `VITE_API_BASE` to the backend URL the
**browser** will reach, e.g. `http://<this-host-ip>:8000`.

> Every variable, its default, and where it is read is documented in
> [EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md). The backend
> reads the root `.env`; the frontend reads `frontend/.env`.

---

## 8. Start the application

**Start the backend** (from the `backend/` directory, with the venv active):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On first start the backend automatically creates the SQLite database, all
runtime directories, and the default administrator account. You should see a
line similar to:

```
Created default administrator account: admin
```

> **Start location matters:** the SQLite database file is created in the
> current working directory, so always start the backend from `backend/`. See
> [BackendDeployment.md § 6](BackendDeployment.md#6-database-initialisation).

**Start the frontend** (from the `frontend/` directory, in its own terminal):

```bash
npm run dev
```

The kiosk UI is now served on port `5173` (bound to `0.0.0.0`). Open
`http://<this-host-ip>:5173` in a browser.

---

## 9. Initial administrator sign-in

1. Open the frontend and go to the staff/admin sign-in.
2. Sign in with the username from `PBC_DEFAULT_ADMIN_USERNAME` (default `admin`)
   and the password you set in `PBC_DEFAULT_ADMIN_PASSWORD`.
3. The account is flagged **must change password** — you will be required to set
   a new password immediately.

More detail: [Administration.md § 2](../03-Operations/Administration.md#2-user-management)
and [EnvironmentVariables.md § 1.2](../06-Reference/EnvironmentVariables.md#12-initial-administrator-bootstrap).

---

## 10. Basic health validation

With the backend running, confirm it is healthy:

| Check | Command | Expected |
| --- | --- | --- |
| Liveness | `curl http://localhost:8000/health/live` | `{"status":"alive"}` |
| Readiness | `curl http://localhost:8000/health` | JSON with `"version": "1.0.0-rc.2"` and each subsystem `ok`; HTTP `200`. |
| Root | `curl http://localhost:8000/` | `{"application":"PBC Visitor Kiosk","version":"1.0"}` |

If `/health` returns HTTP `503`, a critical subsystem (database, directories,
configuration, or backup destination) failed — read the JSON body, then see
[Troubleshooting.md § 2](../03-Operations/Troubleshooting.md#2-system-health-checks).

> On Windows PowerShell, `curl` is an alias for `Invoke-WebRequest`; use
> `curl.exe http://localhost:8000/health/live` or open the URL in a browser.

---

## 11. Optional: print-agent setup

Printing is **not** required to check visitors in. If you want physical badges,
set up the Raspberry Pi print agent — it is Linux/CUPS only and cannot run on
Windows:

➡️ [RaspberryPiPrintAgent.md](RaspberryPiPrintAgent.md)

> **Known dependency defect:** the print agent imports `python-dotenv`, but
> `print-agent/requirements.txt` does not declare it, so on a clean host the
> agent fails to start until it is installed manually. This is an open RC defect;
> follow the stop-gap in
> [RaspberryPiPrintAgent.md § 6](RaspberryPiPrintAgent.md#6-repository-and-agent-installation).

Until an agent is enrolled, approved, and assigned to a print station, badges
are still generated and viewable on-screen; they simply are not physically
printed.

---

## 12. First test check-in

1. On the frontend, start a visitor check-in.
2. Grant the browser camera permission when prompted and capture a photo.
3. Complete the check-in.

The backend stores the visitor, photo, generated badge, and QR code under
`backend/uploads/`. See [VisitorLifecycle.md](../01-Architecture/VisitorLifecycle.md)
for the full flow.

---

## 13. First test print (optional)

If a print agent is enrolled, approved, and assigned to the station used for
check-in, the badge is queued and the agent prints it via CUPS (`lp`). Verify
end-to-end using [PrintOperations.md § 12](../03-Operations/PrintOperations.md#12-validation-checklist).

---

## 14. Next documents

- Going beyond a quick evaluation on Linux → [LinuxDeployment.md](LinuxDeployment.md)
- Backend-only detail → [BackendDeployment.md](BackendDeployment.md)
- Frontend build/serve detail → [FrontendDeployment.md](FrontendDeployment.md)
- Printing → [RaspberryPiPrintAgent.md](RaspberryPiPrintAgent.md)
- **Before any production use** → [ProductionReadiness.md](ProductionReadiness.md)
- Day-to-day running → [../03-Operations/Administration.md](../03-Operations/Administration.md)
