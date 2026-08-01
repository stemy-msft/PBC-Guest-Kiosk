# Disaster Recovery Runbook — PBC Guest Kiosk

**Audience:** Camp IT / operations staff.
**Scope:** Recovering visitor operations after a component failure — a dead
Raspberry Pi print agent, a crashed workstation, or a corrupted database — with
no loss of visitor records.

This runbook covers the built-in backup tool (`scripts/backup.py` /
`scripts/restore.py`, implemented in `backend/app/backup.py`) and the automatic
print-job recovery built into the backend.

---

## 1. What is protected

A snapshot is a single verified, integrity-checked copy of everything needed to
resume operations:

| Item | Live location |
| --- | --- |
| Database (all visitors, print jobs, stations, agents, users) | `backend/visitor_kiosk.db` |
| Visitor photos | `backend/uploads/photos/` |
| Generated badges | `backend/uploads/badges/` |
| QR assets | `backend/uploads/qr-codes/` |
| Theme logos | `backend/uploads/theme-logos/` |
| Live configuration | `backend/config/system_settings.json` |

**Not** in a snapshot (back these up by hand, securely): `backend/.env` and
`print-agent/.env` — they hold secrets and are deliberately excluded.

The database is copied with SQLite's online backup API, so a snapshot taken
while the backend is running is transactionally consistent. Every snapshot's
database copy is validated with `PRAGMA integrity_check`; a copy that fails is
discarded rather than kept.

---

## 2. Create a backup

From the repository root, with the backend Python environment available:

```powershell
python scripts/backup.py backup
```

- Snapshots are written to `backend/backups/<UTC-timestamp>/` and the most
  recent **14** are kept automatically.
- For an **off-machine** copy (recommended before shutdown and weekly), point
  `--dest` at removable or network storage:

  ```powershell
  python scripts/backup.py backup --dest E:\pbc-kiosk-backups --retention 30
  ```

List and verify existing snapshots:

```powershell
python scripts/backup.py list
python scripts/backup.py verify --from backend\backups\20260801-153000Z
```

**Recommended cadence:** daily during camp, plus one off-machine copy weekly and
one immediately before week-7 shutdown.

---

## 3. Restore a backup

> **Stop the backend and all print agents first.** Restoring under a running
> backend can corrupt the swapped-in database.

1. Stop the backend service and any Raspberry Pi print agents.
2. Restore the chosen snapshot:

   ```powershell
   python scripts/restore.py restore --from backend\backups\20260801-153000Z
   ```

   - The tool verifies the snapshot's integrity before touching anything.
   - If live data is present, it first takes a **pre-restore safety snapshot**
     of the current state (labelled `pre-restore`), so the restore is itself
     reversible. Use `--no-safety` only for a truly empty target.
3. Start the backend. Confirm it starts and the visitor list loads.
4. Power the Raspberry Pi print agents back on. They re-register automatically
   (their credentials are part of the restored database) and resume polling.

### Recovery scenarios

| Failure | Action |
| --- | --- |
| **Corrupted database** | Restore the most recent snapshot that passes `verify` (§3). |
| **Workstation failure** | Reinstall per `INSTALL.md`, restore the latest off-machine snapshot, start backend. |
| **Fresh/clean rebuild** | Restore into the new install; `--no-safety` is fine when the target is empty. |

---

## 4. Print-agent / print-job recovery (automatic)

The backend recovers print jobs abandoned by a failed agent **without operator
action** — no data loss, no manual database editing.

**How it works:** a print job is leased to an agent for a bounded time. If a job
stays "Printing" past its lease **and** its owning agent has stopped checking in
(crashed Pi, unplugged network, power loss), the backend requeues the job to
**Pending** so a healthy agent can pick it up. After 3 failed attempts the job is
marked **Failed** with a reason instead of retrying forever. A slow-but-alive
agent is left alone so a legitimately long print is not interrupted.

Recovery is **request-driven** — it runs when the print queue is polled or a job
is claimed. Practical guidance:

- **A station with more than one agent** self-heals: the surviving agent's next
  poll requeues the dead agent's job and prints it.
- **A single-agent station whose only agent dies** will leave that job showing
  "Printing" until the agent is restored or the job is redirected. To recover:
  1. Bring the Raspberry Pi back online (it re-registers and resumes), **or**
  2. Redirect the visitor's badge to another working station from the admin
     print view, **or**
  3. Reprint the badge from the visitor's record once a station is available.

Recovery re-fences each job (its claim generation is bumped) so a late response
from the dead agent's old lease can never overwrite the requeued job.

---

## 5. Post-recovery checklist

- [ ] Backend starts and the admin login works.
- [ ] Visitor list shows expected records (spot-check a recent check-in).
- [ ] A test badge prints from at least one station.
- [ ] Each Raspberry Pi shows as recently seen in the admin print view.
- [ ] A fresh backup is taken and copied off-machine.
