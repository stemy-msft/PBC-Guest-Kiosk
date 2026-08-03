# Quick Reference — PBC Guest Kiosk

One-page operational cheat sheet. Replace `<backend-host>` with your backend's name or
IP. Deeper guidance: [Administration](Administration.md) · [Troubleshooting](Troubleshooting.md) ·
[Print Operations](PrintOperations.md) · [Backup & Recovery](BackupAndRecovery.md).

---

## Key URLs

| What | Where |
| --- | --- |
| Kiosk / Staff / Admin app | The frontend app URL (one web app). Admin: sign in → **Staff → Administration** |
| Backend reachability | `http://<backend-host>:8000/` |
| Station check-in page | `<base check-in URL>/<station-slug>` (QR per station; base set in **Settings**) |

## Health Endpoints

| Endpoint | Use | Healthy |
| --- | --- | --- |
| `GET /` | Reachable | `{"application":"PBC Visitor Kiosk","version":"1.0"}` |
| `GET /health/live` | Process alive (cheap) | `{"status":"alive"}` |
| `GET /health` | Deep readiness | healthy; **503** if a critical check fails |

```powershell
curl http://<backend-host>:8000/health
```

## Common Commands (on the Raspberry Pi)

```bash
lpstat -p                    # printer queue enabled/idle?
lpstat -o                    # jobs currently in CUPS
lpstat -t                    # full CUPS status
lpoptions -p QL800_BROTHER   # current printer options
lp -d QL800_BROTHER file.png # print a file directly
cancel -a                    # clear the CUPS queue
```

Check the backend is listening for other devices (Windows host):

```powershell
netstat -ano | findstr 8000  # expect 0.0.0.0:8000 LISTENING
```

## Log Locations

| File | Contents | Rotation |
| --- | --- | --- |
| `backend/logs/guest-kiosk.log` | Application activity & errors | 10 MB × 5 |
| `backend/logs/audit.log` | Logins, user/station/agent changes, reprints, redirects | 5 MB × 10 |

## Backup Commands (from repo root)

```powershell
python scripts/backup.py backup                                   # snapshot -> backend/backups (keep newest 14)
python scripts/backup.py backup --dest E:\pbc-kiosk-backups --retention 30   # off-machine copy
python scripts/backup.py list                                     # list snapshots
python scripts/backup.py verify --from backend\backups\20260801-153000Z      # confirm integrity
```

Secrets (the repository-root `.env`, `print-agent/.env`) are **not** in backups — copy them by hand.

## Restore Commands (stop backend + agents first)

```powershell
python scripts/restore.py restore --from backend\backups\20260801-153000Z    # auto safety snapshot, atomic DB
#   add --yes to skip the confirm prompt; --no-safety only when the target is empty
```

Then start the backend, confirm `GET /health`, power the Pis back on.

## Print-Agent Commands (on the Pi)

```bash
python print_agent.py        # start the agent (self-enrolls DISABLED on first run)
lpstat -p                    # confirm the printer is idle
```

Approve a new agent in **Administration → Print Agents**. CUPS/Linux only — no Windows
agent.

## Emergency Actions

| Situation | Do this |
| --- | --- |
| Printer down, guests waiting | **Redirect** the pending job to another station (Print Queue) |
| Badge needs re-printing | **Reprint** from the visitor's record |
| End of day / everyone still active | **Bulk check-out** |
| Data wrong / corrupted | Stop backend + agents → `restore --from <snapshot>` |
| Pi/agent died | Automatic recovery; replace per [Print Operations §10](PrintOperations.md#10-print-agent-replacement-procedure) |
| System looks unhealthy | Check `GET /health`, then [Recovery Decision Tree](Troubleshooting.md#12-recovery-decision-tree) |

## Website (UX) Appearance

- **Theme (colors / logo / font):** select on the Settings page, or build one in the
  **Theme Editor** ([Administration §8](Administration.md#8-theme-selection)).

## Badge Appearance

Badge appearance is **fixed in code** for this release -- there is no badge theme
control in the UI or environment.

- **Colors / styling:** fixed in code (`backend/app/services/badge_service.py`).
- **Layout (size/placement):** fixed in code for this release (badge `1100 × 696`);
  changing it is a code edit in `backend/app/services/badge_layouts.py`, not a setting.
- **Photo brightness/contrast:** `backend/app/services/badge_service.py`.
- **Printer quality/size:** `PageSize=62x100`, `BrPriority=BrQuality`, `BrBrightness=15`
  ([Print Server guide](../PRINT-SERVER.md#brother-driver-recommended-settings)).
- `PBC_BADGE_THEME` is post-RTM scaffolding only -- leave at `PBC_standard`
  ([Administration §8](Administration.md#8-theme-selection)).

---

*Keep this page posted at the kiosk. Full procedures are in the linked operations
guides.*
