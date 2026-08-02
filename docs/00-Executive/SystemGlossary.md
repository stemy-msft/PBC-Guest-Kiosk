# System Glossary — PBC Guest Kiosk

**Audience:** Everyone — camp administrators, volunteer IT, staff users, and future
developers. This is the *canonical vocabulary source* for the PBC Guest Kiosk. When
another document uses one of these terms, it means what is written here.

**Status:** Describes the system as it exists at `v1.0.0-rc.1`. Every definition is
grounded in the current source code. Where a term is commonly confused or where the
implementation has a deliberate limitation, that is called out explicitly.

**Related reading:**
[What Is the PBC Guest Kiosk?](WhatIsGuestKiosk.md) ·
[Architecture Overview](../01-Architecture/Overview.md) ·
[Visitor Lifecycle](../01-Architecture/VisitorLifecycle.md) ·
[Print Architecture](../01-Architecture/PrintArchitecture.md)

---

## Terms

### Visitor
A person recorded by the kiosk. Each **Visitor** is a single row in the `visitors`
database table holding that person's details (name, visitor type, host, purpose,
contact info, photo, badge, check-in time, and the station they checked in at).

There is **no separate "person" record**. A single individual who visits on three
occasions produces **three** `visitors` rows. The system links those rows only by
matching first name **and** last name (see **Returning Visitor**). This name-only
matching is the current behavior and a known limitation — there is no canonical
person identity.

### Visit
A single check-in-to-check-out episode, represented by one `visitors` row. A Visit
begins when `check_in_time` is set (at check-in) and ends when `check_out_time` is
set (at check-out). A Visit with no `check_out_time` is an **active** visit.

### Check-In
The act of creating a new Visit. At a kiosk this is a public, unauthenticated action
(`POST /api/visitors`): the visitor fills in their details and the station is taken
from the kiosk URL. Check-in **fails closed** if no valid, enabled station is
supplied — the system never guesses a station. See
[Visitor Lifecycle](../01-Architecture/VisitorLifecycle.md).

### Check-Out
The act of ending an active Visit by setting `check_out_time`. Check-out can be a
single manual action (`PUT /api/visitors/{id}/checkout`, recorded with method
`Manual Checkout`) or a bulk end-of-day action (`POST /api/visitors/bulk-checkout`,
recorded with method `Bulk Checkout`). The recording of *how* a visit ended lives in
the visitor's `check_out_method` field.

### Returning Visitor
A person who has checked in before and is checking in again. Staff start a returning
check-in from an existing visitor record (`POST /api/visitors/{id}/checkin-again`),
which creates a **brand-new** Visit row that copies the person's identity, optionally
reuses their existing photo, and carries over the **same** print station as the
original visit. Returning visitors are matched **by first + last name only** — this is
the current behavior and a documented limitation.

### Badge
The printable visitor credential: a PNG image generated from the visitor's photo and
details (`POST /api/visitors/{id}/badge`), stored under `uploads/badges/{id}.png`.
A badge is generated **after** a photo exists and **before** it can be printed. The
on-disk path is recorded on the visitor as `badge_path`.

### Badge Theme
The **colors and text styling** applied when a badge is rendered — background,
foreground, border, and header colors. At `v1.0.0-rc.1` badge appearance is **fixed in
code** with **no** UI or working environment control. A `PBC_BADGE_THEME` variable
(default `PBC_standard`) exists in the code as **post-RTM scaffolding only** — no
alternative theme has been built or tested, so it does not change the badge today. Not
to be confused with the selectable **website (UX) theme**
([Administration §8](../03-Operations/Administration.md#8-theme-selection)).
See [Environment Variables](../06-Reference/EnvironmentVariables.md).

### Badge Layout
The **dimensions and geometry** of a badge — its pixel width, height, and where each
element is placed. The layout is fixed to `PBC_standard` in the badge renderer and is
**not** configurable by environment variable at `v1.0.0-rc.1`. Layout (geometry) and
Theme (color) are separate concepts and are defined in separate code modules.

### Print Job
A queued request to print one badge, stored as a row in the `print_jobs` table. A
Print Job records which visitor and badge it is for, which **Print Station** it is
bound to, its status, and its ownership/lease bookkeeping. A Print Job moves through
exactly four statuses: **Pending → Printing → Completed** (or **Failed**). See
[Print Architecture](../01-Architecture/PrintArchitecture.md).

### Print Station
A **logical printing destination** — a named place badges are printed, identified by a
URL-safe `slug`. A Print Station is *where* a badge prints, not a physical device. A
visitor's check-in captures a `print_station_id`, and that station is the single source
of truth for where that visitor's badge is sent. A station is served by one or more
**Print Agents**; its online/offline state is derived from those agents' liveness.

### Print Agent
A **software process** (`print-agent/print_agent.py`) that runs next to a physical
printer — in the tested configuration, on a Raspberry Pi. The agent polls the backend
for pending jobs belonging to its station, claims them, downloads the badge image, and
sends it to the printer using CUPS (`lp`). Each agent authenticates with its own bearer
token and reports its liveness by re-registering on every poll. **A Print Agent is not a
printer and not a station** — see the distinction below.

### Queue
The set of Print Jobs waiting to be, or currently being, processed — i.e. jobs in the
`Pending` and `Printing` statuses. "The queue" is what staff see on the print-queue
screen and what an agent asks for when it calls `GET /api/print-jobs/pending`. Queue
health signals (a job stuck Pending, a stalled print, repeated failures) are derived
read-only from each job's stored fields.

### Reprint
A **staff-initiated** action that creates a **new** Print Job for a visitor whose badge
already exists (`POST /api/visitors/{id}/reprint`). Because it is an authenticated staff
action, a reprint may target a **different** station than the visitor originally checked
in at (for example, to print where the guest actually is). A reprint always creates a new
job and never re-uses or reassigns an existing one.

### Redirect
A **staff-initiated** action that moves a **still-pending** Print Job from its current
station to a different, enabled station (`PUT /api/print-jobs/{id}/station`). Redirect is
used when a job was queued for a station that is offline. Only `Pending` jobs can be
redirected; the job keeps its identity and stays `Pending` — there is **no** separate
"Redirected" status. Contrast with **Reprint**, which makes a new job.

### Staff User
An authenticated operator with a record in the `users` table who has signed in and holds
a session token. Staff users can view and manage visitors, the print queue, print
stations, and print agents. Any signed-in user is a Staff User; the only role the system
enforces in code beyond "authenticated" is **Administrator**.

### Administrator
A Staff User whose `role` is exactly `Administrator`. This is the **only** role the code
treats specially: administrator-only endpoints (such as changing system settings,
approving/assigning print agents, and permanent deletes) require it. All other role
labels are free-form text and are **not** separately enforced. See
[Security Controls §2](../06-Reference/SecurityControls.md#2-authorization-rbac).

### Health Endpoint
An HTTP endpoint that reports whether the backend is running and able to serve. There are
two: `GET /health/live` (a cheap "the process is up" liveness probe that touches nothing)
and `GET /health` (a readiness probe that verifies the database, upload directories,
configuration file, and backup subsystem, returning HTTP 503 if any critical dependency
is unavailable). Print-infrastructure status is reported by `/health` for information but
never makes it report unhealthy. See
[Security Controls §11](../06-Reference/SecurityControls.md#11-health-monitoring-protections).

### Backup
A point-in-time snapshot of everything needed to reconstruct the system: a transactionally
consistent copy of the SQLite database plus the `uploads/` files and the runtime
`config/` files, written to a timestamped snapshot directory with a manifest. Backups are
produced by a standalone, stdlib-only tool that copies the database using SQLite's online
backup API and verifies it with an integrity check. See
[Security Controls §8](../06-Reference/SecurityControls.md#8-backup-protections) and the
[Disaster Recovery guide](../DISASTER-RECOVERY.md).

### Restore
The reverse of a Backup: repopulating the live system from a snapshot directory. Restore
replaces the database and files from the snapshot and clears any stale SQLite sidecar
files so an old journal can never shadow the restored database. Restore is an operational
procedure, not an in-app feature; see the
[Disaster Recovery guide](../DISASTER-RECOVERY.md).

---

## The three most-confused terms

Operators have historically mixed up **Printer**, **Print Agent**, and **Print Station**.
They are three different things:

| Term | What it is | Example |
| --- | --- | --- |
| **Printer** | The physical hardware that puts ink on a label. | A Brother QL-800 label printer. |
| **Print Agent** | The software process that talks to one printer and to the backend. | `print_agent.py` running on a Raspberry Pi. |
| **Print Station** | The logical destination a badge is sent to; where a visitor checked in. | "Front Gate" (`slug: front-gate`). |

A **Print Station** is served by one or more **Print Agents**, and each **Print Agent**
drives one **Printer**. A full explanation of why the system separates these three lives
in [Print Architecture](../01-Architecture/PrintArchitecture.md).
