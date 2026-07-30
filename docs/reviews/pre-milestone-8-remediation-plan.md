# Pre-Milestone 8 Remediation Plan & Tracker

**Repository:** PBC-guest-kiosk (`stemy-msft/PBC-Guest-Kiosk`, branch `main`)
**Source of findings:** `docs/reviews/pre-milestone-8-repository-audit.md`
**Scope rule:** Small, independently verifiable batches. Preserve functionality and operational stability first. No Milestone 8 (Person/Visit) work. No `main.py`/`App.jsx` module splits. No Git history rewrite. No secret rotation. No destructive Git commands. No modification of the operational SQLite database.

> **Secret handling:** No secret values are reproduced in this document. Any real credential/key discovered is referred to by name only and marked for manual rotation.

---

## 1. Initial Working-Tree State (Batch 0)

Captured before any edits this pass:

```
git branch --show-current   ->  main
git status --short          ->  (empty — clean)
git diff --stat             ->  (empty)
git diff                    ->  (empty)
git log --oneline -1        ->  dd28918 Milestone 7.8.2 (HEAD -> main, origin/main)
```

**Important context vs. the audit report:** The audit was written against a *dirty* working tree (uncommitted edits to `main.py`, `App.jsx`, `api.js`). Those edits have since been **committed** as `Milestone 7.8.2`. Therefore:

- There were **no pre-existing uncommitted changes to preserve** at the start of this pass.
- The in-progress work the audit noted (adding `401/403 → handleUnauthorized()` to the shared `api.js` `handleResponse`, and the `report.visitorTypes` reporting mapping) is now part of the committed baseline.
- Consequently several audit findings are **already partially or fully addressed** by the committed baseline (see §2).

The audit report `docs/reviews/pre-milestone-8-repository-audit.md` is tracked and committed.

---

## 2. Finding Validation Results

Each finding re-validated against the **current committed code**, then classified.

| ID | Audit claim | Current-code validation | Classification |
|---|---|---|---|
| F-001 | Secrets committed (`.env`, `print-agent/.env`); `.env.example` ships real key/password | Not re-diffed this pass (Batch 4). `auth.py` loads `.env` from repo root. | **Confirmed (deferred to Batch 4)** |
| F-007 | Real DB (`visitor_kiosk.db.old`) + `.venv/` + `*.pyc` tracked | Not re-diffed this pass (Batch 4). | **Requires runtime verification / deferred (Batch 4)** |
| F-002 | No server-side role enforcement | `auth.py get_current_user` returns `payload["sub"]` string only; no role dependency exists. | **Confirmed (deferred to Batch 3)** |
| F-003 | `get_current_user` no DB/enabled check | Confirmed: returns username string, no DB lookup, no `enabled` check. | **Confirmed (deferred to Batch 3)** |
| F-004 | Unauthenticated print/visitor IDOR endpoints | Not modified this pass (boundary work = Batch 5). | **Confirmed (deferred to Batch 5)** |
| F-005 | Public data exposure (station host/IP, agent_key) | Not modified this pass (Batch 5). | **Confirmed (deferred to Batch 5)** |
| F-006 | `report.visitorTypes` crashes Reporting screen | Current `App.jsx:4513` builds `report` with `visitorTypes: reportingSummary?.visitor_types ?? []`, so `report.visitorTypes` is always an array. Crash cannot occur. | **Superseded by committed baseline (no code change needed)** |
| F-015 | Returning-check-in settings field mismatch | Confirmed: `App.jsx` read `systemSettings?.requiredReturningCheckinFields` (camelCase) while backend sends `required_returning_checkin_fields`. **Fixed this pass.** | **Confirmed → Fixed (Batch 1)** |
| F-016 | Dead duplicate `App.jsx` `handleResponse` (401-only, `no-undef`) | Confirmed: unused function at `App.jsx:357`, referenced undefined `handleUnauthorized`. Grep proved **no callers**. **Removed this pass.** | **Confirmed → Fixed (Batch 1)** |
| F-017 | Inconsistent 401/403 session handling in `api.js` | Confirmed: shared `handleResponse` (401/403 → `handleUnauthorized`) existed but ~22 authenticated functions bypassed it. **Centralized this pass.** | **Confirmed → Fixed (Batch 1)** |
| F-019 | Schema created at import; no migrations | Confirmed: `database.py` hardcodes `sqlite:///visitor_kiosk.db`; `main.py` calls `create_all` + `create_default_admin` at import. | **Confirmed (deferred to a later batch)** |
| F-030 | No automated tests | Confirmed: no test runners/config present. | **Confirmed (deferred to Batch 2)** |

### Bootstrap / STAFF credential determination (required before Batch 4)

- `STAFF_USERNAME` / `STAFF_PASSWORD` are read in `backend/app/auth.py` (lines 26–27) but are **not referenced anywhere else** in the backend (verified by search).
- The initial administrator account is created by `create_default_admin(db)` (`backend/app/main.py:58` → `backend/app/bootstrap.py`), which uses `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_ADMIN_DISPLAY_NAME` from `backend/app/config.py` (env vars `PBC_DEFAULT_ADMIN_USERNAME` / `PBC_DEFAULT_ADMIN_PASSWORD`, defaulting to `admin` / a placeholder), with `must_change_password=True`.
- **Determination:** `STAFF_USERNAME` / `STAFF_PASSWORD` are **obsolete and not consumed by the current bootstrap.** The initial-configuration behavior does **not** depend on them.
- **Action (deferred to Batch 4):** they may be removed from `auth.py` and from example env files, but only with this determination documented. Bootstrap behavior (`create_default_admin` + `PBC_DEFAULT_ADMIN_*`) must be preserved. No change made this pass.

---

## 3. Batch Plan

| Batch | Findings | Depends on | Status |
|---|---|---|---|
| 0 — Preserve state & tracker | — | — | **Complete** |
| 1 — Low-risk frontend correctness | F-006 (verify), F-015, F-016, F-017 | 0 | **Complete** (`99ac01d`) |
| 2 — Minimal regression-test foundation | F-030 (+ protects 3, 2) | 1 reviewed | **Complete (this pass)** |
| 3 — AuthN/AuthZ (DB-backed user, admin role) | F-002, F-003 | 2 | **Complete (this pass)** |
| 4 — Repository & secret hygiene | F-001, F-007, F-027, STAFF_* removal | 2 | **Complete (this pass)** |
| 5 — Kiosk/print-agent boundary hardening | F-004, F-005 | 2, mapping | Not started |
| 6 — Backend correctness/stability | F-011, F-012, F-013, F-014, F-010, F-020, F-028, F-029 | 2 | Not started |

Per instruction, **this pass performs only Batch 0 and Batch 1** and then stops for review.

---

## 4. Batch 1 — Changes Made

### Files changed
- `frontend/src/App.jsx`
- `frontend/src/api.js`

No backend files, configuration, database, dependencies, or documentation (other than this tracker) were modified.

### Exact behavioral changes

**F-015 — Returning-check-in required-fields setting now takes effect** (`App.jsx` ~339–342)
- Changed the property read from camelCase `systemSettings?.requiredReturningCheckinFields` to snake_case `systemSettings?.required_returning_checkin_fields` (matching the backend `SettingsResponse` and the `editingSettings.required_returning_checkin_fields` used elsewhere in the same file).
- The local constant name `requiredReturningCheckinFields` (consumed at the returning-visitor field list) is unchanged.
- **Effect:** an administrator's configured "required returning check-in fields" are now honored instead of silently falling back to the `REQUIRED_RETURNING_CHECKIN_FIELDS` constant. No change to the fallback path when the setting is absent.

**F-016 — Removed dead duplicate `handleResponse`** (`App.jsx` ~356–374)
- Deleted the unused local `async function handleResponse` inside `App()`. It checked only `401` (not `403`) and referenced a `handleUnauthorized` that is not defined in `App.jsx` scope (ESLint `no-undef`).
- Proven safe: a workspace search for `handleResponse(` shows no call sites in `App.jsx`; the only live implementation is the module-scoped one in `api.js`.
- **Effect:** no runtime behavior change (function was never called). Removes 1 `no-unused-vars` error and 1 `no-undef` error.

**F-017 — Centralized 401/403 session-expiry handling in `api.js`**
- Routed **authenticated JSON** API functions through the existing shared `handleResponse(response, defaultMessage)` (which, on `401`/`403`, calls `handleUnauthorized()` → clears `access_token`/`username`/`role`, stores the existing `session_expired_message`, and reloads to the default main screen; otherwise preserves the backend `detail` message).
- Functions converted to the shared handler: `updateVisitor`, `getUsers`, `getUser`, `createUser`, `updateUser`, `resetPassword`, `updateUserStatus`, `getPrintJobs`, `getPendingPrintJobs`, `deletePrintJob`, `clearCompletedPrintJobs`, `clearFailedPrintJobs`, `getPrintAgents`, `assignPrintAgent`, `deletePrintStation`, `getPrintStations`, `updatePrintStation`, `createPrintStation`, `printAgentTestLabel`, `getReportingSummary`, `saveSettings`, `reassignPrintJob`, `printStationQrLabel`, `changePassword`.
- `downloadPrintStationQr` (**binary** PNG download) was **not** routed through the JSON parser. Instead a minimal `if (status === 401 || 403) { handleUnauthorized(); throw }` guard was added *before* the existing `response.ok` check, preserving `response.blob()` handling.
- **Preserved backend messages:** the shared handler uses `errorData.detail || defaultMessage`, so functions that previously surfaced `data.detail` (e.g., `deletePrintStation`, `reassignPrintJob`, `printAgentTestLabel`, `printStationQrLabel`, `changePassword`) keep useful non-auth error text.
- **Intentionally left unchanged (not authenticated / out of scope):**
  - `login` (public; a `401` here means invalid credentials and must show that message, not log out / reload).
  - `createPrintJob` (public kiosk endpoint).
  - `getSettings` (public endpoint).
  - `disablePrintStation` (deprecated **and** targets a nonexistent route `DELETE /api/print-stations/{id}`; left untouched to avoid changing known-broken/dead code — tracked as F-025 for a later batch).
- **Effect:** an expired or rejected staff session now consistently triggers the existing clean-logout flow from any staff/admin action, instead of throwing a generic error and leaving stale data on screen. Public kiosk and print-agent behavior is unchanged.

### api.js function classification (post-Batch-1)

| Function | Audience | Shared handler | Notes |
|---|---|---|---|
| `login` | Public | No (manual) | 401 = bad credentials, must not redirect |
| `createVisitor` | Public kiosk | Yes (baseline) | Public endpoint never returns 401/403 |
| `uploadPhoto` | Public kiosk | Yes (baseline) | |
| `generateBadge` | Public kiosk | Yes (baseline) | |
| `createPrintJob` | Public kiosk | No (manual) | Left as-is |
| `checkInAgain` | Staff | Yes (baseline) | |
| `checkoutVisitor` | Public kiosk | Yes (baseline) | |
| `bulkCheckout` | Staff | Yes (baseline) | |
| `getActiveVisitors` | Staff | Yes (baseline) | |
| `findVisitors` | Public kiosk | Yes (baseline) | |
| `searchVisitors` | Staff | Yes (baseline) | |
| `getVisitor` | Staff | Yes (baseline) | |
| `getVisitorHistory` | Staff | Yes (baseline) | |
| `updateVisitor` | Staff | **Yes (this pass)** | |
| `getUsers` | Admin* | **Yes (this pass)** | |
| `getUser` | Staff (deprecated?) | **Yes (this pass)** | Functional GET, kept |
| `createUser` | Admin* | **Yes (this pass)** | |
| `updateUser` | Admin* | **Yes (this pass)** | |
| `resetPassword` | Admin* | **Yes (this pass)** | |
| `updateUserStatus` | Admin* | **Yes (this pass)** | |
| `getPrintJobs` | Staff | **Yes (this pass)** | |
| `getPendingPrintJobs` | Staff (deprecated?) | **Yes (this pass)** | Functional GET, kept |
| `deletePrintJob` | Staff | **Yes (this pass)** | |
| `clearCompletedPrintJobs` | Staff | **Yes (this pass)** | |
| `clearFailedPrintJobs` | Staff | **Yes (this pass)** | |
| `getPrintAgents` | Staff | **Yes (this pass)** | |
| `assignPrintAgent` | Staff | **Yes (this pass)** | |
| `deletePrintStation` | Admin* | **Yes (this pass)** | detail preserved |
| `disablePrintStation` | Staff (deprecated/broken) | No (manual) | Nonexistent route; left for F-025 batch |
| `getPrintStations` | Staff | **Yes (this pass)** | |
| `updatePrintStation` | Staff | **Yes (this pass)** | |
| `createPrintStation` | Admin* | **Yes (this pass)** | |
| `printAgentTestLabel` | Staff | **Yes (this pass)** | detail preserved |
| `getDashboardStats` | Staff | Yes (baseline) | |
| `getReportingSummary` | Staff | **Yes (this pass)** | |
| `getSettings` | Public | No (manual) | Left as-is |
| `saveSettings` | Admin* | **Yes (this pass)** | |
| `reassignPrintJob` | Staff | **Yes (this pass)** | detail preserved |
| `printStationQrLabel` | Staff | **Yes (this pass)** | detail preserved |
| `downloadPrintStationQr` | Staff | No (binary guard) | 401/403 guard added; blob handling preserved |
| `changePassword` | Staff | **Yes (this pass)** | detail preserved |

*Admin* = intended administrator-only; **not yet enforced server-side** (F-002, Batch 3). No print-agent-only route is called from `api.js`; print-agent endpoints are consumed by `print-agent/print_agent.py` and were **not** given staff-JWT requirements.

---

## 5. Validation Commands & Results (this pass)

| Command | Result |
|---|---|
| `git status --short` / `git branch --show-current` / `git diff` (pre-edit) | Clean tree, branch `main`, no uncommitted changes |
| `npm run lint` (`eslint .`) | **16 problems (13 errors, 3 warnings)** — down from 18 (15/3). The 2 removed are the F-016 dead `handleResponse` (`no-unused-vars`) and its `handleUnauthorized` (`no-undef`). No new problems introduced. |
| `npm run build` (`vite build`) | **PASS** — 21 modules transformed, built successfully |
| `python -m py_compile` (8 backend modules) | **PASS (exit 0)** |
| Token search: `visitorTypes` / `requiredReturningCheckinFields` / `required_returning_checkin_fields` / `handleResponse` / `handleUnauthorized` | Verified: `App.jsx` settings read now snake_case; no `handleResponse` defined in `App.jsx`; `report.visitorTypes` still backed by mapping at `App.jsx:4513`; `handleUnauthorized` defined once (module scope, `api.js`) and referenced by shared handler + binary guard |
| `git diff -- frontend/src/App.jsx` | Only the two intended hunks (F-015 property rename; F-016 dead-function removal) |
| Manual-handler audit of `api.js` | Remaining manual `!response.ok` only in: `handleResponse` itself, `login`, `createPrintJob`, `getSettings`, `disablePrintStation`, and the `downloadPrintStationQr` binary path — all intentional |

### Pre-existing lint problems still present (NOT introduced by this batch, out of scope)
`no-unused-vars`: `successMessage` (97), `successTitle` (98), `goBack` (384), `saved` (482), `handleCreateUser` (739), `isStationOnline` (1125), `queuePrintJob` (1140), `handleSubmitReturningVisitor` (1333), `validateCheckIn` (1384), `checkedInToday` (5116), `stationHealthSummary` (5126), `queueHealthSummary` (5127). `react-hooks/set-state-in-effect`: line 237. `react-hooks/exhaustive-deps` (warnings): lines 213, 303, 308. These map to audit findings F-023 (dead code) and F-032 (effects) and are deferred; the batch was not expanded merely to reach a lint-clean tree.

---

## 6. Known Remaining Issues / Deferred Work

- **F-002 / F-003 (Batch 3):** backend still authenticates without authorization; disabled users' tokens remain valid until expiry. Highest-priority security gap.
- **F-001 / F-007 / F-027 (Batch 4):** tracked secrets, DB backup, and virtualenv; example env files; `DATABASE_URL` drift; obsolete `STAFF_*` removal (determination recorded in §2).
- **F-004 / F-005 (Batch 5):** public kiosk/print-agent trust boundary and data minimization.
- **F-006 (closed):** superseded by committed baseline; no action.
- **F-025:** `disablePrintStation` broken/deprecated client function — left untouched; remove or repair in a hygiene batch after confirming no callers.
- **F-023 / F-032:** frontend dead code and effect issues — deferred.
- **F-030 (Batch 2):** no automated tests yet.

---

## 7. Decisions Requiring Owner Approval

1. **403 semantics after F-002.** ~~The shared `handleResponse` treats **both** 401 and 403 as session-expiry.~~ **Resolved in Batch 2 (this pass).** `handleResponse` now splits handling: `401` → `handleUnauthorized()` (clear auth + reload); `403` → throw a non-destructive "not permitted" error (session preserved, no reload). This is behavior-safe today (backend returns no 403 yet) and pre-positions the correct UX for Batch 3 authorization. A single unit test asserts both branches. See §10.
2. **Print-agent authentication model (Batch 5).** Must be agent-specific (`PBC_PRINT_AGENT_KEY` / `PBC_PRINT_AGENT_TOKEN`), not staff JWT. Requires an owner decision on the trust boundary before protecting register/heartbeat/pending/claim/status/badge-image.
3. **Secret rotation & history purge (Batch 4).** Rotating the JWT signing key and purging `.env`/DB from history are **manual, out-of-band** actions (not automated here). Owner must confirm scope and coordinate clones.

---

## 8. Regression Risks (Batch 1)

- **Low overall.** Changes are confined to the frontend API/session layer and one settings-property read.
- **F-017:** if any function newly routed through `handleResponse` were to receive a spurious 401/403, it would now log the user out. Mitigated because only authenticated staff/admin calls were converted and the backend currently returns 401 only for genuine auth failures. Public kiosk and print-agent flows were deliberately excluded.
- **F-015:** if a deployed `system_settings.json` lacks `required_returning_checkin_fields`, behavior is unchanged (falls back to the constant). If it *has* the key, the returning-visitor form now reflects it (the intended behavior).
- **Binary download:** `downloadPrintStationQr` retains blob handling; only an auth-failure short-circuit was added.
- **Line endings:** Git reports the working copy will normalize LF→CRLF on next touch (repo default). Diffs confirm only the intended hunks changed; no whole-file reformatting.

---

## 9. Recommended Next Batch

**Batch 2 — Minimal regression-test foundation**, using a disposable database (never the live SQLite file). Prioritize:
- Reporting response-property compatibility (guards F-006 staying fixed).
- Returning-check-in settings property (guards F-015).
- Expired/invalid token behavior (prepares F-003).
- Public kiosk and print-agent workflows that must remain available (guards Batches 4/5).
- Active-visitor and dashboard access (core staff path).

Batch 2 should be reviewed before starting Batch 3 (authorization), so the auth/authorization changes land against an existing safety net. **Stop here for review.**

---

## 10. Batch 2 — Regression-Test Foundation

### Starting state
- HEAD `99ac01d` ("Milestone 7.8.3 Batch 1 audit"), branch `main`, working tree clean before this pass.
- Goal: create the **smallest practical** automated regression-test foundation to protect existing functionality before the Batch 3 authorization work. No architectural refactor to "make testing easier."

### Operational-database & secret safety (proven, not just asserted)
- **The live SQLite database is never opened.** `backend/tests/conftest.py` creates an in-memory engine `create_engine("sqlite://", poolclass=StaticPool)` and reassigns `app.database.engine` / `app.database.SessionLocal` to it **before** `app.main` is imported. Because `main.py` runs `Base.metadata.create_all` + `create_default_admin` at import time, this repointing guarantees all schema/bootstrap happens against the throwaway in-memory DB. A dedicated test — `test_operational_database_is_not_used` — asserts `str(database.engine.url) == "sqlite://"`, so a future regression that reconnects to the file DB fails loudly.
- **No secret is read or printed.** `conftest.py` force-sets `JWT_SECRET_KEY`/`JWT_ALGORITHM`/`JWT_EXPIRE_MINUTES` to test-only values at module top. `auth.py`'s `load_dotenv(override=False)` cannot overwrite them, so the real `.env` signing key is never required or exercised.
- **Production source unchanged for isolation.** Isolation is achieved purely from the test harness (monkeypatching module attributes); no `database.py`/`main.py`/`auth.py` change was needed.
- **Known benign side effect:** importing the app appends normal startup lines to `backend/logs/*.log` and ensures `uploads/`/`config/` dirs exist. This is neither DB data nor secrets; it is unavoidable without changing production import-time behavior, which was out of scope.

### Files added
| File | Purpose |
|---|---|
| `backend/tests/conftest.py` | In-memory DB isolation, forced test JWT env, `db_session` / `seed_users` / `client` fixtures |
| `backend/tests/test_auth_and_access.py` | Login + token + access-control behavior (11 passed, 2 forward-looking `xfail`) |
| `backend/tests/test_schema_contracts.py` | Pydantic field-name contracts guarding F-006 / F-015 (2 passed) |
| `backend/pytest.ini` | `pythonpath = .`, `testpaths = tests`, quiet mode |
| `backend/requirements-dev.txt` | Test-only deps (`pytest`, `httpx`); runtime `requirements.txt` untouched |
| `frontend/src/lib/viewModel.js` | Behavior-preserving pure helpers extracted from `App.jsx` |
| `frontend/src/lib/viewModel.test.js` | Unit tests for the extracted mappings (F-006 / F-015 guards) |
| `frontend/src/api.test.js` | Unit tests for the shared 401 vs 403 handler |
| `frontend/vitest.config.js` | Vitest (jsdom) config, separate from `vite.config.js` |
| `frontend/src/test/setup.js` | In-memory `localStorage`/`sessionStorage` shim (Node 26 disables its native globals) |

### Files changed (production code)
- **`frontend/src/api.js` — 401/403 split (resolves §7 decision #1).** `handleResponse` now branches: `401` → `handleUnauthorized()` + throw "Session expired" (unchanged clear-and-reload); `403` → throw a permission error (`errorData.detail` or a default), **without** clearing auth or reloading. This changes runtime behavior for any future 403 (today the backend returns none), pre-positioning correct UX for Batch 3. No second response handler was introduced. The `downloadPrintStationQr` binary path retains its own inline `if (401||403)` guard — intentionally left as-is (documented inconsistency; it will be revisited when 403 semantics are exercised end-to-end).
- **`frontend/src/App.jsx` — behavior-preserving helper extraction.** Two inline expressions were replaced by calls into `frontend/src/lib/viewModel.js`: the Reporting `report` object literal → `mapReportingSummary(reportingSummary)`, and the returning-check-in fields ternary → `resolveRequiredReturningCheckinFields(systemSettings, REQUIRED_RETURNING_CHECKIN_FIELDS)`. The extracted functions reproduce the original logic exactly; this makes those mappings unit-testable **without** mounting the ~6,600-line `App.jsx`. No behavior change.
- **`frontend/package.json`** — added `"test": "vitest run"` and devDependencies `vitest ^3.2.4`, `jsdom ^25.0.1`. No runtime dependency added.

### Tests added (what they protect)
- **Backend `test_auth_and_access.py`:** login success returns bearer token + `role`; wrong password → 401; disabled user → 403 (enabled-check precedes password-check); protected `/api/dashboard` and `/api/visitors/active` require a valid token (401 without, 200 with); expired and malformed tokens → 401; **public** `POST /api/visitors` reachable without auth (kiosk must keep working); print-agent `GET /api/print-jobs/pending` and badge-image endpoints reachable without staff JWT (404 for a missing job = reachable, not 401). Plus `test_operational_database_is_not_used`.
- **Two `xfail(strict=True)` tests** honestly document **not-yet-enforced** authorization (F-002/F-003): a disabled user's token is still accepted on a protected endpoint, and a non-admin can currently reach `/api/users`. When Batch 3 enforces authorization these flip to passing and the `strict` xfail turns them green — a built-in signal that Batch 3 landed. **They intentionally do not make the suite misleadingly green.**
- **Backend `test_schema_contracts.py`:** asserts `ReportingSummaryResponse` exposes `visitor_types` (not `visitorTypes`) and `SettingsResponse` exposes `required_returning_checkin_fields` (not camelCase) — locking the backend side of the F-006/F-015 contracts.
- **Frontend `viewModel.test.js`:** `mapReportingSummary` maps `visitor_types` → `visitorTypes`, defaults every section to `[]` on null, and ignores a stray camelCase `visitorTypes`; `resolveRequiredReturningCheckinFields` honors snake_case, falls back when absent/null, and ignores camelCase.
- **Frontend `api.test.js`:** exercises the shared handler through the real exported `getUsers()` — `401` clears the session + sets the existing `session_expired_message` + reloads once; `403` preserves the session, surfaces the backend `detail`, and does **not** reload; `500` surfaces `detail` without touching the session.

### Validation commands & results
| Command | Result |
|---|---|
| `python -m pytest -v` (from `backend/`, `.venv`) | **13 passed, 2 xfailed**, 4 pre-existing warnings (1 Starlette/httpx deprecation, 3 Pydantic v2 deprecations). No tracebacks. |
| `npm install` (frontend) | Succeeded; **no** ERESOLVE peer conflict (Vitest 3 accepted Vite 8; `--legacy-peer-deps` not needed). |
| `npm run test` (`vitest run`) | **9 passed (2 files)**, 0 failed. |
| `npm run build` (`vite build`) | **PASS** — vite v8.1.2, 22 modules transformed. |
| `npm run lint` (`eslint .`) | **16 problems (13 errors, 3 warnings)** — identical to the Batch 1 baseline. New source/test files introduced **zero** new lint problems. |

The pre-existing 16 lint problems (§5) are unchanged and remain out of scope — the batch was **not** expanded to reach a lint-clean tree.

### Environment note
- Node 26 ships a native `localStorage`/`sessionStorage` global that is disabled (undefined) without `--localstorage-file`, shadowing jsdom's implementation. `frontend/src/test/setup.js` installs a minimal in-memory `Storage` via `Object.defineProperty`, shared by the app code and the tests. This is a test-harness shim only; no production storage code changed.

### Batch 3 entry criteria (met)
- A green backend + frontend safety net exists and proves the operational DB is untouched.
- Public kiosk and print-agent reachability are pinned by tests, so authorization changes in Batch 3 cannot silently break them.
- The 401/403 UX split is already in place, so Batch 3 can return 403 for "authenticated but not permitted" without logging users out.
- The two `xfail` tests define the exact authorization behavior Batch 3 must deliver.

**Stop here for review. Batch 3 (authorization) not started. No commit made automatically.**

---

## 11. Batch 3 — DB-Backed Authentication (F-003) + Administrator Authorization (F-002)

### Starting state
- Git HEAD `42e43b8` ("Milestone 7.8.4 Batch 2: isolated regression tests and 401/403 handling"), branch `main`, clean working tree.
- Scope: implement **only** F-003 (database-backed current-user validation) and F-002 (server-side Administrator authorization), plus tests and tracker updates. No M8, no repo/secret hygiene, no kiosk/print-agent auth changes, no schema/migration changes.

### Validated facts (proven from code, not assumed)
- **Role strings:** Administrator = `"Administrator"` (`bootstrap.py` seeds `role="Administrator"`; login response echoes it). Non-admin = `"Staff"` (seeded `disableduser`).
- **`get_current_user` is consumed as a username string** by ~30 routes (`audit(current_user, …)`, `current_user.lower()`, `user.modified_by = current_user`). Therefore the DB-backed version **still returns the username string** to avoid breaking every call site.
- **`/api/me` (main.py:678)** and **`/api/change-password` (main.py:637)** use `get_current_user` only → ordinary staff retain access (unchanged).

### Files changed
| File | Change |
|---|---|
| `backend/app/auth.py` | Added SQLAlchemy/`get_db`/`User` imports. Added private helpers `_decode_username` (JWT → `sub`, 401 on failure) and `_load_enabled_user` (loads user; missing **or** disabled → 401). Rewrote `get_current_user` to be DB-backed, still returning the canonical username **string**. Added `require_admin` dependency returning the `User` after enforcing `role == "Administrator"` (403 otherwise). `create_access_token`, expiration, login-response fields, and password verification are **unchanged**. |
| `backend/app/main.py` | Imported `require_admin`; added `_admin: User = Depends(require_admin)` to the 10 administrator-only routes (existing `current_user`/`db` params left intact so audit/`modified_by` behavior is unchanged). |
| `backend/tests/conftest.py` | Added an **enabled** Staff user (`teststaff`) to `seed_users` (new key `staff_username`) so 403 (enabled non-admin) can be distinguished from 401 (missing/disabled). |
| `backend/tests/test_auth_and_access.py` | Converted the two `xfail(strict=True)` placeholders into real passing tests and added authorization/authentication coverage (see below). |
| `docs/reviews/pre-milestone-8-remediation-plan.md` | This section; Batch 3 marked Complete in §3. |

### Authentication behavior changed (F-003)
`get_current_user` now: decodes the JWT (invalid/expired/missing `sub` → **401**), then loads the user from the **current** database. If the user no longer exists **or** is disabled → **401** (client runs its existing session-expiry/logout flow). Otherwise returns the stored username string. This closes the gap where a token stayed valid after the account was deleted/disabled.

### Authorization enforced (F-002) — administrator-only routes
`require_admin` re-reads the role from the DB per request (never from the token). Enforced on:
`GET /api/users`, `GET /api/users/{id}`, `POST /api/users`, `PUT /api/users/{id}`, `POST /api/users/{id}/reset-password`, `PUT /api/users/{id}/status`, `PUT /api/settings`, `POST /api/print-stations`, `PUT /api/print-stations/{id}`, `DELETE /api/print-stations/{id}/permanent`.
Enabled non-administrators receive **403** (and stay authenticated); missing/disabled/invalid → **401**.

### Route-access decision — CONFLICT recorded (not enforced)
- **`GET /api/reporting/summary` — NOT made admin-only.** The frontend Reporting button (`App.jsx` ~5309) sits **outside** the `role === "Administrator"` block and the reporting screen has no role guard, so **Staff have reporting access today**. Enforcing admin-only would break the staff reporting workflow. Per instructions, the conflict is recorded here and the route remains authenticated-staff-accessible.

### Tests converted from xfail → passing
- `test_disabled_user_token_is_rejected_on_protected_endpoint` — disabled user's valid token → `GET /api/dashboard` → **401**.
- `test_non_admin_cannot_reach_admin_only_users_endpoint` — now uses the real **enabled** Staff user (`teststaff`) → `GET /api/users` → **403** (previously used a non-existent username, which now correctly returns 401).

### Tests added (Batch 3)
- Unknown/deleted-user token → 401.
- Enabled Staff can use `/api/dashboard` and `/api/me` (staff routes retained).
- Administrator can reach admin routes (positive path).
- **Current DB role is authoritative:** demoting an admin to Staff in the DB makes the same token receive 403.
- A 403 does **not** deauthenticate: staff still reaches `/api/dashboard` afterward.
- Parametrized: Staff forbidden (403) from all user-management + settings routes.
- The bootstrapped **default admin** can log in and list users.

### Validation commands & results (this pass)
| Command | Result |
|---|---|
| `python -m pytest` (backend) | **28 passed, 0 xfailed** (2 former xfails now pass) |
| `python -m py_compile` (all 8 backend modules) | exit 0 |
| `npm run test` (frontend) | **9 passed (2 files)** — unchanged |
| `npm run build` (frontend) | success (vite 8.1.2) — unchanged |
| `npm run lint` (frontend) | **16 problems (13 errors, 3 warnings)** — baseline, none introduced |
| `git diff --check` | clean |

### Preserved workflows (verified)
- **Public kiosk** check-in (`POST /api/visitors` without auth) still 200 (test 9).
- **Print-agent** endpoints reachable under the current trust model (test 10); **no** print-agent route gained a staff-JWT requirement.
- **Operational `visitor_kiosk.db` untouched** — the suite runs entirely on the in-memory StaticPool engine (`test_operational_database_is_not_used` asserts `sqlite://`).

### Known remaining issues / deferred
- Reporting authorization conflict recorded above (Staff-accessible by design of the current frontend).
- `require_admin` performs one extra lightweight DB lookup per admin request in addition to `get_current_user` (call sites kept intact for safety); acceptable at this app's scale, can be consolidated later if desired.
- Batches 4 (repo/secret hygiene), 5 (kiosk/print-agent boundary), 6 (backend correctness) remain unstarted.

**Stop here for review. No commit made automatically.**
Suggested commit message: `Milestone 7.8.5 Batch 3: DB-backed auth + admin authorization`

---

## 12. Batch 4 — Repository & Secret Hygiene (F-001, F-007, F-027, STAFF_* removal)

### Starting state
- Git HEAD `1ab5445` (merge commit), branch `main`, clean working tree. Batch 3 committed as `52af0fd`.
- Scope: **forward-looking** repository hygiene only — stop tracking sensitive/generated files (without deleting local copies), sanitize real-looking credentials in tracked example/doc files, remove obsolete `STAFF_*` loading, and document env setup. **No** history rewrite, **no** secret rotation, **no** deletion of local `.env`/operational DB/venv, **no** auto-commit.

### Phase A — Inventory findings (proven, not assumed)
**Tracked files matching sensitive/generated patterns (from `git ls-files`):**
- `.env` files tracked: **5** — `.env` (root, real secret), `.env.example`, `frontend/.env.example`, `print-agent/.env` (real secret), `print-agent/.env.example`.
- `*.db.*` variant tracked: **1** — `backend/visitor_kiosk.db.old` (backup; may contain visitor data).
- `backend/.venv/` tracked: **3128** files.
- `__pycache__`/`.pyc` tracked: **1346** (mostly in venv; **10** non-venv `.pyc` in app/tests).
- logs, `backend/uploads/` (badges/photos/qr-codes), `frontend/dist/`, `.pytest_cache`, `node_modules`: **0 tracked** (visitor data was **not** tracked — good).
- Operational `backend/visitor_kiosk.db`: **not tracked** (good).

**Environment-variable consumption (proven via `Select-String getenv|environ` in `backend/app`):**
- `auth.py`: `STAFF_USERNAME`/`STAFF_PASSWORD` (**obsolete — no consumer anywhere**, dead vars), `JWT_SECRET_KEY` (required), `JWT_ALGORITHM` (default `HS256`), `JWT_EXPIRE_MINUTES` (default `480`).
- `config.py`: `PBC_DEFAULT_ADMIN_USERNAME` (default `admin`), `PBC_DEFAULT_ADMIN_PASSWORD` (default placeholder), `PBC_DEFAULT_ADMIN_DISPLAY_NAME` (default `Administrator`).
- `DATABASE_URL`: **ignored** — `database.py` hardcodes `sqlite:///visitor_kiosk.db` (never read from env).
- `PRINT_AGENT_URL`: **ignored** — no backend consumer.
- `git-filter-repo==2.47.0` in `backend/requirements.txt`: **not imported** by any source — safe to drop from requirements (not uninstalled from the workstation).

**Real-looking secrets in tracked files (sanitized this pass; values never reproduced here):** root `.env.example` and `docs/CHEATSHEET.md` both carried the same real-looking `STAFF_PASSWORD` and `JWT_SECRET_KEY`.

### Backups created & SHA256-verified OUTSIDE the repo (before untracking)
Location: `c:\Users\stemy\OneDrive\PBC First Week\PBC General Business\PBC Guest Kiosk\_pbc-batch4-backup-20260730-105339\`
- `root.env` (241 bytes), `print-agent.env` (284 bytes), `visitor_kiosk.db.old` (65536 bytes) — all SHA256 hashes matched the sources.

### Files removed from tracking (`git rm --cached` — local copies preserved)
- `backend/.venv/` (recursive), root `.env`, `print-agent/.env`, `backend/visitor_kiosk.db.old`, and the 10 remaining non-venv `__pycache__`/`.pyc` files.
- **Total staged deletions: 3141.** Local working files were **not** deleted (verified present after untracking).

### Files changed (sanitized / corrected / documented)
| File | Change |
|---|---|
| `.gitignore` | Removed dead `!backend/uploads/badges/28.png` negation. Added organized sections: env (`.env`, `**/.env`, with `!.env.example`/`!**/.env.example` re-included), `**/.venv/`, python bytecode + caches (`__pycache__/`, `*.pyc`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `.coverage`, `htmlcov/`, `coverage.xml`), DB variants (`*.db`, `*.db-journal`, `*.db.old`, `*.db.bak`, `*.sqlite`, `*.sqlite3`, `*.db3`), uploads/logs/downloaded-badges. |
| `.env.example` (root) | Replaced real-looking secret block with placeholders for the **consumed** vars only (JWT_* + PBC_DEFAULT_ADMIN_*), with comments (copy-from-example, git-ignored, JWT rotation invalidates sessions). |
| `frontend/.env.example` | Added header comment; genericized the sample host (`http://your-backend-host:8000`). |
| `print-agent/.env.example` | Added header + per-variable comments; genericized the sample host. Variable names unchanged. |
| `docs/CHEATSHEET.md` | Sanitized backend `.env` block (removed real secrets, `DATABASE_URL`, `PRINT_AGENT_URL`, and `STAFF_*`); now mirrors the corrected variable set. |
| `docs/INSTALL.md` | Corrected backend `.env` example to actual required vars; added create-from-example steps, required/optional distinction, bootstrap-admin behavior, don't-commit note, and JWT-rotation-invalidates-sessions note. |
| `README.md` | Corrected backend `.env` example; clarified `.env` is created locally and never committed; fixed the print-agent variable-name table (`PBC_PRINT_AGENT_POLL_SECONDS`, `PBC_PRINT_DOWNLOAD_DIR`, `PBC_PRINT_AGENT_TOKEN`, plus `PBC_PRINT_TIMEOUT_SECONDS`). |
| `backend/app/auth.py` | Removed obsolete `STAFF_USERNAME`/`STAFF_PASSWORD` `os.getenv` lines (dead vars, no consumer — behavior-neutral). |
| `backend/requirements.txt` | Removed `git-filter-repo==2.47.0` (not imported at runtime). UTF-16 LE encoding preserved (verified BOM `FF FE`, 32 → 31 lines). |
| `docs/reviews/pre-milestone-8-remediation-plan.md` | This §12; Batch 4 marked Complete in §3. |

### Local files confirmed preserved (verified after untracking)
`.env`, `print-agent/.env`, `backend/visitor_kiosk.db.old`, `backend/.venv/Scripts/python.exe`, and the operational `backend/visitor_kiosk.db` — all `Test-Path` → **True**. Database contents were not modified.

### Ignore-rule verification
- Example files (`.env.example`, `frontend/.env.example`, `print-agent/.env.example`) are **not** ignored (stay tracked) — correct.
- `.env`, `print-agent/.env`, `visitor_kiosk.db`, `visitor_kiosk.db.old` **are** ignored — correct.
- No prohibited files remain tracked: env (non-example) **0**, venv **0**, pyc/pycache **0**, `*.db*` **0**.

### Validation commands & results (this pass)
| Command | Result |
|---|---|
| `python -m pytest` (backend) | **28 passed** — unchanged |
| `python -m py_compile` (all 8 backend modules) | exit 0 |
| `npm run test` (frontend) | **9 passed (2 files)** — unchanged |
| `npm run build` (frontend) | success (vite 8.1.2) — unchanged |
| `npm run lint` (frontend) | **16 problems (13 errors, 3 warnings)** — baseline, none introduced |
| `git diff --check` | clean |
| secret leak check | real secret values appear **only** as removal (`-`) lines; **0** additions |

### NOT EXECUTED — manual, owner-approved follow-ups (out of band)
These are **required** but were **deliberately not run** (destructive / security-sensitive; require owner coordination and fresh clones). Commands shown for reference only.

1. **Rotate the exposed secrets** (the real values were committed historically and remain in history until purged):
   - Generate a new `JWT_SECRET_KEY` and update the local `.env` (rotating it logs out all current sessions — expected).
   - Reset the initial admin password if it matched the exposed example.
   - Rotate any `print-agent/.env` token/credential that was committed.
2. **Purge secrets/DB backup from Git history** (rewrites history — coordinate all clones first). Example, **NOT EXECUTED**:
   ```
   git filter-repo --invert-paths \
     --path .env \
     --path print-agent/.env \
     --path backend/visitor_kiosk.db.old
   ```
   (Alternatively `git filter-repo --path-glob 'backend/.venv/**' --invert-paths` to shrink history of the tracked virtualenv.) After rewrite: force-push, and every collaborator must re-clone. **Do not run without owner approval.**

### Regression risks / rollback
- Changes are docs + example sanitization + untracking + one behavior-neutral dead-var removal + a build-only requirements line removal. Runtime auth/authz/kiosk/print-agent behavior is unchanged (28 backend tests + 9 frontend tests still pass).
- Rollback: `git restore --staged <paths>` re-adds tracking; the tracker/edits can be reverted with `git checkout -- <file>` since nothing is committed. Local sensitive files remain on disk regardless.

### Recommended next batch
- **Batch 5 — Kiosk/print-agent boundary hardening (F-004, F-005).** Requires the trust-boundary mapping before any auth change to public kiosk / print-agent endpoints.

**Stop here for review. No commit made automatically. History rewrite and secret rotation remain owner-approved manual steps (NOT EXECUTED).**
Suggested commit message: `Milestone 7.8.6 Batch 4: repository & secret hygiene (untrack secrets/venv/bytecode, sanitize examples)`

---

## 13. Post-Batch-4 — Visitor Search Result-Count Consistency

### Starting state
- Batch 4 committed (`197064d`, then `373fb4f` on `origin/main`). Working tree clean at pass start.
- Scope: **UX feedback consistency only** on the Visitor Search screen. No backend API, search behavior, filters, or sorting changed. No new visual components.

### Problem
The search-result count (`styles.instructions` paragraph) rendered **only when `searchResults.length > 0`**. A search that returned **zero** matches produced no feedback, leaving the operator unsure whether the search ran. Wording also used the ambiguous `visitor(s)`.

### Change made
Introduced a `hasSearched` flag (`useState(false)`) that flips to `true` when `handleVisitorSearch()` completes successfully. The count paragraph now renders whenever `hasSearched` is true, reusing the **existing** `styles.instructions` placement/styling, with correct grammar:
- not executed → **no message** (initial mount);
- 0 results → **"0 visitors found"**;
- 1 result → **"1 visitor found"**;
- N results → **"N visitors found"** (`visitor${count === 1 ? "" : "s"} found`).

### Files changed
| File | Change |
|---|---|
| `frontend/src/App.jsx` | Added `hasSearched` state (near line 96); set `setHasSearched(true)` in `handleVisitorSearch` after `setSearchResults`; replaced the `searchResults.length > 0` render guard with `hasSearched` and singular/plural count text (search-results block ~line 6357). **+4 / −2 lines.** |
| `docs/reviews/pre-milestone-8-remediation-plan.md` | This §13. |

### Behavior demonstration (logic walkthrough — matches the four required states)
| State | `hasSearched` | `searchResults.length` | Rendered message |
|---|---|---|---|
| Screen opened, no search yet | `false` | 0 | *(none)* |
| Search returns nothing | `true` | 0 | `0 visitors found` |
| Search returns one | `true` | 1 | `1 visitor found` |
| Search returns many | `true` | N | `N visitors found` |

Backend APIs, `searchVisitors()`, filters, and sort order are untouched — only the presence and wording of the client-side count changed.

### Validation (this pass)
| Command | Result |
|---|---|
| `python -m pytest` (backend) | **28 passed** — unchanged |
| `python -m py_compile` (all 8 backend modules) | exit 0 |
| `npm run test` (frontend) | **9 passed (2 files)** — unchanged |
| `npm run build` (frontend) | success (vite 8.1.2) — unchanged |
| `npm run lint` (frontend) | **16 problems (13 errors, 3 warnings)** — baseline, none introduced (`hasSearched` is used) |
| `git status --short` | only `M frontend/src/App.jsx` |
| `git diff --stat` | `frontend/src/App.jsx | 6 ++++--` (4 insertions, 2 deletions) |

**No authentication, authorization, kiosk, or print-agent behavior changed** (frontend-only, presentational).

---

## 14. Repository Classification Review (REPORT ONLY — no tracking changes made)

**Method:** inspected `.gitignore`, the tracked file list (`git ls-files`, 72 non-venv entries; the `.venv/` was untracked in Batch 4), and representative file contents. **No files were moved, deleted, or untracked in this pass.** Categories are classified **TRACK**, **DO NOT TRACK**, or **OWNER DECISION REQUIRED**.

### 14.1 Category classification
| Category | Path(s) | Classification | Rationale |
|---|---|---|---|
| Application source (backend) | `backend/app/**` | **TRACK** | Core product code. |
| Application source (frontend) | `frontend/src/**`, `frontend/index.html`, config (`vite`, `eslint`, `vitest`, `package.json`, `package-lock.json`) | **TRACK** | Core product code + reproducible builds. |
| Print agent source | `print-agent/print_agent.py`, `requirements.txt` | **TRACK** | Core product code. |
| Dependency manifests | `backend/requirements.txt`, `requirements-dev.txt` | **TRACK** | Reproducible environments. |
| Automated tests | `backend/tests/**` | **TRACK** | Regression foundation (Batch 2/3). |
| Example env files | `.env.example`, `frontend/.env.example`, `print-agent/.env.example` | **TRACK** | Sanitized templates (Batch 4); no secrets. |
| Project docs | `README.md`, `LICENSE`, `docs/INSTALL.md`, `docs/PRINT-SERVER.md`, `docs/TROUBLESHOOTING.md`, `docs/KNOWN_GOOD_BUILD.md` | **TRACK** | Standard operational/setup documentation. |
| `.gitignore` | `.gitignore` | **TRACK** | Repo hygiene policy. |
| Real environment files | `.env`, `print-agent/.env` | **DO NOT TRACK** | Secrets. Untracked in Batch 4; ignored going forward. |
| Virtualenv | `backend/.venv/**` | **DO NOT TRACK** | Regenerable; untracked in Batch 4. |
| Python bytecode / caches | `__pycache__/`, `*.pyc`, `.pytest_cache/`, coverage | **DO NOT TRACK** | Generated; untracked in Batch 4. |
| SQLite databases + backups | `backend/visitor_kiosk.db`, `*.db.old`/`*.db.bak` | **DO NOT TRACK** | Contains visitor PII; ignored. |
| Uploaded visitor data | `backend/uploads/{photos,badges,qr-codes}/**` | **DO NOT TRACK** | Visitor PII; already ignored, never tracked. |
| Generated badges (print agent) | `print-agent/downloaded-badges/**`, `downloaded-badges/**` | **DO NOT TRACK** | Regenerated at print time; ignored. |
| Logs | `backend/logs/**`, `*.log` | **DO NOT TRACK** | Runtime output; may contain PII; ignored. |
| Build output | `frontend/dist/**` | **DO NOT TRACK** | Generated by `npm run build`; ignored. |
| Node modules | `frontend/node_modules/**` | **DO NOT TRACK** | Regenerable; ignored. |
| IDE / OS files | `.vscode/*` (except extensions.json), `.idea`, `.DS_Store` | **DO NOT TRACK** | Personal/machine-specific; ignored. |
| Generated repo snapshot | `repo_files.txt` | **OWNER DECISION REQUIRED** | A stale `tree` dump that still lists `.env`, `.venv`, `visitor_kiosk.db`. Not sensitive itself, but a regenerated artifact that drifts. Recommend untracking or regenerating on demand. |
| Seeded runtime config | `backend/config/system_settings.json` | **OWNER DECISION REQUIRED** | Non-secret but **site-specific and runtime-mutable** (settings API overwrites it → noisy diffs, and it hardcodes the site domain `kiosk.palmettobiblecamp.com`). Options: (a) track as a default template and ignore the live copy, or (b) keep tracking and accept churn. |
| Requirements doc | `visitor-kiosk-requirements-v0.1.md` | **OWNER DECISION REQUIRED** | Planning/requirements artifact — see §14.2. |
| Internal review docs | `docs/reviews/**` (audit + this plan) | **OWNER DECISION REQUIRED** | Security findings + remediation detail — see §14.2. |
| Admin/cheat docs | `docs/ADMINISTRATION.md`, `docs/CHEATSHEET.md` | **OWNER DECISION REQUIRED** | Operational guides; sanitized in Batch 4 but describe internal procedures — see §14.2. |

### 14.2 Special review — planning / standards / runbooks (public vs private vs local-only)
The repository is currently **`stemy-msft/PBC-Guest-Kiosk`**. Classify each document by exposure appetite. **No files were moved.**

| Document | Contains | Public-repo candidate | Private-repo candidate | Local-only operational |
|---|---|---|---|---|
| `README.md`, `docs/INSTALL.md`, `docs/PRINT-SERVER.md`, `docs/TROUBLESHOOTING.md`, `docs/KNOWN_GOOD_BUILD.md` | Setup/build/troubleshooting | ✅ Yes | ok | — |
| `visitor-kiosk-requirements-v0.1.md` | Product/requirements + role model | ⚠️ Acceptable if generic | ✅ Preferred | — |
| `docs/ADMINISTRATION.md` | Admin procedures, account handling | ❌ | ✅ Preferred | possible |
| `docs/CHEATSHEET.md` | Env-var quick reference (now sanitized) | ❌ | ✅ Preferred | ✅ Reasonable |
| `docs/reviews/pre-milestone-8-repository-audit.md` | **Security findings, attack surface, IDOR/authz gaps** | ❌ **No** | ✅ **Yes (restricted)** | ✅ Reasonable |
| `docs/reviews/pre-milestone-8-remediation-plan.md` | Batch history, deferred security work | ❌ **No** | ✅ **Yes (restricted)** | ✅ Reasonable |

**Key recommendation:** the two `docs/reviews/*` files enumerate unfixed security weaknesses (e.g., public IDOR endpoints, CORS `*`, upload hardening gaps). If this repository is or becomes **public**, these should be moved to a **private** repo or internal tracker before publication. This is an **owner decision** and no change was made here.

### 14.3 Future cleanup recommendations (owner-approved, none executed)
1. **Decide repo visibility** and, if public, relocate `docs/reviews/**` (and likely `ADMINISTRATION.md`) to a private location.
2. **`repo_files.txt`** — untrack (regenerate on demand) to avoid a stale artifact that references sensitive paths. (Would be a future `git rm --cached repo_files.txt` — **not run**.)
3. **`backend/config/system_settings.json`** — pick a strategy (template-vs-live) to stop runtime churn from appearing as commits.
4. **History still contains the previously committed secrets and DB backup** (see §12) — rotation + history purge remain **owner-approved, NOT EXECUTED**.

### 14.4 Files requiring owner decision (summary)
- `repo_files.txt` (untrack recommended)
- `backend/config/system_settings.json` (template vs live tracking)
- `visitor-kiosk-requirements-v0.1.md` (public vs private)
- `docs/reviews/pre-milestone-8-repository-audit.md` (private/restricted if repo public)
- `docs/reviews/pre-milestone-8-remediation-plan.md` (private/restricted if repo public)
- `docs/ADMINISTRATION.md`, `docs/CHEATSHEET.md` (private preferred)

**Stop here for review. Phase B is report-only — no `.gitignore` edits, no untracking, no history changes were made.**
Suggested commit message (Phase A only): `Milestone 7.8.6b: visitor-search result-count consistency (0/1/N feedback)`

---

## 15. Owner Decisions — Repository Classification Execution (Milestone 7.8.7)

The owner reviewed §14 and issued explicit decisions. This section records what was
executed. **All actions are non-destructive: files were untracked with `git rm --cached`
(local working copies preserved); no history was rewritten; no secrets were rotated;
nothing was committed automatically.**

### 15.1 DECISION 1 — `repo_files.txt` → Remove from source control
- **Rationale (owner):** generated artifact, high drift, duplicates Git-derived info, no build/deploy/ops/test/dev value.
- **Executed:**
  - `git rm --cached repo_files.txt` — untracked; local copy preserved on disk.
  - Added `repo_files.txt` to `.gitignore` (Generated repository inventory snapshot section).
- **Verification:** `git check-ignore -v repo_files.txt` → `.gitignore:68`. `git status --short` → `D repo_files.txt` (staged deletion from index only).

### 15.2 DECISION 2 — `backend/config/system_settings.json` → Template + ignored live file
- **Model (owner):** track a template; ignore the live, site-specific, runtime-mutable file.
- **Loading behavior confirmed:** `backend/app/main.py` `load_system_settings()` (line ~459) raises HTTP 404 when the file is missing — the app does **not** auto-seed it. Therefore fresh installs **must** copy the template before first use; this is now documented.
- **Executed:**
  - Created tracked `backend/config/system_settings.template.json` — same structure and starter data; site-specific `base_checkin_url` genericized to the placeholder `http://your-kiosk-host.example.com` (was `http://kiosk.palmettobiblecamp.com`). Removed the ad-hoc `Land Shark` sample entries from the template's lists (kept in the live local file).
  - `git rm --cached backend/config/system_settings.json` — untracked; local file preserved (the running app depends on it).
  - Added `backend/config/system_settings.json` to `.gitignore` (literal path, so the template is **not** matched/ignored).
  - Documented the copy-template install step in `docs/INSTALL.md` (new "System Settings File" section).
- **Verification:**
  - `git check-ignore -v backend/config/system_settings.json` → `.gitignore:65` (ignored).
  - `git check-ignore -v backend/config/system_settings.template.json` → **no output** (tracked, not ignored).
  - Local `system_settings.json` still present on disk (`Test-Path` → True).

### 15.3 DECISION 3 — Repository is public → Migration PLAN for sensitive docs (report only)
The repo is public. Security-sensitive planning/audit docs (which enumerate IDOR
endpoints, CORS `*`, and authz gaps) should not live in a public repo. Owner note:
`ADMINISTRATION.md` and `CHEATSHEET.md` are **intended** to be public and must remain
secret-free (sample/starter data acceptable). Both were re-reviewed this pass and
contain **no secrets** (CHEATSHEET's accidental duplicate `.env` header — an artifact of
Batch 4 — was removed; no secret values were exposed).

**Documents recommended to move to a private/internal location (PLAN — not executed):**
| Document | Reason | Public-safe? |
|---|---|---|
| `docs/reviews/pre-milestone-8-repository-audit.md` | Enumerates concrete vulnerabilities & endpoints | No — move to private |
| `docs/reviews/pre-milestone-8-remediation-plan.md` (this file) | Batch tracker referencing the audit findings | No — move to private |

**Documents kept public (owner intent; verified secret-free):**
`docs/ADMINISTRATION.md`, `docs/CHEATSHEET.md`, `docs/INSTALL.md`, `docs/KNOWN_GOOD_BUILD.md`,
`docs/PRINT-SERVER.md`, `docs/TROUBLESHOOTING.md`, `README.md`, `visitor-kiosk-requirements-v0.1.md`.

**Migration plan (to be executed later, with owner approval — NOT executed now):**
1. **Create the private destination** — a private repo (e.g., `PBC-Guest-Kiosk-internal`) or a private `security/` submodule/wiki. No destination exists yet, so no move was performed.
2. **Move the files** — copy `docs/reviews/*` into the private location, preserving history where possible (`git log --follow` / `git format-patch`, or a fresh commit if history fidelity is not required).
3. **Untrack from the public HEAD** — `git rm docs/reviews/pre-milestone-8-repository-audit.md docs/reviews/pre-milestone-8-remediation-plan.md` in the public repo, then commit. This stops **future** exposure of new edits.
4. **History caveat (unavoidable without a rewrite):** these files are already in public history and remain retrievable from prior commits until a history purge is performed. A `git filter-repo --path docs/reviews/... --invert-paths` rewrite + force-push + re-clone by all collaborators would be required to fully remove them. **This remains an owner-approved, NOT-EXECUTED manual step** (same class as the secret-rotation / secret-history-purge items in §12).
5. **Treat the enumerated vulnerabilities as already disclosed** — because the audit has been public, prioritize the remediation batches (F-004/F-005 kiosk & print-agent boundary, IDOR, CORS) rather than relying on obscurity.

### 15.4 Incidental cleanup this pass
- `docs/CHEATSHEET.md` — removed a duplicated `# .\.env` / `## This controls backend environment` header block (Batch 4 artifact). No secrets involved; cosmetic.

### 15.5 Validation (this pass)
| Command | Result |
|---|---|
| `python -m pytest` (backend) | **28 passed** — unchanged |
| `python -m py_compile` (all 8 backend modules) | exit 0 |
| `npm run test` (frontend) | **9 passed (2 files)** — unchanged |
| `npm run build` (frontend) | success — unchanged |
| `npm run lint` (frontend) | **16 problems (13/3)** — baseline, none introduced |
| `git check-ignore` (live settings + repo_files) | both ignored; template NOT ignored |
| local file preservation | `system_settings.json`, `repo_files.txt` still on disk |

### 15.6 NOT EXECUTED (unchanged reminders)
- Secret rotation (JWT key, admin password, print-agent token) — still required (§12).
- Git history purge of secrets/DB backup — still required (§12).
- Move of `docs/reviews/*` to a private location and its optional history purge (§15.3) — planned, **not executed**.

**Stop here for review. No commit made automatically.**
Suggested commit message (Decisions 1 & 2): `Milestone 7.8.7: apply repo classification decisions (untrack repo_files.txt, templatize system_settings.json)`
Note: the Phase A visitor-search change from §13 remains a separate uncommitted edit (`Milestone 7.8.6b: visitor-search result-count consistency`).

---

## 16. Batch 5A — Kiosk & Print-Agent Trust-Boundary Validation (PLANNING ONLY)

**Scope discipline:** This section is a **validation and planning pass only**. No application
code, authentication, frontend behavior, database, or schema was changed. No endpoint was
secured. No secrets were rotated. No Git history was rewritten. No commit was made
automatically. The explicit worst-case this pass exists to prevent is *adding authentication
first and discovering afterward that deployed kiosks or Raspberry Pi print agents can no
longer operate*. **Functionality and stability are paramount.**

### 16.1 Starting Git state & validation baseline
- **HEAD:** `8aa3d19` — *"Milestone 7.8.7a Fail fast on missing JWT_SECRET_KEY at startup and auto-seed-from-template if system_settings.json is missing on startup"*. Branch `main`, pushed to `origin/main`.
- **Working tree:** clean (no uncommitted remediation work) at the start of this pass.
- **Validation (unchanged baseline — must remain green):**

| Command | Result |
|---|---|
| `python -m pytest` (backend, from `backend/`) | **28 passed** |
| `python -m py_compile` (main, auth, bootstrap, config, database, dependencies, models, schemas) | exit 0 |
| `npm run test` (frontend) | **9 passed (2 files)** |
| `npm run build` (frontend) | success (vite 8.1.2) |
| `npm run lint` (frontend) | **16 problems (13 errors, 3 warnings)** — pre-existing baseline, none introduced |

### 16.2 Tracker drift reconciliation
Statements below were re-verified against HEAD `8aa3d19` and are now current:

| Tracker claim | Status at `8aa3d19` |
|---|---|
| `system_settings.json` auto-seeded from `system_settings.template.json` | **TRUE now.** `main.py` (settings region ~127–153) copies the template at startup when the live file is missing and audit-logs it. **This supersedes §15.2's earlier statement that the app does _not_ auto-seed** (that was accurate at the time §15.2 was written; it is now stale — see correction note below). |
| Startup produces a clear error when `JWT_SECRET_KEY` is missing | **TRUE.** `auth.py` raises `RuntimeError` at import if unset. |
| `repo_files.txt` and live `system_settings.json` remain untracked & git-ignored | **TRUE.** Both ignored; local copies preserved. |
| Visitor-search 0/1/N result-count change committed | **TRUE** (`8430df0`, Milestone 7.8.6b). |
| Batch 4 + Milestone 7.8.7 repo decisions committed | **TRUE** (`373fb4f`/`197064d` Batch 4; `c474e4b` 7.8.7). |
| `docs/reviews/**` still tracked in the public repo | **TRUE.** §15.3 migration plan remains **NOT executed**. |
| Any current uncommitted remediation work | **NONE** at pass start (working tree clean). |

**Correction to §15.2:** the sentence *"the app does **not** auto-seed it. Therefore fresh
installs **must** copy the template before first use"* is **no longer accurate** as of
`8aa3d19`. Auto-seed from template is now implemented at startup; the manual copy is
**optional** (already reflected in `docs/INSTALL.md`). §15.2 is retained as-is for historical
accuracy; this note is the authoritative correction.

### 16.3 Complete public-endpoint inventory (18 unauthenticated routes)
All 50 routes live in `backend/app/main.py` (the `routes/` package is empty). An endpoint is
"public" when its signature has **no** `Depends(get_current_user)` / `Depends(require_admin)`.
**An endpoint is not classified as dead merely because React does not call it** — print-agent
and non-browser consumers are accounted for below.

| # | Method / Route (line) | Function | Confirmed consumer(s) | Request | Response fields exposed | State change | Seq-int ID accepted? | Recommended audience |
|---|---|---|---|---|---|---|---|---|
| 1 | `GET /` (489) | root | health/bootstrap | — | status blob | none | n/a | Health-bootstrap (stays public) |
| 2 | `GET /health` (597) | health | ops/liveness | — | status blob | none | n/a | Health-bootstrap (stays public) |
| 3 | `POST /api/auth/login` (604) | login | `api.js login()`; staff UI | username/password | JWT, username, role | none | n/a | Public by design |
| 4 | `GET /api/settings` (559) | get_settings | `api.js getSettings()` **no token** (anon kiosk) | — | theme, auto_refresh, **base_checkin_url**, visitor_types, visit_purposes, required fields | none | n/a | Anonymous kiosk (public config subset) |
| 5 | `POST /api/print-agents/register` (892) | register_print_agent | `print_agent.py register_agent()` | agent_key?, hostname, printer_name, agent_version, station_slug? | **agent_key**, hostname, printer_name, **last_ip**, enabled, station_{id,name,slug} | upsert agent row; sets last_ip/last_seen | n/a (keyed by agent_key) | Authenticated print agent (enrollment) |
| 6 | `GET /api/print-jobs/{id}/badge-image` (962) | badge-image | `print_agent.py download_badge()` | path int | **badge PNG file** (visitor name/photo) | none | **YES — IDOR** | Authenticated print agent (job-scoped) |
| 7 | `GET /api/print-jobs/pending` (1049) | pending | `print_agent.py get_pending_jobs()` (`?station=slug`) | station slug? | list PrintJobResponse (visitor_id, badge_path, station) | none | filters by slug, no identity | Authenticated print agent (own station only) |
| 8 | `PUT /api/print-jobs/{id}/claim` (1081) | claim | `print_agent.py claim_job()` | path int, `printer_name` query | PrintJobResponse | Pending→Printing (**non-atomic check-then-set**) | **YES** | Authenticated print agent (own station) |
| 9 | `PUT /api/print-jobs/{id}/status` (1200) | update_status | `print_agent.py mark_job_status()` | path int, status/printer/error | PrintJobResponse | sets job status | **YES** | Authenticated print agent (claimed job) |
| 10 | `GET /api/print-stations` (1272) | list_stations | `api.js getPrintStations()` **sends token** (staff UI) | — | list incl. **print_server_host, last_ip** | none | n/a | Authenticated staff (verify no anon station-picker) |
| 11 | `GET /api/print-stations/{id}/stats` (1316) | station_stats | consumer not found in `api.js` (do **not** treat as dead) | path int | job counts | none | **YES** | Authenticated staff / station display (confirm) |
| 12 | `POST /api/print-stations/heartbeat` (1533) | heartbeat | `print_agent.py send_heartbeat()` | station_slug, agent_version | ok + slug | sets last_seen/version/**last_ip** | keyed by slug, no identity | Authenticated print agent (own station) |
| 13 | `POST /api/visitors` (1975) | create_visitor | `api.js createVisitor()` **no token** (anon kiosk) | full visitor payload | **full VisitorResponse** (id, phone, email, notes, vehicle_plate, host, photo/badge paths) | inserts visitor | n/a | Anonymous kiosk (needs slim response) |
| 14 | `GET /api/visitors/find` (2173) | find_visitors | `api.js findVisitors()` **no token** (anon returning-visitor lookup) | first_name, last_name | **list full VisitorResponse** for name match (all PII) | none | n/a | Anonymous kiosk (**PII over-exposure — highest priority**) |
| 15 | `PUT /api/visitors/{id}/checkout` (2318) | checkout | `api.js checkoutVisitor()` **no token** (anon self-checkout) | path int | full VisitorResponse | sets check_out_time/method | **YES — IDOR** | Anonymous kiosk (needs containment) |
| 16 | `POST /api/visitors/{id}/photo` (2341) | upload_photo | `api.js uploadPhoto()` **no token** (anon kiosk) | path int, image file | full VisitorResponse | **overwrites `{id}.jpg`** | **YES — IDOR / arbitrary overwrite** | Anonymous kiosk (needs containment) |
| 17 | `POST /api/visitors/{id}/badge` (2374) | generate_badge | `api.js generateBadge()` **no token** (anon kiosk) | path int | full VisitorResponse | writes `{id}.png` badge | **YES — IDOR** | Anonymous kiosk (needs containment) |
| 18 | `POST /api/visitors/{id}/print` (2411) | create_print_job | `api.js createPrintJob()` **no token** (anon kiosk) | path int, station slug | PrintJobResponse | inserts print job | **YES — IDOR** | Anonymous kiosk (needs containment) |

**Cross-cutting finding — CORS:** `main.py` mounts `CORSMiddleware(allow_origins=["*"],
allow_credentials=True, allow_methods=["*"], allow_headers=["*"])`. Wildcard origin combined
with credentialed requests is the boundary weakness recorded as F-003 in the audit; it makes
every public and authenticated endpoint reachable from any origin. Tightening this is in-scope
for a later batch, not this pass.

### 16.4 Print-agent identity mechanisms — validated behavior
Evidence: `print-agent/print_agent.py`, `print-agent/.env.example`, and the register/pending/
claim/status/heartbeat/badge-image handlers in `main.py`.

1. **Is `agent_key` a secret, an identifier, or both?** — **Identifier only.** The backend uses
   `PBC_PRINT_AGENT_KEY` purely to look up / upsert the `PrintAgent` row and echoes it back in
   the register response in plaintext. It is never treated as a secret and never validated as a
   credential.
2. **Is a token sent?** — Yes, *conditionally*. `auth_headers()` sends
   `Authorization: Bearer {PBC_PRINT_AGENT_TOKEN}` **only if that env var is set** (blank by
   default in `.env.example`).
3. **Does the backend validate it?** — **No.** No print endpoint reads the `Authorization`
   header or validates `agent_key`. The token is currently sent-but-ignored.
4. **Cross-station access possible?** — **Yes.** `pending?station=slug`, `claim`, `status`, and
   `badge-image` enforce no station ownership; any caller can poll/claim/complete another
   station's jobs and fetch any badge by integer job ID.
5. **Unregistered impersonation possible?** — **Yes.** All print endpoints are public and
   `register` accepts any client-supplied `agent_key`.
6. **Does a disabled agent still work?** — **Yes.** `pending` filters on
   `PrintStation.enabled == True` (station, not agent). `claim`/`status`/`badge-image` never
   check `PrintAgent.enabled`, so a disabled agent can still claim and complete jobs.
7. **Which endpoint provisions credentials?** — `POST /api/print-agents/register` (issues/echoes
   `agent_key`; the agent persists it to its own `.env` via `set_env_value`). No secret token is
   currently issued.
8. **Rotation / revocation?** — None today. `agent.enabled` exists but is unenforced on the hot
   path; there is no token to rotate because none is validated.
9. **Migration without downtime?** — Feasible: the `PBC_PRINT_AGENT_TOKEN` plumbing already
   exists on the agent side and is currently ignored server-side. A backend can begin *issuing*
   a token at register time and *accept-but-not-require* it during a grace window, then enforce
   it after all agents have re-registered. **Staff JWT is explicitly NOT recommended for the
   print agent** — it needs its own agent-scoped credential.

### 16.5 Data-minimization findings (anonymous kiosk)
No schema changes were made this pass. Findings only:
- **`GET /api/visitors/find` (returning-visitor lookup) is the top exposure.** It returns the
  **full `VisitorResponse`** for every active name match to an anonymous caller: `phone`,
  `email`, `notes`, `vehicle_plate`, `host_type`, `host_name`, `photo_path`, `badge_path`,
  `check_*` timestamps, and internal `id`. A returning-visitor picker needs only enough to
  disambiguate a person (e.g., display name + a non-identifying token/opaque handle).
- **`POST /api/visitors`** echoes the same full record back anonymously (less severe — the
  caller just supplied it — but still returns internal IDs/paths).
- **`GET /api/print-stations`** exposes `print_server_host` and `last_ip` (internal network
  detail). Currently called by staff UI with a token, so protecting it is low-risk.
- **`register` / `heartbeat`** responses include `last_ip`.
- **Recommendation (future batch, not now):** introduce slim public response schemas
  (`VisitorPublicResponse`, `VisitorLookupResult`) that omit PII/paths/IDs for anonymous
  endpoints, leaving the full schema for authenticated staff routes. **Do not change schemas in
  this pass.**

### 16.6 Recommended target trust model (proposal — not implemented)
- **Anonymous kiosk** — keep check-in/checkout/photo/badge/print reachable without staff login,
  but *contain* them: (a) bind kiosk actions to a station/kiosk token issued at provisioning so
  arbitrary integer-ID mutation is not possible from anywhere on the network; (b) return only
  minimized fields from `find`/`create`; (c) scope checkout/photo/badge/print to the record the
  kiosk just created within the current session rather than any global integer ID.
- **Print agent** — introduce an **agent-scoped credential** (server-issued token stored hashed),
  issued at `register`, sent as `Authorization: Bearer` (plumbing already exists), validated on
  `pending`/`claim`/`status`/`badge-image`/`heartbeat`. Enforce **station ownership** (agent may
  only see/claim its assigned station's jobs), make **claim atomic** (single-winner conditional
  UPDATE), scope **status** to the claiming agent's job, scope **badge-image** to the claiming
  agent, and honor **`agent.enabled`** on the hot path. Support disable/revoke and a
  non-disruptive rollout. **Not staff JWT.**
- **Staff / admin** — unchanged. Endpoints already carry `get_current_user` / `require_admin`.
  Candidates to move from public→staff with low regression risk: `GET /api/print-stations`,
  `GET /api/print-stations/{id}/stats` (verify no anonymous kiosk station-picker first).

### 16.7 Proposed bounded implementation batches (5B–5F — DO NOT IMPLEMENT YET)
Each is deliberately small, reversible, and independently testable.

- **Batch 5B — Public response-data minimization.** Files: `schemas.py`, `main.py` (find/create
  handlers), frontend consumers of the shape. Endpoints: `#13`, `#14`. Tests first: returning-
  visitor lookup returns only minimized fields; no PII enumeration; kiosk check-in still works.
  Deployment impact: none (additive schemas). Backward-compat: frontend must tolerate slimmer
  objects. Rollback: revert schema/handler. Regression risk: **medium** (frontend field usage).
  Owner decisions: exact minimal field set for the returning-visitor picker.
- **Batch 5C — Print-agent authentication foundation (accept-but-not-require).** Files:
  `models.py` (token hash column), `main.py` (issue token at register; optional validation),
  `print_agent.py` (already sends token). Endpoints: `#5`–`#9`, `#12`. Tests first: register
  issues token; requests with valid token accepted; requests without token still accepted during
  grace window. Deployment impact: agents re-register to obtain tokens. Backward-compat: grace
  window mandatory. Rollback: ignore token again. Regression risk: **low** while non-enforcing.
  Owner decisions: grace-window length; enrollment gating (open vs. admin-approved).
- **Batch 5D — Station ownership + atomic claims (enforce).** Files: `main.py`
  (pending/claim/status/badge-image). Endpoints: `#6`–`#9`, `#12`. Tests first: agents poll only
  their station; cross-station claim rejected; concurrent claims → single winner; status limited
  to claimed job; disabled agent rejected. Deployment impact: requires 5C tokens deployed to all
  agents. Rollback: relax ownership checks. Regression risk: **medium** (multi-agent timing).
- **Batch 5E — Kiosk workflow containment.** Files: `main.py` (checkout/photo/badge/print),
  possibly a kiosk/station token. Endpoints: `#15`–`#18`. Tests first: kiosk can only act on the
  record it created this session; arbitrary integer-ID mutation rejected; badge/print still
  usable. Deployment impact: kiosk provisioning token. Rollback: revert to open IDs. Regression
  risk: **high** (touches live public kiosk flow) — stage carefully.
- **Batch 5F — Tests, docs, deployment migration.** Files: `backend/tests/`, `docs/INSTALL.md`,
  `docs/PRINT-SERVER.md`, `print-agent/.env.example` (add `PBC_PRINT_AGENT_KEY` note),
  `deployment` docs. No endpoint changes. Tests: full regression + the negative-security tests
  from 5B–5E. Deployment impact: documents the agent re-enrollment procedure. Regression risk:
  **low**.

### 16.8 Required tests (to be written before the corresponding batch ships)
- Anonymous check-in (`POST /api/visitors`) still succeeds.
- Returning-visitor lookup (`find`) returns only required fields; no sensitive PII enumeration.
- No arbitrary badge retrieval (`badge-image` requires agent + job scope).
- Agents poll only their assigned station; unassigned/disabled agents rejected.
- Cross-station claim rejected; concurrent claims yield exactly one winner.
- Status updates limited to the claiming agent's job.
- Staff/admin workflows unaffected; existing 401/403 semantics unchanged.
- Kiosk photo/badge/print remain usable within a session; cross-record integer-ID mutation
  rejected.

### 16.9 Owner decisions required before implementation
1. Minimal field set for the anonymous returning-visitor picker (Batch 5B).
2. Print-agent enrollment model: open register vs. admin-approved (Batch 5C).
3. Grace-window length before token enforcement (5C→5D).
4. Whether the kiosk gets a per-station provisioning token (Batch 5E) and how it is distributed
   to deployed kiosks.
5. Confirmation that no anonymous flow depends on `GET /api/print-stations` /
   `.../{id}/stats` before those move to staff auth.

### 16.10 NOT performed in this pass (explicit)
No application code, authentication, frontend behavior, database, or schema changed. No endpoint
secured. No secrets rotated. No Git history rewritten. No documentation removed or moved. No
commit made automatically. Milestone 8 not started. Validation baseline (28 backend / 9 frontend
/ 16 lint) preserved.

**Suggested commit message (documentation-only):**
`Milestone 7.8.8: Batch 5A kiosk & print-agent trust-boundary validation and implementation plan (docs only)`

---

## 17. Batch 5A.1 — Trust-Boundary Decision Resolution & Migration Prerequisite Review (PLANNING / VALIDATION ONLY)

**Nature of this pass:** validation and owner-decision only. No application code, authentication,
frontend behavior, database, schema, or migration tooling was changed. This section **adds
authoritative corrections** to §16 rather than rewriting it — where §16 and §17 disagree, **§17
supersedes** because it is grounded in an end-to-end consumer trace performed this pass.

### 17.1 Starting state & validation baseline (unchanged)
- Git: branch `main`, HEAD `8aa3d19` (== `origin/main`). Working tree carried one uncommitted,
  documentation-only change from Batch 5A (`docs/reviews/pre-milestone-8-remediation-plan.md`,
  the §16 addition). No runtime files were modified going into this pass.
- Baseline re-confirmed and preserved: **backend pytest 28 passed / 4 warnings**;
  `py_compile` of the 8 app modules **exit 0**; **frontend `npm run test` 9 passed (2 files)**;
  **`npm run build` success**; **`npm run lint` 16 problems (13 errors, 3 warnings)** —
  pre-existing; not touched.

### 17.2 CORRECTION — `/api/visitors/find` is the anonymous **CHECK-OUT locator**, not a returning-visitor picker (Task 1)
§16.3 (row 14), §16.5, §16.7 (Batch 5B), §16.8, and §16.9 describe `GET /api/visitors/find` as
the "returning-visitor lookup / picker." **An end-to-end trace this pass proves that is
incorrect.** The name `find` misled the earlier pass; purpose must be read from consumers, not
the name.

**End-to-end trace (`frontend/src/App.jsx`, `frontend/src/api.js`):**

| Function | api.js call | Auth header | Consumer / screen | Purpose |
|---|---|---|---|---|
| `findVisitors(first, last)` | `GET /api/visitors/find` | **none (anon)** | `handleFindVisitor()` → `setCheckoutResults()` → **Visitor Check-Out screen** | **Anonymous check-out candidate locator** |
| `searchVisitors(q)` | `GET /api/visitors/search` | **Bearer (staff)** | `handleVisitorSearch()` → `setSearchResults()` | Staff visitor search |
| `getVisitor(id)` / `getVisitorHistory(id)` | `GET /api/visitors/{id}` / `.../history` | **Bearer (staff)** | `handleVisitorSelect()` → `visitor-detail` | Staff detail + history |
| `checkInAgain(id, data)` | `POST /api/visitors/{id}/checkin-again` | **Bearer (staff)** | `handleCheckInReturningVisitor()` / `handleSubmitReturningVisitor()` using `selectedVisitor.id` | **Staff** returning check-in |
| `checkoutVisitor(id)` | `PUT /api/visitors/{id}/checkout` | **none (anon)** | `handleGuestCheckout(visitor.id)` (from `checkoutResults`) **and** staff `handleVisitorCheckout(id)` | Check-out |

**Findings:**
- `find` feeds **`checkoutResults`** (state vars `checkoutFirstName`/`checkoutLastName`/
  `checkoutResults`) rendered on the **Visitor Check-Out** screen (`App.jsx` ~2385). Each result
  card renders and the button `onClick={() => handleGuestCheckout(visitor.id)}` calls
  `checkoutVisitor(visitor.id)`.
- The **returning check-in** flow does **not** use `find`. It uses `selectedVisitor`, obtained
  through the **authenticated staff** path (`searchVisitors` → `handleVisitorSelect` →
  `getVisitor`). So `find` is unrelated to returning check-in.
- `find` supports **check-out only**, and only for **active visitors** — the backend
  `find_visitors` (`main.py:2173`) filters `Visitor.check_out_time.is_(None)`.
- The internal **integer `id` is currently required** by the anonymous consumer, because the
  check-out call is `PUT /api/visitors/{id}/checkout`.

**Exact fields the anonymous consumer reads from a `find` result** (`App.jsx` check-out card):
`visitor.id` (React key + passed to `checkoutVisitor`), `visitor.first_name`,
`visitor.last_name`, `visitor.visitor_type`, and `visitor.check_out_time` (used only for an
ACTIVE/CHECKED-OUT badge — always `null` here because `find` returns active visitors only).

**Minimum field set required by the existing anonymous check-out workflow:**
`id`, `first_name`, `last_name`, `visitor_type` (plus `check_out_time`, which is always `null`
in this response and can be omitted or hard-set). **All other `VisitorResponse` fields**
(`phone`, `email`, `notes`, `vehicle_plate`, `host_type`, `host_name`, `phone`, `photo_path`,
`badge_path`, `check_in_time`, `expected_departure_time`, `church`, `badge_printed*`,
`check_out_method`) **are never read by the anonymous consumer** and constitute the PII
over-exposure. Removing them does **not** break the check-out workflow. Removing `id` **would**
break it unless the check-out call is simultaneously changed to accept an opaque handle (a
Batch 5E concern — do not do it in the minimization batch).

> **Consequence for the plan:** the "Batch 5B minimal returning-visitor field set" owner
> decision (§16.9 #1) is re-scoped to **"minimal anonymous check-out locator field set,"** and
> the target is the four fields above. The returning-visitor picker is a **staff** feature and
> is **out of the anonymous-minimization scope entirely.**

### 17.3 CORRECTION — CORS finding is **F-008**, not F-003 (Task 6)
§16.3 states the wildcard-origin + credentials CORS weakness is "recorded as **F-003** in the
audit." That citation is wrong. Per `pre-milestone-8-repository-audit.md`:
- **F-008** = *Permissive CORS* — `main.py:66` `allow_origins=["*"]` + `allow_credentials=True`
  (Medium). **This is the correct reference for the CORS finding.**
- **F-003** = *`get_current_user` never checks the database* (AuthZ/Session, High) — a different
  finding, addressed under Batch 3.

**Authoritative correction:** every reference to the CORS boundary weakness should read **F-008**.
§16.3's "F-003" for CORS is superseded by this note.

### 17.4 Anonymous kiosk transaction map & smallest containment (Task 2)
**Check-in** (`handleCheckIn`, `App.jsx` ~1183): `createVisitor(payload)` **[anon]** → reads
**only** `visitor.id` from the response → `uploadPhoto(visitor.id, file)` **[anon]** →
`generateBadge(visitor.id)` **[anon]** → `createPrintJob(visitor.id, PRINT_STATION)` **[anon]**.
**Check-out** (§17.2): `findVisitors(first, last)` **[anon]** → `checkoutResults` →
`handleGuestCheckout(visitor.id)` → `checkoutVisitor(visitor.id)` **[anon]**.

| Question | Answer (evidence) |
|---|---|
| Identifier passed between calls | Integer **`visitor.id`**. In check-in it is a **local `const`** inside the handler (function-scoped, transient) — not React state. In check-out it is the `id` from `find` results. |
| State stored in React | Check-in id is **not** persisted to React state; `checkedInVisitorId` is set only in the **staff/returning** flow. Check-out uses `checkoutResults` state. |
| Does browser refresh lose state? | **Yes.** All state is in-memory `useState`/local vars. A mid-flow refresh orphans the already-created DB visitor (client loses the id → cannot resume photo/badge/print). No `sessionStorage`/`localStorage` holds a kiosk visitor id. |
| Kiosk/session token? | **None.** `localStorage access_token` is **staff-login only**. There is no anonymous kiosk session token. |
| URL station slug available? | **Yes.** `getPrintStationSlug()` (`App.jsx:1150`) reads `?station=<slug>` from `window.location.search`, default `"dining-hall"`. The Settings screen even advertises the kiosk URL as `?station={slug}` (~line 5280). **This is the existing per-kiosk primitive.** |
| Can multiple kiosks share one backend? | **Yes.** All kiosks share one backend/DB; a kiosk is differentiated only by its `?station=` slug. No per-kiosk isolation exists. |
| Fields required in each response | `createVisitor` → only `id` read. `uploadPhoto`/`generateBadge`/`createPrintJob` → responses **awaited but not read**. `find` → the four fields in §17.2. |

**Smallest containment design that preserves these exact workflows (proposal — not implemented):**
1. **Check-in chain** — because `createVisitor` → photo → badge → print run inside **one
   synchronous handler** with a freshly-created id held as a local variable, the backend can
   return an **opaque, single-record capability handle** from `createVisitor` that the
   subsequent photo/badge/print calls present instead of a global integer id. This removes
   arbitrary integer-ID mutation with **zero new persistent client state** (the handle lives
   exactly as long as `visitor.id` does today).
2. **Check-out** is the only **cross-session** anonymous action (name → check-out by id).
   Contain it by scoping `find`/`checkout` to the kiosk's **existing `?station=` slug** (and/or
   a short-lived check-out capability), so an anonymous caller cannot check out arbitrary global
   IDs from anywhere on the network.
This is **Batch 5E** scope; it is documented here only to fix the containment model, not to
implement it.

### 17.5 Print-agent enrollment options — comparison & recommendation (Task 3)
No enrollment code was changed. The four candidate models:

| Model | Code / schema change | Deployment for existing Pi agents | Credential-theft risk | Revocation | Recovery after lost `.env` | Unattended re-registration | Operational burden |
|---|---|---|---|---|---|---|---|
| **A. Shared bootstrap token** | Server validates one shared `BOOTSTRAP_TOKEN` at `register`, issues per-agent token (needs a credential store — §17.6) | Put the same secret in every Pi `.env` once | **High** — one leak lets anyone enroll a **usable** agent | Rotate bootstrap token = touch **every** Pi | Re-run `register` with bootstrap token | **Yes** | Low ongoing, weak security |
| **B. Admin pre-creates / approves** | Admin endpoint/UI creates the `PrintAgent` + issues token out-of-band; `register` matches it | Admin provisions each Pi credential manually | **Medium** — per-agent; leak affects one agent | Delete/disable the agent row | Admin re-issues (manual) | **No** (needs admin each time) | Medium; strong control |
| **C. One-time enrollment code** | `enrollment_code` store (code, expiry, used); `register` exchanges code → persistent token | Admin hands each Pi a one-time, expiring code | **Low** — code single-use + expiring | Disable agent; codes burn/expire | Admin issues a new one-time code (manual) | **No** | Medium; good security + auditability |
| **D. Open register + admin approval + disabled-by-default** | `register` creates agent `enabled=False` + issues token; admin **approve** flips `enabled=True`; **hot path enforces `enabled`** | Pi registers unattended; admin approves once | **Low** at issue time — token is **inert until approved** | Set `enabled=False` (already modeled) | Pi re-registers unattended → admin re-approves (one click) | **Partial** — registration yes, activation needs approval | Low–Medium; strong (no usable cred without human approval) |

**Explicit rejection (per the constraint):** any design where an **unauthenticated caller obtains
an immediately-usable agent credential is rejected.** This disqualifies today's behavior
(register returns a working `agent_key` and no credential is enforced) and any "open register
that returns a live token." Option A is acceptable **only** if the bootstrap token is treated as
a true secret; a single shared secret across the fleet is fragile.

**Recommendation: Option D** (open registration + **disabled-by-default** + admin approval),
optionally seeded with **C**'s one-time codes for the initial fleet. Rationale:
- Satisfies the hard constraint: the issued token is **inert until an admin approves**, so an
  unauthenticated caller can never obtain an immediately-usable credential.
- Preserves **unattended re-registration** for deployed Pis (they re-register automatically after
  a lost `.env`; the admin only re-approves).
- Revocation is the **existing `PrintAgent.enabled`** flag (a single boolean), which §16.4 already
  flags as **unenforced on the hot path** — so adopting D naturally closes that gap and aligns
  with Batch 5D (enforce `agent.enabled`).
- **Not staff JWT** — the agent keeps its own agent-scoped credential.

> **Migration dependency:** Option D still needs somewhere to store the issued token **hash**.
> See §17.6 — this must be a **new table**, not a new column on `PrintAgent`.

### 17.6 Database migration prerequisite — conclusion (Task 4)
**Validated facts:**
1. `Base.metadata.create_all()` (`backend/app/main.py:56`) **creates only missing tables**; it
   **never `ALTER`s an existing table** to add a column. Confirmed by SQLAlchemy's own docs
   (`sqlalchemy/sql/schema.py:2715`: adding a column to an existing model requires migrating
   existing tables via `ALTER TABLE` or similar).
2. **What happens when `models.py` gains a column on an existing deployment:** the app **boots
   normally** (the table already exists, so `create_all` no-ops), but the **first query that
   references the new column raises `sqlite3.OperationalError: no such column`** — i.e., the
   print-agent auth path would crash at runtime, not at startup.
3. **Migration tooling in PBC-guest-kiosk: none.** The only schema mechanism is the single
   `create_all` at `main.py:56`. `alembic.ini` exists **only in the separate `pbc-systems-app`
   repo**, not here. Audit finding **F-019** already records "create_all at import; no Alembic;
   no migration path."
4. **Could token state reuse an existing column?** `PrintAgent` already has `agent_key`,
   `hostname`, `printer_name`, `agent_version`, `last_seen`, `last_ip`, `enabled`,
   `print_station_id`. **Rejected** — overloading `agent_key` (an identifier echoed in plaintext)
   to also hold a secret conflates identity with credential and corrupts the field's meaning. No
   existing column can carry a hashed token without overloading.
5. **Key enabling fact:** `create_all` **does** auto-create a brand-**new** table on existing
   deployments. A **new** `print_agent_credentials` table is therefore **additive** and needs
   **no `ALTER` and no migration framework**.

**Conclusion:** Batch 5C **cannot** safely add a column to the existing `PrintAgent` table on
deployed SQLite databases without migration support. **Recommended path (of the three offered):
redesign 5C to be schema-additive via a separate credential store implemented as a NEW table**
(`print_agent_credentials`, auto-created by `create_all`; columns: agent FK, token **hash**,
issued/rotated timestamps, `enabled`/revoked). This is the "separate credential store with a
documented lifecycle" option and unblocks 5C with the least risk **without** introducing Alembic
in this pass. A dedicated **bounded migration-foundation batch remains the correct long-term
investment** for future `ALTER`s, but is **not a prerequisite** for 5C **provided 5C only adds
new tables**. **Do not** implement an ad-hoc `ALTER-TABLE-on-startup` hack merely to avoid
migrations.

### 17.7 Owner decision request (Task 5)
Each decision lists **Options · Recommendation · Operational impact · Security consequence ·
Default if the owner takes no action.**

**Decision 1 — Purpose & minimum response fields for `GET /api/visitors/find`.**
- **Options:** (a) leave as full `VisitorResponse` (status quo, full PII to anonymous callers);
  (b) slim to the anonymous check-out locator set: `id`, `first_name`, `last_name`,
  `visitor_type`.
- **Recommendation:** (b). Confirmed purpose is the **anonymous check-out candidate locator**
  (§17.2), not a returning-visitor picker.
- **Operational impact:** check-out screen behavior unchanged; frontend must tolerate a slimmer
  object (it already reads only those fields).
- **Security consequence:** eliminates anonymous PII enumeration (phone/email/notes/plate/host/
  photo & badge paths) — the highest-priority exposure.
- **Default if no action:** status quo — full PII remains exposed anonymously.

**Decision 2 — Print-agent enrollment model.**
- **Options:** A shared bootstrap token · B admin pre-create/approve · C one-time enrollment code
  · D open register + admin approval + disabled-by-default (§17.5).
- **Recommendation:** **D** (optionally seeded with C for the first fleet).
- **Operational impact:** Pis re-register unattended; admin performs a one-time approval per
  agent; revocation via the existing `enabled` flag.
- **Security consequence:** no unauthenticated caller can obtain an **immediately-usable**
  credential; satisfies the explicit rejection criterion.
- **Default if no action:** status quo — `register` issues an unenforced `agent_key`; any caller
  can enroll and act. **Insecure; not recommended as a resting state.**

**Decision 3 — Grace-window EXIT CRITERIA (not merely a duration).**
- **Options:** (a) time-boxed only ("N days"); (b) **state-based exit**: enforcement begins only
  when **all currently-registered agents have re-registered with a valid token AND an admin has
  confirmed the fleet is fully migrated** (with a time cap as a backstop).
- **Recommendation:** (b) — a measurable exit condition, e.g. *"every `PrintAgent` row that was
  active in the last 30 days has presented a valid token at least once, and the admin has clicked
  'Enforce'; a 14-day cap forces a review if not met."*
- **Operational impact:** prevents locking out a Pi that has not yet re-registered; enforcement
  is a deliberate, verified switch.
- **Security consequence:** closes the accept-but-not-require window on evidence, not a guess.
- **Default if no action:** the accept-but-not-require window never closes → tokens are issued
  but never enforced (no security gain). **Avoid.**

**Decision 4 — Kiosk containment model.**
- **Options:** (a) status quo (global integer IDs, anonymous mutation from anywhere); (b)
  per-record **opaque capability handle** for the check-in chain + **`?station=` scoping** for
  find/check-out (§17.4); (c) full per-station kiosk provisioning token.
- **Recommendation:** (b) — smallest change that preserves the exact workflows and needs **no new
  persistent client state**; escalate to (c) only if network-level isolation is required.
- **Operational impact:** kiosks keep working via the existing `?station=` URL; no new device
  setup for (b).
- **Security consequence:** removes arbitrary integer-ID checkout/photo/badge/print (the IDOR
  cluster) while keeping anonymous kiosk UX.
- **Default if no action:** IDOR cluster remains on live public endpoints.

**Decision 5 — Must migration support precede print-agent auth?**
- **Options:** (a) build a migration foundation (Alembic or equivalent) before 5C; (b) **make 5C
  schema-additive via a new `print_agent_credentials` table** (no `ALTER`, no migration framework)
  and defer the migration foundation.
- **Recommendation:** (b) — unblocks 5C safely now; schedule the migration foundation as its own
  bounded batch for future `ALTER`s.
- **Operational impact:** existing SQLite DBs gain the new table automatically via `create_all`;
  no manual DB step.
- **Security consequence:** none negative; avoids the "no such column" runtime crash on deployed
  DBs (§17.6).
- **Default if no action:** if 5C is attempted as a **column add**, deployed kiosks crash on the
  first auth query. **Must be decided before 5C.**

**Decision 6 — Do `GET /api/print-stations` and `GET /api/print-stations/{id}/stats` have any
confirmed anonymous consumer?**
- **Finding this pass:** `getPrintStations()` is called **with a staff Bearer token**
  (`api.js:494`); no anonymous consumer was found. `.../{id}/stats` has **no located consumer**
  in `api.js` (do **not** treat as dead — a station display may call it).
- **Options:** (a) move both to staff auth; (b) keep public pending a deployment check for a
  kiosk station-picker / display.
- **Recommendation:** (a) for `GET /api/print-stations`; **confirm no station-display consumer
  before** moving `.../{id}/stats`.
- **Operational impact:** none for staff UI (already tokened); verify any wall-display usage.
- **Security consequence:** stops anonymous exposure of `print_server_host` / `last_ip`.
- **Default if no action:** internal network detail remains anonymously readable.

### 17.8 Corrections applied to the tracker (Task 6 summary)
- **§17.2** supersedes the "returning-visitor lookup/picker" label for `/api/visitors/find` in
  §16.3 (row 14), §16.5, §16.7 (Batch 5B), §16.8, §16.9 → **anonymous check-out locator**.
- **§17.3** corrects the CORS finding reference from **F-003 → F-008**.
- **§17.6** adds the migration prerequisite: **Batch 5C must be schema-additive (new table), not a
  column `ALTER`**, on deployed SQLite DBs.
- **Owner decisions still required:** the six in §17.7 (which refine and re-scope §16.9's list).
- Historical §16 text is left intact per instruction; these notes are authoritative where they
  conflict.

### 17.9 NOT performed in this pass (explicit)
No application runtime behavior, endpoint authentication, response schema, or database/schema was
changed. No column added. No migration system (Alembic or other) introduced. No secret rotated.
No Git history rewritten. No commit made automatically. Batches 5B/5C/5D/5E/6 and Milestone 8 not
started. Validation baseline (**28 backend / 9 frontend / 16 lint**) preserved.

**Suggested commit message (documentation-only):**
`Milestone 7.8.9: Batch 5A.1 trust-boundary decision resolution & migration prerequisite review (docs only)`

---

## 18. Batch 5B — Anonymous Check-Out Response Minimization (IMPLEMENTED)

**Scope actually implemented:** response-data minimization for **`GET /api/visitors/find`**
only. This is the anonymous Visitor Check-Out locator (confirmed in §17.2). No search behavior,
active-visitor filtering, matching, ordering, empty-search behavior, or checkout behavior was
changed. Visitor IDs are unchanged (no capability handles). No kiosk/station tokens, no
print-agent auth change, no database columns or tables added.

### 18.1 Starting state
- Git: branch `main`, HEAD `57bd861` (== `origin/main`); working tree **clean** at start
  (Batch 5A/5A.1 docs committed).
- Baseline re-confirmed before changes: backend **28 passed**; `py_compile` **exit 0**; frontend
  **9 passed**; **build success**; lint **16 problems (13 errors, 3 warnings)**.

### 18.2 Files changed
| File | Change |
|---|---|
| `backend/app/schemas.py` | Added `VisitorCheckoutLocatorResponse` (4 fields). No existing schema modified. |
| `backend/app/main.py` | Imported the new schema; changed **only** `find_visitors`' `response_model` from `list[VisitorResponse]` → `list[VisitorCheckoutLocatorResponse]`. Handler query/filter/order/return logic unchanged. |
| `backend/tests/test_visitor_find_minimization.py` | **New** — 8 tests (see §18.5). |
| `docs/reviews/pre-milestone-8-remediation-plan.md` | This §18. |

### 18.3 Exact schema introduced
```python
class VisitorCheckoutLocatorResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    visitor_type: str

    class Config:
        from_attributes = True
```
Applied via:
```python
@app.get(
    "/api/visitors/find",
    response_model=list[VisitorCheckoutLocatorResponse],
)
```

### 18.4 Public response — before vs. after
- **Before:** full `VisitorResponse` per active name match to an anonymous caller (all PII +
  file paths + timestamps).
- **After:** exactly `id`, `first_name`, `last_name`, `visitor_type`.
- **Fields removed from the anonymous response:** `phone`, `email`, `church`, `purpose`,
  `host_type`, `host_name`, `vehicle_plate`, `notes`, `expected_departure_time`, `photo_path`,
  `badge_path`, `check_in_time`, `check_out_time`, `check_out_method`, `badge_printed`,
  `badge_printed_time`.
- **Frontend impact:** none. The check-out screen's `checkoutResults.map(...)` reads only
  `id`, `first_name`, `last_name`, `visitor_type` (and `check_out_time` solely for an
  ACTIVE/CHECKED-OUT badge). Because `find` returns active visitors only, the now-absent
  `check_out_time` is `undefined` → falsy → the badge renders **ACTIVE**, which is correct.
  No other consumer reads the removed fields from `find`.

### 18.5 Tests added (`backend/tests/test_visitor_find_minimization.py`)
1. `find` remains anonymously accessible (no `Authorization` header) → 200.
2. Returns active matching visitors.
3. Excludes checked-out visitors (anonymous checkout → no longer found).
4. Response contains **exactly** `{id, first_name, last_name, visitor_type}`.
5. Response exposes **none** of the 16 removed PII/file-path fields.
6. The returned `id` still works with the anonymous `PUT /api/visitors/{id}/checkout`.
7. Authenticated staff `GET /api/visitors/{id}` still returns the full `VisitorResponse`.
8. Schema guard: `VisitorCheckoutLocatorResponse` is exactly the four fields **and**
   `VisitorResponse` still contains the PII fields (staff shape unchanged).

### 18.6 Validation results (post-change)
- Backend pytest: **36 passed** (28 baseline + 8 new), 5 warnings.
- `py_compile` (8 modules): **exit 0**.
- Frontend `npm run test`: **9 passed (2 files)**.
- Frontend `npm run build`: **success**.
- Frontend `npm run lint`: **16 problems (13 errors, 3 warnings)** — unchanged baseline.
- `git diff --check`: **clean**.

### 18.7 Behavior confirmation
Lookup and checkout behavior are **unchanged**: partial first/last-name matching
(`func.lower(...).contains(...)`), `or_`-combined filters, active-only filtering
(`check_out_time IS NULL`), `check_in_time DESC` ordering, and empty-search `[]` are all
untouched — only the serialized response shape is narrowed. The anonymous checkout endpoint
still accepts the same integer `id` returned by `find`.

### 18.8 Remaining Batch 5C–5E decisions (unchanged from §17.7)
- **5C — Print-agent authentication:** enrollment model (recommend Option D); grace-window
  **exit criteria** (state-based); **must be schema-additive via a new `print_agent_credentials`
  table**, not a column `ALTER` (§17.6).
- **5D — Station ownership + atomic claims + enforce `agent.enabled`** (depends on 5C tokens).
- **5E — Kiosk containment** (opaque per-record handle for the check-in chain + `?station=`
  scoping for find/checkout). `GET /api/print-stations` → staff auth; confirm no station-display
  consumer before moving `.../{id}/stats`.

### 18.9 NOT performed in this pass (explicit)
No search/matching/filtering/ordering/checkout behavior changed. `VisitorResponse` untouched. No
capability handles, kiosk/station tokens, or print-agent auth. No database columns or tables
added. No migration tooling. No secrets rotated. No Git history rewritten. No commit made
automatically. Batches 5C/5D/5E/6 and Milestone 8 not started.

**Suggested commit message:**
`Milestone 7.8.10: Batch 5B anonymous check-out (/api/visitors/find) response minimization + tests`
