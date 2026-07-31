# Product Roadmap — Milestones 6 → 10 (Reconciled)

**Repository:** PBC-guest-kiosk (`stemy-msft/PBC-Guest-Kiosk`, branch `main`)
**Roadmap date:** 2026-07-30
**Type:** Planning only. No application code, schema, configuration, or version string was
changed in this pass — this document is the only artifact.
**Reconciles:**
1. The owner's **feature-based product roadmap** (M6 Deployment Readiness → M10 Production
   Release v1.0), and
2. The engineering **release-gate draft** (Beta/RC1/RC2/RTM) previously drafted this session,
   now folded in as the *release-designation overlay* on the owner's structure.

**Companion docs:** [`pre-milestone-8-repository-audit.md`](./pre-milestone-8-repository-audit.md)
(findings F-001…F-032) and [`pre-milestone-8-remediation-plan.md`](./pre-milestone-8-remediation-plan.md)
(Batches 1–5C **shipped**; 5D/5E **designed**; station-routing **locked** at Milestone 5.9).

---

## 1. How the two roadmaps reconcile

| Axis | Owner's roadmap | Engineering draft | Reconciled decision |
|---|---|---|---|
| **Structure** | Feature themes per milestone | Release quality gates | **Owner's feature structure wins** as the primary skeleton. |
| **Labels** | M10 = "Production Release v1.0" | M7=Beta, M8=RC1, M9=RC2, M10=RTM | **Keep the owner's designations** (7=Beta, 8=RC1, 9=RC2, 10=RTM/v1.0) as an overlay (§11 nuance). |
| **M6 meaning** | Deployment/printing readiness + docs | Feature-complete/hardening | **Owner wins** — M6 is deployment reproducibility (§4), *not* feature-complete. |
| **Designed work** | (predates it) | 5D/5E/Person-Visit in "M6" | **Relocated** to where they fit the owner's themes: 5D→**M9**, 5E→**M8**, Person/Visit→**M7** (§10). |

**The most important reconciliation:** the owner's roadmap was written **before** the security
audit and the Batch 1–5C remediation. Since then, large parts of **M6, M7, and M8 have already
been built**. This document overlays **actual build status** so no completed work is re-done and
the remaining effort is visible. The genuine remaining build is concentrated in **M9 (Security &
Reliability)** and **M10 (Production Release / containerization)**.

---

## 2. Numbering & version reality

Three numbering schemes coexist; do not confuse them:

- **Commit milestones** `5.8.x`…`5.9` — per-commit work units (continue under these gates).
- **App version string** `0.7.9 Beta` in `frontend/src/App.jsx` — **premature** (no freeze/pilot
  yet). M6 corrects it to a truthful `0.8.0`; each gate advances it (§ per-milestone).
- **Audit "Milestone 8"** — an *older* internal label for the Person/Visit refactor (F-018).
  **Superseded:** that refactor now lives in **M7** (§10). In this roadmap **"Milestone 8" = RC1**.

Recommended version string per gate: M6 `0.8.0` · M7 `0.9.0-beta` · M8 `1.0.0-rc1` ·
M9 `1.0.0-rc2` · M10 `1.0.0`.

---

## 3. Current build status at a glance

Legend: **Done** (shipped) · **Partial** (scaffolded/incomplete) · **Not started**.

| Owner milestone / feature | Status | Evidence |
|---|---|---|
| **M6** README/INSTALL/PRINT-SERVER/TROUBLESHOOTING/ADMINISTRATION/KNOWN_GOOD_BUILD | **Partial** | Files exist in `docs/`; completeness + rebuild test outstanding |
| **M6** `.env.example`, repo cleanup, sample-not-real data | **Done** | Batch 4 (untracked `.env`/`.venv`/`*.pyc`/`visitor_kiosk.db.old`; templated settings) |
| **M6** `print-agent/requirements.txt`, clean `.gitignore` | **Done** | present; `.gitignore` extended in Batch 4 |
| **M7** Multiple accounts, Admin + check-in roles | **Done** | `POST/GET/PUT /api/users`, Batch 3 `require_admin` |
| **M7** Password change / admin reset / forced first-login change | **Done** | `/api/change-password`, `/api/users/{id}/reset-password`, `must_change_password` |
| **M7** Account disable/enable | **Done** | `PUT /api/users/{id}/status` |
| **M7** Account **lockout** after failed logins | **Partial** | `failed_login_count` increments but `login()` **never blocks** (audit F-009) |
| **M7** Audit logging (login) / account activity history | **Partial** | `audit()` on login/user ops; kiosk actions unaudited (F-021) |
| **M7** Visitor search / returning lookup / reuse photo / history / reprint | **Done** | `/api/visitors/search`, `/find`, `checkin-again`, `/history`, print |
| **M7** Visitor notes | **Verify** | not confirmed in API scan |
| **M8** Check-out + timestamp + badge status | **Done** | `PUT /api/visitors/{id}/checkout`, `bulk-checkout`, `check_out_time` |
| **M8** Dashboard (current/checked-in/today/recent) | **Done** | `GET /api/dashboard` `get_dashboard_stats` |
| **M8** Visitor categories | **Done** | `purpose`/`visitor_types` in reporting |
| **M8** Emergency "who's on site" + exportable list | **Partial** | `/api/visitors/active` + reporting exist; **export (CSV)** unconfirmed |
| **M8** Guest print-status screen (Batch 5E) | **Not started** | designed in remediation §21.4–§21.6 |
| **M9** Automated backups (DB/photos/config) | **Not started** | no backup automation in repo |
| **M9** Health monitoring (backend/frontend/agent/printer) | **Partial** | `/health` + heartbeats exist; staleness never expires (F-014) |
| **M9** Error recovery (printer/Pi/backend offline, badge regen) — **Batch 5D** | **Not started (designed)** | remediation §20–§21; F-012/F-014/F-019 |
| **M9** Audit logging (visitor created/modified/printed/reprinted/checkout) | **Partial** | login/user audited; kiosk events missing (F-021) |
| **M10** Containerization (Fedora: backend/frontend/proxy/storage) | **Not started** | no Dockerfiles in this repo |
| **M10** Authentication + Role-Based Access | **Done** | Batch 3 DB-backed auth + `require_admin` |
| **M10** Branding polish / responsive | **Partial** | ongoing |
| **M10** Release packaging (clone→INSTALL→stand up) | **Partial** | docs exist; end-to-end rebuild unproven |

---

## 4. Milestone 6 — Production Printing & Deployment Readiness

**Owner's goal:** *Convert the printing workflow from "it works" to "it is reproducible and
deployable."*
**Release designation:** pre-Beta · **version `0.8.0`**

**Definition of done (owner's bar):** *a brand-new Raspberry Pi and a brand-new Fedora host can
be rebuilt entirely from the GitHub repository and documentation with no tribal knowledge
required.* This is a **verification test**, not a doc-writing task — it is the M6 gate.

**Already delivered:** `.env.example`, repo cleanup, sample-not-real data, `.gitignore`,
`print-agent/requirements.txt`, and all six `docs/` files exist (Batch 4 + prior work).

**Remaining work:**
- Perform the **clean-rebuild acceptance test** on fresh Pi + Fedora hosts, capturing every gap
  the docs miss (this is what closes M6).
- Complete/verify each deliverable for accuracy: **README, INSTALL, PRINT-SERVER,
  TROUBLESHOOTING, ADMINISTRATION**, and **known-good Brother QL-800 settings**
  (`KNOWN_GOOD_BUILD.md`).
- Close deployment-hygiene findings: **F-026** (pin `qrcode`, drop `git-filter-repo` runtime
  dep), **F-027** (config drift — `DATABASE_URL` etc.), **F-029** (startup validation of
  `JWT_SECRET_KEY`), **F-031** (doc/role-model drift).
- Correct the app version string `0.7.9 Beta` → `0.8.0`.

**Owner's success criteria (unchanged):** end-to-end iPad→printed badge; Print Agent + Pi
documented; repo cleaned; sample data; `.env.example`; INSTALL/TROUBLESHOOTING complete;
known-good printer settings; staff admin process documented.

**M6 gate:** the clean-rebuild test passes on new hardware with no undocumented step.

---

## 5. Milestone 7 — User & Visitor Management  · **Beta**

**Owner's goal:** *Transform the kiosk from a single-user proof-of-concept into a multi-user
operational system suitable for real-world deployment.*
**Release designation:** **Beta** · **version `0.9.0-beta`**

**Already delivered:** multi-account, Admin + check-in roles, password change, admin reset,
forced first-login change, disable/enable, login audit, visitor search, returning lookup, reuse
prior photo, visitor history, badge reprint (Batches 3 + prior; verified in API scan).

**Remaining work:**
- **Account lockout (F-009):** `failed_login_count` exists but is never enforced — add threshold
  lockout + reset/unlock path. *(Owner requirement + audit blocker-adjacent.)*
- **Account activity history** surfaced to admins (build on `audit()`).
- **Visitor notes** — confirm/implement.
- **Person/Visit data-model refactor (F-018)** — separate person identity from visit events;
  removes fragile name-based history grouping. **Last breaking schema change; land before the
  M7 Beta freeze** using the M9 migration runner if it lands first, else a scoped additive step.
- Frontend correctness for this surface: **F-006** (Reporting `visitor_types` crash — verify
  closed + test), **F-015** (`required_returning_checkin_fields` typo), **F-016** (dead
  duplicate `handleResponse`), **F-017** (route all `api.js` calls through the shared session
  handler), **F-023/F-024** (dead code / empty scaffolds).

**Owner's success test (unchanged):** staff log in with their own account; staff check a visitor
in and reprint a badge; **a returning parent is found and checked in again in under 10 seconds.**

**M7 gate (Beta entry):** the success test passes; lockout enforced; Person/Visit refactor in
with history/search regression tests; feature set for user+visitor management frozen.

---

## 6. Milestone 8 — Operational Camp Readiness  · **RC1**

**Owner's goal:** *Handle real camp traffic.*
**Release designation:** **RC1** · **version `1.0.0-rc1`**

**Already delivered:** visitor check-out (+ bulk) with timestamps, badge-status tracking,
dashboard (current/checked-in/today/recent), visitor categories, active-visitor + reporting
summary (Batches + prior).

**Remaining work:**
- **Emergency "who's on property right now" export:** confirm/add an exportable (CSV) list with
  arrival times + contact info for the active-visitor set.
- **Guest print-status screen (Batch 5E):** anonymous **minimized** `GET
  /api/print-jobs/{id}/status` (`{status, station_name}` only — ratified visitor-identity
  boundary §21.10) + kiosk poll-until-terminal screen with 5-bucket messaging, location copy,
  max-wait escalation, configurable auto-return. (Schema-independent; richer `Claimed` text
  appears once 5D lands in M9.)
- Operational correctness: **F-013** (UTC datetime consistency for check-in/out math),
  **F-021** (audit events for kiosk check-in/checkout/print), **F-011** (`delete_print_station`
  respects PrintJob FK), **F-004/F-005** finalize public-endpoint minimization (5B done for
  checkout locator; extend to station list agent-key/IP exposure).

**Owner's success criteria (unchanged):** the system accurately answers **"Who is on property
right now?" within seconds.**

**M8 gate (RC1):** emergency export works; guest status screen live; kiosk actions audited; a
full mock camp-day exercised at the pilot with no Sev-1/Sev-2 open.

---

## 7. Milestone 9 — Security & Reliability  · **RC2**

**Owner's goal:** *Ensure the system survives failures.* — *A hardware failure does not result
in lost visitor records.*
**Release designation:** **RC2** · **version `1.0.0-rc2`**

**This is the largest remaining build.** It maps directly onto the designed-but-unbuilt Batch
5D plus backups and monitoring.

**Remaining work:**
- **Error recovery — Batch 5D** (remediation §20–§21): minimal reviewed **additive-migration
  runner** (`PRAGMA`-guarded `ADD COLUMN`, schema-version marker; keeps `create_all` for
  greenfield — **F-019**); the 4–5 additive `print_jobs` columns; **enforce** agent credential +
  `enabled` + **station ownership** on `pending`/`claim`/`status`/`badge-image`/heartbeat (after
  proving grace-window exit); **atomic** station-scoped claim (**F-012**); **lease + recovery
  sweep** requeuing stranded jobs → cap 3 → terminal `Failed`; generation-based stale-update
  rejection; badge regeneration path. Covers the owner's *printer/Pi/backend offline* + *badge
  regeneration* items and **F-014** (station staleness).
- **Automated backups:** database + visitor photos + configuration, on a schedule, with a
  **tested restore** drill.
- **Health monitoring:** backend/frontend/print-agent/printer status surfaced (build on
  heartbeats now that staleness expiry is fixed).
- **Audit logging completeness (F-021):** visitor created/modified, badge printed/reprinted,
  checkout — all recorded.
- Hardening findings: **F-010** (upload type/size/decompression-bomb guards), **F-008** (lock
  CORS), **F-028** (log-handler duplication under `--reload`).

**Owner's success criteria (unchanged):** **a hardware failure does not result in lost visitor
records.**

**M9 gate (RC2):** recovery sweep proven under agent-failure + contention; backup→restore proven
on a prod-shaped copy; monitoring reports true status; kiosk actions fully audited.

---

## 8. Milestone 10 — Production Release (v1.0)  · **RTM**

**Owner's goal:** *Transition from pilot project to official camp system — the software can be
deployed by someone other than you.*
**Release designation:** **RTM** · **version `1.0.0`**

**Already delivered:** authentication + Role-Based Access (Batch 3).

**Remaining work:**
- **Containerization (Fedora host):** backend container, frontend container, reverse proxy,
  persistent storage; compose/quadlet definitions + docs.
- **Branding polish:** consistent PBC branding, responsive layouts, UX improvements.
- **Release packaging:** the owner's five-step acceptance (clone → INSTALL.md → stand up →
  configure printer → print badges) executed by **someone other than the author**.
- **Final regression + security pass:** full suite green (**F-030** matured to full regression);
  confirm all blocker findings closed; **rotate production secrets at cutover** (F-001 follow-up).
- Publish **release notes**, known-issues list, and seed the **v2.0 backlog** (§12).

**Owner's success criteria (unchanged):** **the software can be deployed by someone other than
you.**

**M10 gate (RTM):** `1.0.0` tagged; containerized deploy stood up by a non-author from docs
alone; secrets rotated; support/backup handoff signed.

---

## 9. Audit-finding → milestone map (updated)

| Finding(s) | Lands in | Note |
|---|---|---|
| F-001, F-002, F-003, F-004, F-007 | *Shipped* (Batches 3/4/5B) | Verify closed at M10 security pass |
| F-026, F-027, F-029, F-031 | **M6** | Deployment/config hygiene |
| F-006, F-009, F-015, F-016, F-017, F-018, F-023, F-024 | **M7** | User/visitor surface + Person/Visit refactor |
| F-004/F-005 (finish), F-011, F-013, F-021, Batch 5E | **M8** | Operational + visitor-facing minimization |
| F-008, F-010, F-012, F-014, F-019, F-028, Batch 5D | **M9** | Reliability/recovery/backups |
| F-030 (full regression), F-032, branding | **M10** | Release hardening |
| Scale (indexing/pagination), Alembic adoption | **Post-1.0** | v2.0 backlog |

---

## 10. Relocated designed work (from the engineering draft)

The prior draft parked these in "M6"; under the owner's themes they move to:

- **Batch 5D (enforcement/ownership/recovery + migration runner) → M9** — it *is* the owner's
  "Error Recovery / survives failures" theme.
- **Batch 5E (guest print-status screen) → M8** — it *is* the owner's operational visitor UX
  during camp traffic (schema-independent; can precede 5D).
- **Person/Visit refactor (F-018) → M7** — it supports the owner's Visitor Management (history)
  and is the last breaking schema change, which must precede the M7 Beta freeze.

---

## 11. Release-designation nuance (recommendation)

The owner's labels (7=Beta, 8=RC1, 9=RC2, 10=RTM) are retained. One honest caveat: strict SemVer
treats "RC" as **bug-fixes only**, yet M8 and M9 still add subsystems (guest status screen,
recovery, backups). Recommended reading:

- Treat each of **M7/M8/M9 as a "release candidate for that milestone's scope"** — increasing
  production-readiness, not a frozen 1.0 candidate.
- Apply a **true code/feature freeze from the start of M10**; only showstopper fixes thereafter.
- If a stricter model is preferred later, the natural remap is: feature-freeze at end of M8,
  **Beta = M9 hardening**, **RC = early M10**, **RTM = M10 completion**. *(Not adopted here —
  documented as an option only.)*

---

## 12. Future v2.0 backlog (owner's list — not needed for launch)

QR codes · visitor self-checkout · SMS notifications · driver alerts · contractor badges ·
volunteer sign-in · multi-printer support · multiple kiosk stations · multi-campus support.
*(Engineering additions: DB indexing/pagination for scale; adopt Alembic at the first
non-additive migration; remaining low-severity findings.)*

---

## 13. Validation discipline (every milestone)

- **Backend:** `py_compile` all modules (**exit 0**) + `pytest` (**all green**, suite grows per
  gate).
- **Frontend:** `npm run test` (**green**), `npm run build` (**success**), `npm run lint`
  (**trend to 0**), `git diff --check` (**clean**).
- **Regression guards that must stay green at all times:** `test_station_routing.py` +
  `test_no_reassign_route_exists` (routing lock, Milestone 5.9), the auth/authorization tests
  (Batches 3/5C), and the anonymous-minimization tests (5B; 5E once added).

No milestone is "done" until its gate is demonstrated with the above evidence.

---

## 14. NOT performed in this pass (explicit)

No application code, schema, migration, endpoint, auth, kiosk workflow, or version string was
changed. No commit was made automatically. This is a reconciled plan only; implementation of the
remaining M6 rebuild test, M7 lockout/Person-Visit, M8 export/5E, M9 5D/backups, and M10
containerization has **not** started.

**Suggested commit message:**
`docs: reconcile owner feature roadmap with release gates (M6–M10 unified, build-status overlay, finding traceability)`
