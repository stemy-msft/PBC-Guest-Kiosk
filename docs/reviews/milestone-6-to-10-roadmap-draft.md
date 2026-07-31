# Product Roadmap — Milestones 6 → 10 (DRAFT — Remaining Work Only)

**Repository:** PBC-guest-kiosk (`stemy-msft/PBC-Guest-Kiosk`, branch `main`)
**Draft date:** 2026-07-31
**Type:** Planning draft. Derived from
[`milestone-6-to-10-roadmap.md`](./milestone-6-to-10-roadmap.md) with **completed items
removed** — this shows only what is left to build/verify. No code, schema, or version changed.
**Status legend:** **Partial** (scaffolded/incomplete) · **Not started** · **Verify** (confirm
then close).

> For full context (what's already shipped, how the two source roadmaps were reconciled, and the
> finding-by-finding history), see the unified roadmap. This draft is the working checklist.

---

## Snapshot — where the real remaining effort is

- **M6:** mostly a **verification** milestone now — prove a clean rebuild + close doc/hygiene gaps.
- **M7:** small gaps — **enforce lockout**, Person/Visit refactor, a few frontend fixes.
- **M8:** **export list** + **guest print-status screen (5E)** + kiosk audit events.
- **M9:** the **largest remaining build** — Batch 5D recovery, backups, health monitoring.
- **M10:** **containerization** + packaging + final regression/security pass.

---

## Milestone 6 — Deployment Readiness · pre-Beta · `0.8.0`

**Gate (owner's bar):** a brand-new Raspberry Pi **and** a brand-new Fedora host rebuild entirely
from the repo + docs with **no tribal knowledge**.

**Remaining:**
- [ ] **Clean-rebuild acceptance test** on fresh Pi + Fedora hosts; log every undocumented step (this *is* the gate).
- [ ] Verify/complete docs for accuracy: **README, INSTALL, PRINT-SERVER, TROUBLESHOOTING, ADMINISTRATION**, and **known-good Brother QL-800 settings**.
- [ ] **F-026** — pin `qrcode`; drop `git-filter-repo` from runtime deps.
- [ ] **F-027** — resolve config drift (`DATABASE_URL` etc. documented but ignored).
- [ ] **F-029** — startup validation of `JWT_SECRET_KEY` (fail fast, not at first login).
- [ ] **F-031** — doc/role-model drift.
- [ ] Correct app version string `0.7.9 Beta` → `0.8.0`.

---

## Milestone 7 — User & Visitor Management · Beta · `0.9.0-beta`

**Success test (owner's):** staff log in with their own account; check a visitor in and reprint a
badge; **a returning parent is found and checked in again in under 10 seconds.**

**Remaining:**
- [ ] **F-009 — account lockout:** `failed_login_count` increments but `login()` never blocks. Add threshold lockout + reset/unlock path.
- [ ] **Account activity history** surfaced to admins (build on `audit()`).
- [ ] **Visitor notes** — *(Verify)* confirm present or implement.
- [ ] **Person/Visit data-model refactor (F-018)** — separate person identity from visit events; remove name-based history grouping. **Last breaking schema change — land before the Beta freeze.**
- [ ] **F-006** — Reporting `visitor_types` crash: *(Verify)* confirm fixed + add render test.
- [ ] **F-015** — honor `required_returning_checkin_fields` (camelCase typo).
- [ ] **F-016** — remove dead duplicate `handleResponse` (`no-undef`).
- [ ] **F-017** — route all `api.js` calls through the shared session handler.
- [ ] **F-023 / F-024** — remove dead code / empty `.jsx` scaffolds.

---

## Milestone 8 — Operational Camp Readiness · RC1 · `1.0.0-rc1`

**Success criteria (owner's):** accurately answer **"Who is on property right now?" within
seconds.**

**Remaining:**
- [ ] **Emergency export** — exportable (CSV) list of active visitors with arrival times + contact info. *(Verify export doesn't already exist, then add.)*
- [ ] **Guest print-status screen (Batch 5E)** — anonymous **minimized** `GET /api/print-jobs/{id}/status` (`{status, station_name}` only); kiosk poll-until-terminal screen with 5-bucket messaging, location copy, max-wait escalation, configurable auto-return. *(Schema-independent; richer `Claimed` text after 5D lands in M9.)*
- [ ] **F-013** — consistent UTC datetime handling for check-in/out math.
- [ ] **F-021** — audit events for kiosk check-in/checkout/print.
- [ ] **F-011** — `delete_print_station` respects PrintJob FK (no 500).
- [ ] **F-004 / F-005 (finish)** — extend public-endpoint minimization to the station list (`agent_key`/internal IPs). *(Checkout locator already minimized in 5B.)*

---

## Milestone 9 — Security & Reliability · RC2 · `1.0.0-rc2`

**Success criteria (owner's):** **a hardware failure does not result in lost visitor records.**
**Largest remaining build.**

**Remaining:**
- [ ] **Error recovery — Batch 5D:**
  - [ ] Minimal reviewed **additive-migration runner** (`PRAGMA`-guarded `ADD COLUMN` + schema-version marker; keep `create_all` for greenfield) — **F-019**.
  - [ ] The 4–5 additive `print_jobs` columns (`claimed_by_agent_id`, `claim_expires_at`, `claim_generation`, `attempt_count`, optional `last_recovery_reason`).
  - [ ] **Enforce** agent credential + `enabled` + **station ownership** on `pending`/`claim`/`status`/`badge-image`/heartbeat (after proving grace-window exit).
  - [ ] **Atomic** station-scoped claim — **F-012**.
  - [ ] **Lease + recovery sweep** → requeue stranded jobs → cap 3 → terminal `Failed`; generation-based stale-update rejection; badge regeneration.
  - [ ] **F-014** — station "online" staleness expiry.
- [ ] **Automated backups** — database + visitor photos + configuration, scheduled, with a **tested restore** drill.
- [ ] **Health monitoring** — backend / frontend / print-agent / printer status surfaced.
- [ ] **F-021 (complete)** — visitor created/modified, badge printed/reprinted, checkout all audited.
- [ ] **F-010** — upload type/size/decompression-bomb guards.
- [ ] **F-008** — lock CORS to known origins.
- [ ] **F-028** — fix log-handler duplication under `--reload`.

---

## Milestone 10 — Production Release (v1.0) · RTM · `1.0.0`

**Success criteria (owner's):** **the software can be deployed by someone other than you.**

**Remaining:**
- [ ] **Containerization (Fedora):** backend container, frontend container, reverse proxy, persistent storage; compose/quadlet + docs.
- [ ] **Branding polish:** consistent PBC branding, responsive layouts, UX improvements.
- [ ] **Release packaging:** the five-step acceptance (clone → INSTALL.md → stand up → configure printer → print badges) executed by a **non-author**.
- [ ] **Final regression + security pass:** full suite green (**F-030** matured to full regression); confirm all blocker findings closed; **rotate production secrets at cutover** (F-001 follow-up).
- [ ] Publish **release notes**, known-issues list; seed the v2.0 backlog.

---

## Open findings still to close

| Milestone | Findings |
|---|---|
| M6 | F-026, F-027, F-029, F-031 |
| M7 | F-006 *(verify)*, F-009, F-015, F-016, F-017, F-018, F-023, F-024 |
| M8 | F-004/F-005 (finish), F-011, F-013, F-021 |
| M9 | F-008, F-010, F-012, F-014, F-019, F-021 (complete), F-028 + Batch 5D |
| M10 | F-030 (full regression), F-032, secret rotation (F-001 follow-up) |

*(Closed/shipped: F-001, F-002, F-003, F-004, F-007 — verify at the M10 security pass.)*

---

## Future v2.0 backlog (not needed for launch)

QR codes · visitor self-checkout · SMS notifications · driver alerts · contractor badges ·
volunteer sign-in · multi-printer support · multiple kiosk stations · multi-campus support ·
DB indexing/pagination for scale · adopt Alembic at the first non-additive migration.

---

## Validation discipline (every milestone)

- **Backend:** `py_compile` (exit 0) + `pytest` (all green; suite grows per gate).
- **Frontend:** `npm run test` (green), `npm run build` (success), `npm run lint` (trend to 0),
  `git diff --check` (clean).
- **Always-green regression guards:** `test_station_routing.py` + `test_no_reassign_route_exists`
  (routing lock 5.9), auth/authorization (Batches 3/5C), anonymous-minimization (5B; 5E once added).

No milestone is done until its gate is demonstrated with the above evidence.

**Suggested commit message:**
`docs: add draft remaining-work roadmap (M6–M10, completed items removed)`
