# Raspberry Pi Print Agent Deployment

**Status:** Authoritative (Documentation Wave 4). **Release:** `v1.0.0-rc.1`.
**Scope:** Installing the print agent that drives the Brother QL-800 label
printer. Printing is **optional**; visitors can be checked in without it.

Every command and path here is verified against `print-agent/print_agent.py`,
`print-agent/requirements.txt`, and the
[validated reference build](../KNOWN_GOOD_BUILD.md). Printer *operations* (day-to-day
queue handling, failover) live in
[PrintOperations.md](../03-Operations/PrintOperations.md); the *why* of the
design is in [PrintArchitecture.md](../01-Architecture/PrintArchitecture.md).

---

## 1. Purpose and scope

The print agent is a small Python program that runs next to the printer. It
polls the backend for pending badge jobs, downloads the badge image, and prints
it via CUPS. It does **not** expose any network service or port — it is an
outbound-polling client.

Three distinct concepts are used throughout and must not be conflated:

| Concept | What it is | Identified by |
| --- | --- | --- |
| **Printer** | The physical Brother QL-800 (a CUPS print queue). | CUPS queue name, e.g. `QL800_BROTHER`. |
| **Print agent** | This Python process on the Pi. | Its agent key / hostname / token. |
| **Print station** | A logical check-in station badges route to. | A station **slug**. |

An agent is **assigned to a station**; the station's badges are printed on the
agent's **printer**. See [SystemGlossary.md](../00-Executive/SystemGlossary.md).

---

## 2. Supported platform

**Linux with CUPS only.** The agent shells out to the CUPS commands `lp` and
`lpstat`; it cannot run on Windows. The validated platform is **Raspberry Pi OS
Lite (64-bit)**.

> There is **no Windows print agent** and none is planned in this release. See
> [HardwareMatrix.md § 4](../06-Reference/HardwareMatrix.md#4-print-agents).

---

## 3. Hardware and software prerequisites

| Requirement | Reference-build value | Notes |
| --- | --- | --- |
| Single-board computer | Raspberry Pi 3B | Any Pi/Linux host with USB + CUPS should work. |
| OS | Raspberry Pi OS Lite (64-bit) | Headless is fine. |
| Python | 3.13 validated (3.12+ expected) | With `pip` and `venv`. |
| Printer | Brother QL-800 (USB) | See [HardwareMatrix.md](../06-Reference/HardwareMatrix.md). |
| Labels | Brother DK-2205 continuous | 62 mm continuous roll in the reference build. |
| Printer driver | `ql800pdrv` 2.1.4-0 | Best photo quality; `ptouch-ql` is an open-source alternative. |
| CUPS | System package | Provides `lp` / `lpstat`. |
| Network | LAN reachability to the backend | Agent polls the backend API. |

---

## 4. Raspberry Pi preparation

1. Flash Raspberry Pi OS Lite (64-bit) and complete first boot.
2. Ensure Python 3, `pip`, and `venv` are available.
3. Confirm the Pi can reach the backend host, e.g.
   `curl http://<backend-host-ip>:8000/health/live` → `{"status":"alive"}`.

Detailed printer/OS setup notes are in [PRINT-SERVER.md](../PRINT-SERVER.md).

---

## 5. CUPS and printer preparation

1. Install CUPS and the Brother driver, connect the QL-800 by USB, and add it as
   a CUPS queue. The reference queue name is **`QL800_BROTHER`**.
2. Load DK-2205 labels.
3. Confirm the queue exists and is idle:

   ```bash
   lpstat -p
   ```

4. Print a CUPS test to confirm hardware before involving the agent.

The reference build uses queue options `PageSize=62x100`,
`BrPriority=BrQuality`, `BrBrightness=15` — see
[KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md) and [PRINT-SERVER.md](../PRINT-SERVER.md)
for the exact `lpadmin`/`lpoptions` steps. Do not re-derive these here.

---

## 6. Repository and agent installation

On the Pi, from the repository checkout:

```bash
cd print-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> **Known dependency gap (verify before relying on it):**
> `print_agent.py` imports `python-dotenv` (`from dotenv import load_dotenv`),
> but `print-agent/requirements.txt` currently lists only `requests`. On a clean
> host the agent will fail with `ModuleNotFoundError: No module named 'dotenv'`
> until `python-dotenv` is present. As a stop-gap, install it explicitly:
>
> ```bash
> pip install python-dotenv
> ```
>
> This is a manifest defect to be corrected in code (see § 16). The stop-gap
> above is derived directly from the agent's own imports, not invented.

---

## 7. Agent configuration

Create the agent's `.env` from the shipped example (the agent reads
`print-agent/.env`, co-located with the script):

```bash
cp .env.example .env
```

Edit `print-agent/.env`:

| Variable | Default | Set to |
| --- | --- | --- |
| `PBC_API_BASE` | `http://192.168.0.210:8000` | Your backend URL. |
| `PBC_PRINTER_NAME` | `QL800_BROTHER` | Your CUPS queue name. |
| `PBC_PRINT_AGENT_POLL_SECONDS` | `2` | Poll interval. |
| `PBC_PRINT_TIMEOUT_SECONDS` | `60` | Max wait for a CUPS job to finish. |
| `PBC_PRINT_DOWNLOAD_DIR` | `./downloaded-badges` | Where badge PNGs are saved (relative to the run directory). |
| `PBC_PRINT_AGENT_TOKEN` | *(blank)* | Auto-managed after enrollment — leave blank initially. |
| `PBC_PRINT_AGENT_KEY` | *(blank)* | Auto-managed — leave blank initially. |
| `PBC_PRINT_STATION_SLUG` | *(blank)* | Auto-managed — set by station assignment. |

The agent **writes** the key, token, and station slug back into this `.env`
after enrollment/assignment, so the file must be writable. Full variable
reference: [EnvironmentVariables.md § 3](../06-Reference/EnvironmentVariables.md#3-print-agent).

Because `PBC_PRINT_DOWNLOAD_DIR` defaults to a **relative** path, always start
the agent from the `print-agent/` directory (§ 11).

---

## 8. Enrollment

On startup (and on every poll) the agent calls
`POST /api/print-agents/register`, sending its agent key, hostname, printer
name, agent version (`1.0.0`), and station slug. On first registration the
backend records the agent and issues a credential, which the agent stores back
into its `.env` (`Print agent credential stored.`).

A newly enrolled agent is **disabled** until an administrator approves it — this
is intentional: an unknown device cannot print until a human authorises it.

---

## 9. Administrator approval

An administrator approves (enables) the pending agent from the admin interface.
Until approved, the agent registers and reports liveness but is not authorised
to claim jobs. See
[Administration.md § 10](../03-Operations/Administration.md#10-print-agent-monitoring).

---

## 10. Station assignment

An administrator assigns the agent's **print station** (a slug). This is what
routes a station's badges to this agent's printer.

- Until a station slug is assigned, the agent logs
  `Print agent is not assigned to a print station yet.` and requests **no** jobs.
- The startup banner shows `Print Station: <slug>` or `Print Station:
  (unassigned)`.

Station management: [Administration.md § 9](../03-Operations/Administration.md#9-print-station-management).

---

## 11. Starting the agent

From `print-agent/`, with the virtual environment active:

```bash
python print_agent.py
```

- The agent creates its download directory, prints the station banner, then
  polls every `PBC_PRINT_AGENT_POLL_SECONDS` seconds.
- The process runs in the **foreground**; there is **no** shipped `systemd`
  unit or service wrapper (§ 14).

---

## 12. Verifying agent health

- **On the Pi:** the console logs each poll, claim, download, and print.
- **On the backend:** each registration updates the agent's `last_seen`, from
  which the dashboard derives online/offline and station status. Confirm the
  agent shows **online** and the station shows healthy in
  [Administration.md § 10](../03-Operations/Administration.md#10-print-agent-monitoring).

There is no agent HTTP endpoint to probe — liveness is reported to the backend,
not exposed by the agent.

---

## 13. Test print

1. Ensure the agent is enrolled, **approved**, and **assigned** to the station
   you will check in at.
2. Perform a check-in at that station so a badge job is created.
3. Watch the agent log: `Claiming…` → `Downloading…` → `Printing… to
   <printer>` → `Marking … completed`.
4. Confirm the physical badge prints.

Full end-to-end validation: [PrintOperations.md § 12](../03-Operations/PrintOperations.md#12-validation-checklist).

---

## 14. Startup after a reboot

There is **no** shipped auto-start mechanism. After a reboot the agent must be
started again manually (§ 11). Configuring the agent to start automatically
(e.g. a `systemd` unit) is **not provided** in this repository and is an
unsupported, bring-your-own step — see
[ProductionReadiness.md § 10](ProductionReadiness.md#10-print-agent-readiness).

---

## 15. Replacement and recovery

Because the agent's identity and station assignment are stored in
`print-agent/.env`, replacing a Pi or re-homing a printer is a controlled
procedure (preserve or re-issue the agent key, reassign the station). Do not
improvise it — follow:

- [PrintOperations.md § 9 — Printer replacement](../03-Operations/PrintOperations.md#9-printer-replacement-procedure)
- [PrintOperations.md § 10 — Print agent replacement](../03-Operations/PrintOperations.md#10-print-agent-replacement-procedure)

---

## 16. Known limitations

- **Incomplete dependency manifest:** `print-agent/requirements.txt` omits
  `python-dotenv`, which the agent imports (§ 6). Until corrected in code, it
  must be installed manually.
- **Linux/CUPS only:** no Windows support; the agent depends on `lp`/`lpstat`.
- **No auto-start:** foreground process only; a reboot requires a manual restart
  (§ 14).
- **Relative paths:** the badge download directory is relative to the run
  directory, so the agent must be started from `print-agent/`.

---

## 17. Operational handoff

Once the agent prints reliably, hand day-to-day running to the operations docs:

- Monitoring agents/stations: [Administration.md § 10](../03-Operations/Administration.md#10-print-agent-monitoring)
- Print troubleshooting: [Troubleshooting.md § 8](../03-Operations/Troubleshooting.md#8-print-agent-problems)
- Queue behaviour and failover: [PrintOperations.md](../03-Operations/PrintOperations.md)
