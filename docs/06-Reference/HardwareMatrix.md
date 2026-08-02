# Hardware Matrix — Reference

**Status:** Authoritative reference (Documentation Wave 2, P0).
**Applies to release:** `v1.0.0-rc.1`.
**Purpose:** Set clear support expectations for every hardware platform. Each row
is classified and backed by repository evidence — no assumptions.

## Classification legend

| Class | Meaning |
| --- | --- |
| **TESTED GOOD** | Validated in this project on real hardware, with documented evidence. |
| **EXPECTED GOOD** | Should work based on the architecture, but **not** explicitly validated. |
| **UNTESTED** | No evidence either way; use at your own risk and validate first. |
| **NOT SUPPORTED** | Known not to work today; would require net-new engineering. |

**Primary evidence sources:** [KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md)
(validated July 2026), the Milestone 8 real-device validation
([reviews/m8-completion-report.md](../reviews/m8-completion-report.md), 2026-07-31),
and [PRINT-SERVER.md](../PRINT-SERVER.md). Software/runtime versions are in
[SoftwareMatrix.md](SoftwareMatrix.md).

---

## 1. Servers / hosts (backend + frontend)

| Hardware | Role | Class | Evidence / notes |
| --- | --- | --- | --- |
| Windows 11 workstation | Backend + Frontend host | **TESTED GOOD** | Known-good build: `192.168.0.210`, backend `:8000`, frontend `:5173`, Python 3.13. |
| Raspberry Pi 4 / 5 | Backend/print host | **EXPECTED GOOD** | Only the Pi **3B** is validated (as a print agent). Newer Pis should work; not the tested backend topology. |
| Linux workstation/server (x86-64) | Backend + Frontend host | **EXPECTED GOOD** | Stack is portable Python/Node; not the tested host, and no service/auto-start is documented yet. |
| macOS workstation | Backend + Frontend host | **UNTESTED** | No validation evidence. |

---

## 2. Client devices (kiosk / admin browser UI)

The UI is a responsive web app; these are the devices that render and drive it.

| Device | Class | Evidence / notes |
| --- | --- | --- |
| Desktop Windows browser | **TESTED GOOD** | M8: Desktop PC landscape PASS. |
| iPad — Safari | **TESTED GOOD** | M8: portrait + landscape PASS. Primary check-in device. |
| iPad — Chrome | **TESTED GOOD** | M8: portrait + landscape PASS. |
| Android phone (generic) | **TESTED GOOD** | M8: portrait + landscape PASS; in-app camera check-in validated. |
| Google Pixel 9 Pro XL (Edge) | **TESTED GOOD** | M8: renders correctly; camera workflow validated. |
| Amazon Fire tablet | **TESTED GOOD** | M8: portrait + landscape PASS. |
| Other modern desktop browsers (macOS/Linux, Windows 10) | **EXPECTED GOOD** | Standard responsive web UI; not explicitly validated. |
| iOS front/back camera (`facingMode`) toggle | **UNTESTED** | Camera enumeration is validated; the iOS facingMode toggle is explicitly deferred. |

> **Pixel devices / Android phones:** "Pixel 9 Pro XL" and a generic Android phone
> are the validated Android references. Other Pixel/Android models are
> **EXPECTED GOOD** — the same responsive UI and `getUserMedia` camera path — but
> are not individually tested.

---

## 3. Printers & media

| Item | Class | Evidence / notes |
| --- | --- | --- |
| Brother QL-800 (USB), queue `QL800_BROTHER`, driver `ql800pdrv 2.1.4-0` | **TESTED GOOD** | Known-good build; production settings `PageSize=62x100`, `BrPriority=BrQuality`, `BrBrightness=15`. |
| Brother DK-2205 continuous labels | **TESTED GOOD** | Known-good media. |
| `ptouch-ql` open-source driver path | **TESTED GOOD (with caveat)** | Works; visible halftoning / lower photo quality vs. the Brother driver (see [PRINT-SERVER.md](../PRINT-SERVER.md)). |
| Other CUPS-supported USB label printers | **EXPECTED GOOD** | The agent prints via CUPS by queue name (`PBC_PRINTER_NAME`) + PPD; only the QL-800 is validated. |
| Network (non-USB) printer connection | **UNTESTED** | Only USB is validated. |
| Non-Brother printers generally | **UNTESTED** | No validation evidence. |

---

## 4. Print agents

| Agent host | Class | Evidence / notes |
| --- | --- | --- |
| Raspberry Pi 3B, Raspberry Pi OS Lite (64-bit), Python 3.13 | **TESTED GOOD** | Known-good build: `192.168.0.124`, polling client; the supported agent platform. |
| Raspberry Pi 4 / 5 (Pi OS Lite 64-bit) | **EXPECTED GOOD** | Same CUPS/Python path as the 3B; not individually validated. |
| Other Linux host with CUPS | **EXPECTED GOOD** | The agent drives CUPS (`lp` / `lpstat`); any Linux host with a working CUPS queue should work; not validated. |
| **Windows print agent** | **NOT SUPPORTED** | `print-agent/print_agent.py` drives CUPS directly (`lp`, `lpstat`). There is no Windows implementation; supporting a Windows print host requires net-new code, not documentation. |

---

## 5. Known-good reference build (July 2026)

The single validated end-to-end configuration, from
[KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md):

| Element | Value |
| --- | --- |
| Backend host | Windows 11, Python 3.13, `192.168.0.210:8000` |
| Frontend host | Windows 11, Vite/React, `192.168.0.210:5173` |
| Print agent | Raspberry Pi 3B, Pi OS Lite 64-bit, Python 3.13, `192.168.0.124` (polling) |
| Printer | Brother QL-800 (USB), driver `ql800pdrv 2.1.4-0`, queue `QL800_BROTHER` |
| Media | Brother DK-2205 continuous labels |
| Validated flow | iPad check-in → photo capture → badge generation → print-job creation → agent polling → badge download → badge printing (end-to-end) |

> IP addresses are the reference build's LAN values and will differ per site;
> configure them via [EnvironmentVariables.md](EnvironmentVariables.md).

---

## Related references

- [SoftwareMatrix.md](SoftwareMatrix.md) — OS, runtime, driver, and dependency versions.
- [KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md) — the raw validated-build snapshot.
- [PRINT-SERVER.md](../PRINT-SERVER.md) — Raspberry Pi + CUPS + Brother setup.
- [EnvironmentVariables.md](EnvironmentVariables.md) — per-site host/printer configuration.
