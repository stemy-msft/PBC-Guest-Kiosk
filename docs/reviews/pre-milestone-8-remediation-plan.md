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

---

## 19. Batch 5C — Print-Agent Authentication Foundation (IMPLEMENTED)

**Scope implemented:** the *foundation* for per-agent authentication — a new
schema-additive credential table, one-time hashed token issuance, disabled-by-default
enrollment, Administrator approval/rotation/revocation, and a grace-period auth helper.
**No enforcement was added:** print-agent endpoints still do not require a token, station
ownership is not enforced, and existing deployed (tokenless) agents keep working. Token
enforcement is deferred to Batch 5D.

### 19.1 Starting Git state
- Branch `main`, HEAD `99d5c33` ("Milestone 7.8.9: minimize anonymous checkout lookup
  response" = Batch 5B), working tree **clean**.
- Baseline re-confirmed: backend **36 passed**; `py_compile` **exit 0**; frontend **9 passed**;
  **build success**; lint **16 problems (13 errors, 3 warnings)**.

### 19.2 Credential model and lifecycle
New table **`print_agent_credentials`** (model `PrintAgentCredential`) — the existing
`print_agents` table is unchanged (no `ALTER`, no new columns):

| Column | Purpose |
|---|---|
| `id` | PK |
| `print_agent_id` | FK → `print_agents.id` (`ON DELETE CASCADE`), indexed |
| `token_selector` | public, unique, indexed lookup handle (not a secret) |
| `token_hash` | Argon2 hash (via `pwdlib`) of the verifier — never plaintext |
| `created_at` | issuance timestamp |
| `last_used_at` | set by the grace-period auth dependency when a token is presented |
| `revoked` | bool, default `False` |
| `revoked_at` | revocation timestamp |

**Token format:** `"{selector}.{verifier}"`. The selector allows O(1) lookup; only the
verifier is hashed. The plaintext token is returned to the agent **exactly once** (at
issuance) and is never stored or logged.

**Lifecycle:** issue → (optional `last_used_at` update) → rotate (revoke all active + issue
new) or revoke (mark all active revoked). A credential authenticates only when it is
unrevoked, the verifier matches, and the owning agent exists and is **enabled**.

### 19.3 Registration behavior (`POST /api/print-agents/register`, anonymous)
- **Newly discovered agent:** created with `enabled=False` (was `True`). A strong random
  credential is issued **once**; only its hash is stored; the plaintext is returned in the
  registration response field `agent_token`.
- **Existing agent (matched by `agent_key`):** identity and `enabled` state are preserved. A
  credential is issued **only if the agent has no active credential yet** (lets a legacy
  tokenless agent adopt one during the grace period). If an active credential already exists,
  **no rotation occurs** and `agent_token` is `null` — re-registration never silently rotates.
- Response model changed to `PrintAgentRegisterResponse` (all `PrintAgentResponse` fields plus
  the one-time `agent_token`). The registration audit line was corrected to the
  `audit(user, action, details)` signature and records agent id, hostname, enabled state, and
  whether a credential was issued — **never the token**.

### 19.4 Grace-period behavior (transitional — Batch 5C only)
- Print-agent endpoints (`/api/print-jobs/pending`, `/claim`, `/status`, `/badge-image`,
  register, heartbeat) remain **unauthenticated**. Existing tokenless agents are unaffected.
- A new **optional** helper `auth.get_optional_print_agent` (and pure function
  `auth.resolve_print_agent_credential`) can detect a Bearer token, validate it against the
  table, load the agent, and reject revoked/disabled credentials — but **nothing is wired to
  require it yet**. Requests without a token are accepted; requests with an invalid/revoked
  token resolve to "not authenticated" (they are not treated as an authenticated agent).
- Newly registered agents are **disabled pending Administrator approval**; a disabled agent's
  token never authenticates, even though it is a valid credential.

### 19.5 Administrator operations (existing `require_admin` authorization)
- `PUT /api/print-agents/{id}/enabled` `{enabled: bool}` — approve/enable or disable an agent.
- `POST /api/print-agents/{id}/credentials/rotate` — revoke active credentials and issue a new
  one; returns the new plaintext token **once**.
- `POST /api/print-agents/{id}/credentials/revoke` — revoke all active credentials, no new token.
- All four operations are audited (approval, disablement, rotation, revocation) **without
  logging secrets**. `GET /api/print-agents` continues to use `PrintAgentResponse` and never
  exposes `agent_token`, `token_hash`, or `token_selector`.

### 19.6 Files changed
| File | Change |
|---|---|
| `backend/app/models.py` | Added `PrintAgentCredential` (new table). |
| `backend/app/auth.py` | Added `generate_agent_token`, `hash_agent_verifier`, `resolve_print_agent_credential`, and the optional `get_optional_print_agent` dependency. |
| `backend/app/schemas.py` | Added `PrintAgentRegisterResponse`, `PrintAgentEnabledUpdate`, `PrintAgentCredentialIssueResponse`. |
| `backend/app/main.py` | Register: disabled-by-default + one-time controlled issuance + corrected audit. New admin endpoints: `/enabled`, `/credentials/rotate`, `/credentials/revoke`. |
| `print-agent/print_agent.py` | Persist `agent_token` to `.env` (`PBC_PRINT_AGENT_TOKEN`), send via existing Bearer header, never printed. |
| `frontend/src/api.js` | Added `setPrintAgentEnabled(agentId, enabled)`. |
| `frontend/src/App.jsx` | Agent card shows Approved/Pending status and an Approve/Disable button. |
| `backend/tests/test_print_agent_credentials.py` | **New** — 17 tests. |
| `docs/reviews/pre-milestone-8-remediation-plan.md` | This §19. |

### 19.7 Tests added (`backend/tests/test_print_agent_credentials.py`)
Covers all 14 required proofs (17 tests total): new table created; `print_agents` has no new
columns; registration creates a disabled agent; token issued once and only a hash stored;
hash ≠ plaintext; list never exposes token/hash; valid token resolves to the correct agent;
invalid token not authenticated; revoked credential rejected; disabled agent not authenticated;
tokenless agent still reaches print endpoints; kiosk/staff workflows unchanged; re-registration
does not rotate; token never appears in list responses; plus Administrator approve/disable,
admin-required enforcement, and rotation (revoke-old/issue-new).

### 19.8 Validation results
- Backend pytest: **53 passed** (36 baseline + 17 new).
- `py_compile` (8 modules): **exit 0**.
- Frontend `npm run test`: **9 passed (2 files)**.
- Frontend `npm run build`: **success**.
- Frontend `npm run lint`: **16 problems (13 errors, 3 warnings)** — unchanged baseline.
- `git diff --check`: **clean** (exit 0; only a benign LF→CRLF advisory).
- Operational SQLite DB **not accessed** (tests use in-memory SQLite; `git status` shows no
  `.db` change). No existing table column added. No secret appears in the diff or logs.

### 19.9 Deployment steps for existing Raspberry Pi agents
1. Deploy the updated backend. Existing agents keep printing immediately (grace period; no
   token required).
2. Deploy the updated `print-agent/print_agent.py`. On its next registration each existing
   agent that has no credential yet receives one and stores it in its local `.env` as
   `PBC_PRINT_AGENT_TOKEN`; it begins sending the Bearer token automatically. No manual key
   entry, no downtime.
3. Newly discovered agents appear as **Pending Approval**. An Administrator approves each via
   the Print Agents screen (Approve button) before Batch 5D enforcement is enabled.
4. (Optional) Rotate a credential from the same screen/API if a token is suspected compromised;
   the agent re-registers and adopts the new token.

### 19.10 Remaining Batch 5D enforcement work
- Require a valid agent credential on `/api/print-jobs/pending|claim|status|badge-image` and
  heartbeat (wire `get_optional_print_agent` → a required dependency).
- Enforce `agent.enabled` at those endpoints (disabled/pending agents rejected).
- Enforce station ownership + atomic job claims.
- Define grace-window **exit criteria** (e.g., all active agents have `last_used_at` set) before
  flipping enforcement on.

### 19.11 Rollback procedure
- Code rollback: `git revert` the Batch 5C commit (or check out `99d5c33`). Because the new
  table is additive and unused by any enforced path, reverting the code leaves the operational
  DB fully functional; the now-orphan `print_agent_credentials` table can be ignored or dropped
  at leisure. No data migration is required to roll back.
- Agent rollback: remove `PBC_PRINT_AGENT_TOKEN` from an agent's `.env` to return it to
  tokenless operation during the grace period.

### 19.12 NOT performed in this pass (explicit)
No token enforcement on any print-agent endpoint. No station-ownership enforcement. No atomic
claims. Kiosk visitor endpoints unchanged. No columns added to existing tables. No Alembic or
migrations. No production secrets rotated. No Git history rewritten. No commit made
automatically. Batches 5D/5E/6 and Milestone 8 not started.

**Suggested commit message:**
`Milestone 7.8.10: Batch 5C print-agent auth foundation (print_agent_credentials, disabled-by-default enrollment, one-time hashed tokens, admin approval/rotation) + tests`

---

## 20. Batch 5D.1 — Ownership, Enforcement & Job-Recovery Design Review (DESIGN ONLY)

**Nature of this pass:** analysis and decision-gathering only. No application code, schema,
auth enforcement, migration, or kiosk workflow was changed. HEAD at review time `6fb1535`
(Batch 5C), working tree clean. Baseline re-confirmed: backend **53 passed**, `py_compile`
**exit 0**, frontend **9 passed**, **build success**, lint **16 problems (13/3)** — unchanged.

### 20.0 Grounding — current print-job lifecycle (as-built)

| Concern | Current code | Location |
|---|---|---|
| Valid statuses | `{Pending, Printing, Completed, Failed}` — no `Claimed`, no `Recovered` | `main.py` `VALID_PRINT_JOB_STATUSES` |
| Claim | Anonymous. Reads job, `if status != "Pending"` → else set `Printing`, `claimed_time=now()`. **Non-atomic** read-then-write; goes straight to `Printing` | `PUT /api/print-jobs/{id}/claim` |
| Pending list | Anonymous. Station **slug supplied by client** (`?station=`) filters jobs; unknown/disabled station → `[]` | `GET /api/print-jobs/pending` |
| Status update | Anonymous. Any caller may set any job `Completed/Failed`; no ownership check | `PUT /api/print-jobs/{id}/status` |
| Job → station | `PrintJob.print_station_id` (FK, **not null**) | `models.py` |
| Job → agent | **None.** `PrintJob` stores `printer_name` (free string) + `claimed_time`, but **not which agent claimed it** | `models.py` |
| Agent → station | `PrintAgent.print_station_id` (FK, **nullable**) — the ownership anchor | `models.py` |
| Agent liveness | Agent calls `register_agent()` **every poll iteration**, which sets `agent.last_seen = utcnow()`. So `last_seen` is already a de-facto heartbeat | `print_agent.py main()` → `POST /register` |
| Credential gate | `resolve_print_agent_credential` already rejects revoked credentials and disabled agents (but nothing requires it yet) | `auth.py` (Batch 5C) |

### 20.1 Task 1 — Ownership model validation

**Authoritative value: `PrintAgent.print_station_id`.** The client-supplied `?station=` slug
must become **advisory only** — the server derives the station from the authenticated agent's
row, not from the request. (Detail already noted in §19.10.)

1. **Can one authenticated agent represent multiple stations?** No. `PrintAgent.print_station_id`
   is a single nullable FK — one agent maps to at most one station. An unassigned agent
   (`NULL`) owns no station and, under 5D, would receive no jobs.
2. **Can multiple agents be assigned to one station?** **Yes, today nothing prevents it** —
   several `PrintAgent` rows may share the same `print_station_id`. Pending jobs belong to the
   *station*, so multiple agents at one station both poll and both attempt to claim → the race
   in 20.0. This must be governed explicitly (see 20.6A / owner decision 5).
3. **Assigned station disabled?** `pending` returns `[]` for a disabled station, so no *new*
   jobs are served. Jobs already `Printing` are unaffected (no recovery exists). Enqueue still
   references the station; operationally the queue silently stalls.
4. **Agent disabled?** `resolve_print_agent_credential` returns `None` for a disabled agent, so
   under 5D it would stop receiving/claiming. **Today (grace period) a disabled agent still
   prints** because no endpoint requires the credential.
5. **Credential revoked?** Same as (4): rejected by the resolver, but only once 5D wires
   enforcement. Any job the agent already set to `Printing` stays `Printing`.
6. **Station assignment changes while jobs pending?** `Pending` jobs carry their own
   `print_station_id`, so they stay with the *old* station until an admin `reassign`s them.
   Reassign only accepts `Pending` jobs — an in-flight `Printing` job cannot be moved.

### 20.2 Task 2 — Offline / failed-agent recovery (as-built)

1. **How jobs strand today:** `claim` sets `Printing` with no lease and no `claimed_by`. Nothing
   ever transitions `Printing` back. If the agent dies after claiming (power loss, crash,
   revoked, replaced), the job is **stuck in `Printing` forever**. It is invisible to the
   dashboard's `pending`/`failed` counters, so it silently disappears from the queue.
2. **Does ownership enforcement alone solve it?** **No.** Enforcing `print_station_id` fixes
   *authorization* (who may claim) but does nothing for *liveness*. A stranded `Printing` job
   stays stranded regardless of ownership rules. Recovery is a separate mechanism.
3. **Does the current design allow recovery?** Only manually: an admin can `DELETE` the job or,
   because `reassign` rejects non-`Pending` jobs, there is **no supported path to requeue a
   stuck `Printing` job** — it must be deleted and the badge re-created from the visitor. This
   is a real operational gap.
4. **Live camp impact:** During peak check-in a single Pi reboot can permanently strand every
   badge it had claimed. Staff see the visitor as "printing" with no badge and no error, and no
   button to recover. High-severity for the Dining Hall / high-volume stations.

- **Scenario A (power loss):** job pinned `Printing`, never recovers. Confirmed gap.
- **Scenario B (revoked mid-print):** job pinned `Printing`; revocation does not touch jobs.
- **Scenario C (Pi replaced, same station):** new agent registers, shares `print_station_id`,
  and can claim **new** `Pending` jobs — but the old agent's in-flight `Printing` jobs remain
  stranded (owned by nothing, unrecoverable via supported endpoints).

### 20.3 Task 3 — Recovery policy options

| Option | Pros | Cons | Failure modes | Camp impact |
|---|---|---|---|---|
| **A — Manual admin only** | Simplest; zero false positives; human confirms badge really didn't print | Requires staff to notice + act; slow during rush; needs a new "requeue stuck job" admin action (doesn't exist today) | Overnight/unattended stalls; staff forget; queue backs up | Poor at high volume; acceptable only as a floor |
| **B — Automatic on heartbeat age** | Self-healing; no staff action; uses existing `last_seen` | Risk of **duplicate print** if agent was merely slow (printed, then reclaimed elsewhere); tuning the timeout | Timeout too low → duplicate badges; too high → long stalls; clock skew | Best throughput, but needs anti-duplicate controls (20.6A) |
| **C — Hybrid (auto-detect → controlled requeue, capped retries, terminal `Failed` for admin)** | Self-heals the common case; caps runaway retries; keeps a human in the loop for repeat failures; auditable | Slightly more states/logic | Mostly mitigated; residual duplicate risk bounded by lease + generation | Strong fit for camp: fast recovery, bounded blast radius |

**Recommendation: Option C (Hybrid).** Auto-recover a stale claim after a heartbeat-age
timeout, requeue for a **bounded** number of attempts, and route exhausted jobs to a terminal
`Failed` state for explicit admin action — combined with the anti-duplicate controls in 20.6A.

### 20.4 Task 4 — Authoritative job-state model

Recommended lifecycle (keep `Claimed` and `Printing` **separate** — see 20.6A):

```
Pending ──claim──▶ Claimed ──start print──▶ Printing ──ok──▶ Completed
   ▲                  │                          │
   │            lease/heartbeat            lease/heartbeat
   │              expiry (auto)              expiry (auto)
   └──────── requeue (attempt++) ◀───────────────┘
                        │
             attempts exhausted / hard error
                        ▼
                     Failed  ──admin requeue──▶ Pending
```

- **Pending → Claimed:** an authenticated, enabled agent whose `print_station_id` matches the
  job's station, via an **atomic** conditional claim (20.6A). Records claiming agent, claim
  time, lease expiry, `attempt_count++`.
- **Claimed → Printing:** the *same* agent (matching claim generation) reports it has handed the
  job to CUPS.
- **Printing → Completed:** the same agent, on CUPS success. Sets `completed_time`, marks
  visitor `badge_printed`.
- **Claimed/Printing → Pending (Recovered):** the **server** (recovery sweep) when `last_seen`
  age exceeds the timeout **and** the lease has expired. Increments a claim generation so the
  stale agent's later updates are rejected. Prefer requeuing directly to `Pending` and record
  the recovery on the job (`last_recovery_reason`) rather than adding a visible `Recovered`
  status — fewer states, and staff only care about Pending/Printing/Completed/Failed.
- **→ Failed:** on hard error or when `attempt_count` exceeds the max retry cap. Terminal until
  an admin explicitly requeues.
- **Failed → Pending:** admin action (extend the existing `reassign`/a new requeue endpoint to
  accept `Failed`).
- **Audit:** claim, print-start, completion, timeout-detected, auto-requeue (with reason),
  reassignment, **stale-update rejection**, and retry-exhaustion — none logging secrets.

### 20.5 Task 5 — Heartbeat-based recovery analysis

Because `register_agent()` runs every poll and refreshes `agent.last_seen`, recovery **can be
derived from existing data without new tables** — the *detector* needs only `last_seen` plus a
lease/generation on the job (the latter is additive columns, not a new table; see 20.6A).

Detector: a job in `Claimed`/`Printing` whose owning agent's `last_seen` is older than the
threshold **and** whose claim lease has expired becomes eligible for recovery.

1. **Recommended timeout:** **5 minutes** of `last_seen` staleness (≈ several missed poll
   cycles at the current `POLL_SECONDS`), gated by an explicit per-job **claim lease** (suggest
   lease = 2× expected print time, e.g. 90–120 s). 2 min risks duplicates on slow prints; 10
   min strands badges too long at peak. **Use lease expiry as the primary trigger and
   `last_seen` age as a corroborating guard.**
2. **Recovery target state:** **return directly to `Pending`** (auto), recording
   `last_recovery_reason`; escalate to `Failed` (admin review) only after the retry cap.
3. **Audit entries:** **Yes** — every automatic recovery writes an audit event
   (job id, old owner agent id, reason, attempt count).
4. **Notify staff:** Not required for a single silent auto-recovery, but surface **recovery
   count / stuck-job count on the dashboard** and alert when a job hits terminal `Failed`.

### 20.6 Task 6 — Agent-replacement workflow (Pi swap, same station)

1. **Ownership transfer:** admin assigns the **new** agent to the same `print_station_id` (or it
   registers and is approved, then assigned). Station ownership is by `print_station_id`, so the
   new agent immediately owns the station's `Pending` queue.
2. **Stranded jobs:** the old agent's in-flight `Claimed`/`Printing` jobs are auto-recovered by
   the lease/heartbeat sweep (20.5) → requeued to `Pending` → claimable by the new agent.
3. **Admin intervention:** required only to **approve/assign** the replacement agent (5C already
   provides approve/assign). Recovery of the stranded jobs is automatic.
4. **Auto-claimable:** yes, once recovered to `Pending` and the new agent is enabled + assigned.

> Goal satisfied: a failed Dining Hall printer no longer permanently strands badges — the lease
> sweep requeues them and the replacement Pi reprints them, with a retry cap so a genuinely
> unprintable job ends in `Failed` for staff rather than looping forever.

### 20.6A Task 6A — Claim ownership, leases, duplicate-print & retry limits

**Does `PrintJob` record the claiming agent today?** **No.** It records `printer_name` (free
string) and `claimed_time` only. There is no `claimed_by_agent_id`, no lease, no attempt count,
no generation. This is the core reliability gap.

**Smallest schema-additive design (columns on `print_jobs`, no new table required):**

| Column | Purpose |
|---|---|
| `claimed_by_agent_id` (FK → `print_agents.id`, nullable) | which agent holds the claim |
| `claim_expires_at` (DateTime, nullable) | lease expiry; primary recovery trigger |
| `claim_generation` (Integer, default 0) | monotonic token; bumped on every (re)claim/recovery |
| `attempt_count` (Integer, default 0) | retry accounting |
| `last_recovery_reason` (String, nullable) | audit/telemetry for why it was requeued |

*(Additive columns on an existing table. Because the project uses `create_all` with no
migration tooling, adding columns to an existing SQLite table **does** require a migration/
backfill story — flagged below as a prerequisite, consistent with §16–17's "no ad-hoc ALTER"
rule.)*

**Failure scenario (A claims → A stalls → server requeues → B prints → A resumes):** controls
that must hold —

- **No duplicate physical print:** atomic claim + `claim_generation`. B's successful claim bumps
  the generation. A's resumed `start-print`/`complete` carries the *old* generation and is
  rejected → A never re-sends to CUPS.
- **No stale completion:** `complete`/`status` updates must match **both** `claimed_by_agent_id`
  and `claim_generation`; a mismatch → `409`/ignored + audit `STALE_UPDATE_REJECTED`.
- **No cross-agent completion:** an agent may only transition a job it currently owns.
- **No infinite retry:** `attempt_count` capped (recommend **3**); on exceed → terminal `Failed`.

**Design comparison:**

| Mechanism | Prevents dup print? | Prevents stale complete? | Handles multi-agent? | Cost |
|---|---|---|---|---|
| Status-only (today) | ✗ (race) | ✗ | ✗ | none |
| `claimed_by_agent_id` | partial | ✓ (owner check) | partial | 1 col |
| Expiring lease | ✓ (bounded) | partial | ✓ | 1 col |
| **Claim generation/version** | ✓ (authoritative) | ✓ | ✓ | 1 col |

**Recommended minimum reliable design:** **all three of** `claimed_by_agent_id` +
`claim_expires_at` (lease) + `claim_generation` (monotonic), with the claim performed as a
single atomic conditional `UPDATE ... WHERE id=? AND status='Pending' AND print_station_id=?`.
Lease handles liveness; generation handles stale updates; agent id handles authorization.

- **`Claimed` vs `Printing` separate?** **Yes** — distinguishes "assigned but not yet at the
  printer" from "handed to CUPS," which lets recovery choose a safer policy for jobs that may
  have physically printed.
- **Max automatic retries:** **3**.
- **Terminal state after retries:** **`Failed`** (admin requeue only).
- **Admin recovery action:** requeue `Failed`/stuck job → `Pending` (extend `reassign`), or
  delete.
- **Audit events:** `CLAIM_PRINT_JOB`, `PRINT_JOB_TIMEOUT`, `PRINT_JOB_RECOVERED`,
  `PRINT_JOB_REASSIGNED`, `STALE_UPDATE_REJECTED`, `PRINT_JOB_RETRY_EXHAUSTED`.

**Multiple enabled agents per station:** **Allow, but govern.** If permitted:
- pending jobs belong to the **station**;
- only **one** agent may hold the active claim lease for a given job at a time;
- another agent may claim only **after release or lease expiration** (enforced by the atomic
  conditional claim + generation).
This makes N-agents-per-station safe (redundancy/failover) without duplicate prints.

**Migration prerequisite:** the additive columns above require a migration/backfill mechanism
before implementation, because the app currently relies on `create_all` and does not ALTER
existing tables. This is the one hard blocker for Batch 5D and should be resolved first
(minimal, reviewed migration — not ad-hoc `ALTER` at runtime).

### 20.7 Task 7 — Owner decisions required

| # | Decision | Options | Recommendation | Operational impact | Security impact | Default if no action |
|---|---|---|---|---|---|---|
| 1 | Recovery strategy | A manual / B auto / C hybrid | **C hybrid** | Self-heals rush; bounded | Neutral (server-driven, audited) | **A** (manual) — safe but strands badges |
| 2 | Recovery timeout | 2 / 5 / 10 min + lease | **5 min + 90–120 s lease** | Fast enough, low dup risk | none | 5 min |
| 3 | Auto vs manual requeue | auto→Pending / admin-only | **auto→Pending, cap 3, then Failed** | Fewer stuck jobs | none | manual only |
| 4 | Recovery audit logging | on / off | **on** (all recovery events) | Traceability | +forensics | on |
| 5 | Multi-agent per station | forbid / allow+govern | **allow + single active lease** — **RATIFIED (§20.10)** | Redundancy/failover | dup-print controlled by lease+generation | forbid (single agent) |
| 6 | Agent replacement | manual reassign / auto on approve+assign | **auto-recover stranded + admin approve/assign new** | Painless Pi swaps | new agent still needs approval (5C) | manual reassign |

### 20.8 Recommended Batch 5D implementation scope

1. **Migration prerequisite:** introduce a minimal, reviewed migration mechanism and add the
   five additive `print_jobs` columns (20.6A). *Blocker — do first.*
2. **Enforce authentication + ownership** on `pending`/`claim`/`status`/`badge-image`: require a
   valid enabled credential (wire `get_optional_print_agent` → required), derive station from
   `agent.print_station_id`, treat `?station=` as advisory, reject cross-station claims.
3. **Atomic claim** with lease + generation + `claimed_by_agent_id`; split `Claimed` vs
   `Printing`.
4. **Recovery sweep** (lease/heartbeat) → auto-requeue with `attempt_count` cap 3 → terminal
   `Failed`; full audit; stuck/recovered counts on the dashboard.
5. **Stale-update rejection** via owner + generation match.
6. **Admin requeue** path for `Failed`/stuck jobs; grace-window **exit criteria** (all active
   agents authenticating) before flipping enforcement on.

### 20.9 Validation (this pass)
- Backend pytest: **53 passed**; `py_compile`: **exit 0**; frontend test **9 passed**; build
  **success**; lint **16 (13/3)** unchanged; `git diff --check` **clean**.
- Confirmed: **no runtime behavior changed, no schema changed, no auth enforcement added, no
  migrations introduced.** Only this document (§20) was edited.

### 20.10 Ratified architecture decision (OWNER)

The owner has ratified the following authoritative model. It supersedes the "default if no
action" column for the decisions it touches and is the binding contract for Batch 5D.

> **Station = physical location.** A `PrintStation` **is** a physical badge-printing location
> (e.g. Dining Hall). It is the durable anchor; agents come and go, the station persists.
>
> **Multiple agents per station = supported.** More than one enabled `PrintAgent` may share a
> station's `print_station_id` (redundancy / failover / Pi swap overlap). *(Ratifies owner
> decision 5 → allow + govern.)*
>
> **Jobs belong to stations.** A `PrintJob` is owned by its `print_station_id`, **never** by an
> agent. The pending queue is a per-station queue.
>
> **Claim leases belong to agents.** Ownership of *work in flight* is a **transient lease** held
> by a single agent: `claimed_by_agent_id` + `claim_expires_at` + `claim_generation`. At most one
> agent holds the active lease for a given job at a time.
>
> **Recovered jobs return to the station queue.** On lease expiry / heartbeat timeout the server
> releases the lease and returns the job to its **station's `Pending` queue** — it is *not*
> reassigned to a specific agent. Any enabled agent at that station may then re-lease it.

**Binding implications for Batch 5D:**

1. **Two-level ownership.** Durable ownership = `PrintJob.print_station_id` (station). Transient
   ownership = the lease (`claimed_by_agent_id` + `claim_generation`). Authorization to *claim*
   is derived from the authenticated agent's `print_station_id` matching the job's station;
   authorization to *advance/complete* a job is derived from holding the current lease
   (matching agent id **and** generation).
2. **Atomic claim is station-scoped, lease-exclusive.** A claim succeeds only via the single
   conditional write `UPDATE ... WHERE id=? AND print_station_id=? AND status='Pending'`
   (and, for re-lease of an expired claim, `AND (claim_expires_at IS NULL OR claim_expires_at < now)`),
   which also stamps `claimed_by_agent_id`, `claim_expires_at`, and bumps `claim_generation`.
   This guarantees exactly one active lease even with N agents polling the same station.
3. **Recovery target = station Pending queue.** The recovery sweep sets the job back to
   `Pending`, clears `claimed_by_agent_id`/`claim_expires_at`, bumps `claim_generation`
   (invalidating the stale agent's later updates), increments `attempt_count`, and records
   `last_recovery_reason`. It preserves `print_station_id` — the badge stays at its physical
   location. Terminal `Failed` only after the retry cap (3).
4. **Stale-update rejection is generation-based.** Because leases move between agents at the same
   station, an owner-id check alone is insufficient; the `claim_generation` match is what makes
   "one agent completing another agent's recovered claim" impossible.
5. **Agent replacement needs no job reassignment.** A replaced Pi's stranded jobs recover to the
   station queue and any enabled agent at that station (including the replacement) re-leases
   them — no per-job admin reassignment required.

**No schema change beyond §20.6A.** This decision is fully served by the five additive
`print_jobs` columns already proposed; no new table is required. The migration prerequisite
(§20.6A / §20.8 step 1) remains the one hard blocker before implementation.

---

## 21. Batch 5D.2 — Migration Strategy & Guest Print-Status Design Review (DESIGN ONLY)

**Nature of this pass:** analysis and decision-gathering only. No application code, schema,
auth enforcement, migration, kiosk workflow, or endpoint security was changed. HEAD at review
time `6fb1535` (Batch 5C); working tree had only this document modified (§20). Baseline
re-confirmed: backend **53 passed**, `py_compile` **exit 0**, frontend **9 passed**, **build
success**, lint **16 problems (13/3)** — unchanged. Grounded in the ratified architecture
(§20.10): station = physical location, multiple agents per station, jobs belong to stations,
leases belong to agents, recovered jobs return to the station queue.

### 21.0 Grounding re-read (as-built, confirmed this pass)

| Fact | Detail | Location |
|---|---|---|
| Schema mechanism | `Base.metadata.create_all(bind=engine)` at import; **no Alembic**, no migration runner | `database.py` / import time |
| `create_all` limitation | Creates *missing tables* only. It **never** adds a column to an existing table | SQLAlchemy behavior |
| Print-job creation | `POST /api/visitors/{id}/print` — **anonymous**, returns `PrintJobResponse` incl. `id`, `status`, `station_name`, `station_slug` | `main.py:2605` |
| Per-job status read | **None anonymous.** `GET /api/print-jobs` is staff-authed and returns **all** jobs incl. `visitor_name` (PII) | `main.py:1184` |
| Badge image read | `GET /api/print-jobs/{id}/badge-image` — anonymous, returns PNG bytes (wrong shape for status) | `main.py:1153` |
| Kiosk flow | `createVisitor → uploadPhoto → generateBadge → createPrintJob → success screen → fixed 5 s timeout → home` | `App.jsx:1240-1280` |
| Response shape | `PrintJobResponse` exposes `station_name`/`station_slug` but **no** hostname/agent identity | `schemas.py` |

### 21.1 Task 1 — Migration strategy review

1. **Which features require schema evolution before Milestone 8?** Only **Batch 5D ownership/
   recovery** (the 4–5 additive `print_jobs` columns, §20.6A). The **guest status screen**
   (§21.4–21.5) requires **no schema change** — `status` and `station_name` already exist.
   No other pre-M8 feature is known to need columns.
2. **Which tables change before M8?** Only **`print_jobs`** (additive columns). `visitors`,
   `users`, `print_stations`, `print_agents`, and `print_agent_credentials` are stable.
3. **Does a migration framework now reduce future risk?** Partially. The immediate need is a
   single table gaining a few nullable/defaulted columns. SQLite supports `ALTER TABLE … ADD
   COLUMN` natively (no table rebuild) for nullable/defaulted columns, so the change itself is
   low-risk — **but** `create_all` will not apply it to already-deployed databases, and §16–17
   forbid ad-hoc runtime `ALTER`. A *reviewed, versioned* mechanism is therefore required; a
   *heavy* framework is not.
4. **Is a lightweight system sufficient?** **Yes.** An idempotent additive-migration step (a
   `schema_version` marker + guarded `ADD COLUMN` that checks `PRAGMA table_info` first) covers
   every known pre-M8 change. Full Alembic is only justified once a **non-additive** change
   (rename/drop/type-change/constraint) is genuinely required.
5. **Operational deployment impact:**
   - **Existing kiosks (frontend):** none — no local DB; served static assets.
   - **Existing print agents:** none — additive columns don't change the register/claim/status
     contract; agents keep working during the grace period.
   - **Existing SQLite databases:** each needs the additive columns applied **once**. Safe:
     `claim_generation`/`attempt_count` default `0`; the rest nullable. No data backfill beyond
     defaults; no downtime beyond a fast startup step.

**Recommendation — Option C (Hybrid).** Introduce a **minimal, reviewed, idempotent additive-
migration runner** (schema-version marker + `PRAGMA`-guarded `ADD COLUMN`), invoked once at
startup, while **keeping `create_all` for greenfield** databases. This unblocks Batch 5D on
existing deployments, honors the "no ad-hoc `ALTER`" rule by making the change a versioned,
reviewed step, and avoids the cost/risk of adopting full Alembic mid-project. **Defer Alembic**
until the first non-additive migration actually arrives. *(Rejected: Option A = premature heavy
framework for a one-table additive change; Option B = additive-only `create_all` **silently
fails** to add columns to existing databases and is therefore unsafe for live deployments.)*

### 21.2 Task 2 — Print-job ownership data-model review

| Field | Purpose | Failure it solves | What breaks without it | Complexity |
|---|---|---|---|---|
| `claimed_by_agent_id` | Records the agent holding the lease | Cross-agent completion | Any agent can complete/fail another agent's job; no ownership check possible | 1 nullable FK |
| `claim_expires_at` | Lease/liveness; **primary recovery trigger** | Dead/stalled agent stranding a job | Jobs stuck in `Printing` forever; no auto-recovery (today's core gap) | 1 nullable DateTime + sweep |
| `claim_generation` | Monotonic token bumped on each (re)claim/recovery | Stale completion after re-lease **by the same agent** | A late update from a previous lease corrupts state / risks duplicate accounting even when owner-id matches | 1 int (default 0) + checks |
| `attempt_count` | Retry accounting | Runaway ret/-loop on an unprintable job | A genuinely bad job loops forever, never reaching terminal `Failed` | 1 int (default 0) |
| `last_recovery_reason` | Audit/telemetry only | *(none — observability)* | Weaker forensics; **no functional break** (can be logged to `audit.log` instead) | 1 nullable String |

**Absolute minimum field set:**

| Requirement | Minimum field(s) |
|---|---|
| Ownership enforcement | `claimed_by_agent_id` |
| Stale-agent recovery | `claim_expires_at` (lease) |
| Duplicate-print prevention | `claim_generation` |
| Retry exhaustion | `attempt_count` |

**Minimum reliable design = 4 columns** (`claimed_by_agent_id`, `claim_expires_at`,
`claim_generation`, `attempt_count`). `last_recovery_reason` is **recommended but optional** —
audit-only, and can instead be written to `audit.log`. **Note on generation vs owner-id:**
owner-id alone rejects a stale completion *only when the job was re-leased to a different agent*;
it does **not** catch a stale update from a **previous lease held by the same agent** that then
re-claimed the requeued job. `claim_generation` is what makes that case safe, so it stays in the
minimum set. All four are one column each; the operational cost is the recovery sweep + the
generation/owner checks on advance/complete, not the storage.

### 21.3 Task 3 — Multiple agents per station analysis

Authoritative model (§20.10): a **station is a physical location** (Front Door, Back Door) and
may host several agents (`FrontDoorPi01/02/03`). Evaluation:

1. **Operational advantages:** hot-swap or add a Pi at a busy door without re-routing jobs;
   routing targets a *place*, not a device; zero job-config change when hardware rotates.
2. **Failure-recovery advantages:** if one Pi dies, its siblings keep draining the same station
   queue; recovered jobs return to the **station** queue (§20.10) and any sibling re-leases them
   — no admin reassignment, no stranded badges.
3. **Load-balancing implications:** N agents polling one station queue self-balance via the
   atomic station-scoped claim (natural work-stealing); no central dispatcher needed.
4. **Claim-lease behavior:** the single conditional `UPDATE … WHERE id=? AND print_station_id=?
   AND status='Pending'` guarantees **exactly one active lease** even with N concurrent pollers;
   losers get `409` and move on.
5. **Dashboard implications:** show **per-station** aggregates (pending/printing/completed/failed)
   plus an agent-liveness list (last_seen per agent); do **not** surface per-agent job routing to
   staff — they think in locations.
6. **Staffing implications:** matches the staff mental model ("the Front Door printers");
   training and troubleshooting are location-based, not hostname-based.

**Rejected alternative — station = physical printer** (`front-door-1/2/3`): each printer is its
own station, so a job is pinned to one device at enqueue time. Consequences: **no automatic
failover** (a job pinned to `front-door-2` strands if that Pi dies — requires manual reassign);
operators manage N stations per doorway; visitor messaging leaks device identity; every hardware
swap is a config event. **Location-stations remain preferred** because jobs route to a *place*
with transparent redundancy, whereas printer-stations couple every job to a fragile single
device.

### 21.4 Task 4 — Guest print-status experience review

The proposed temporary status screen (progress steps for record/photo/nametag/printer, then poll
job status → friendly per-state copy → success + auto-return countdown) is a **UX improvement
over today's fixed 5-second success timeout**, which currently claims success before the badge
has actually printed. Reviewed against the constraint that the visitor cares about **one thing —
where to pick up the badge** — the design is sound *provided* messaging maps internal states to a
small friendly set (§21.6) and never blocks the kiosk (must have a max-wait fallback). It should
be treated as its **own batch (5E)**, independent of the 5D schema work, because it needs no
columns; only the richer `Claimed` state text depends on 5D landing first.

### 21.5 Task 5 — Status-screen feasibility analysis

1. **Existing endpoints that could support polling:** `POST /api/visitors/{id}/print` already
   returns the job `id`, `status`, and `station_name` on creation (anonymous). That seeds the
   screen. **No anonymous per-job status read exists.**
2. **Missing endpoints required:** a **new** anonymous, **minimized** `GET /api/print-jobs/{id}/
   status` returning **only** `{ status, station_name }` — mirroring the §19.9
   `VisitorCheckoutLocatorResponse` minimization pattern. The existing `GET /api/print-jobs` is
   unusable here (staff-authed and returns `visitor_name`/all jobs — PII leak); the badge-image
   route returns bytes, not status.
3. **Additional schema requirements:** **none.** `status` is stored; `station_name` is a join on
   `print_station_id`. The status screen is fully decoupled from the 5D column work.
4. **Impact on anonymous kiosk workflow:** replaces the fixed 5 s success timeout with
   poll-until-terminal + countdown. Must cap polling (e.g. stop after a max wait) and fall back
   to a neutral "see a staff member" message so a stalled queue never freezes the kiosk. **No
   auth added**; endpoint stays anonymous but minimized and should be lightly rate-limited.
5. **Can the station name be safely shown?** **Yes** — it's a physical location, already exposed
   by `PrintJobResponse`, and is exactly what the visitor needs.
6. **Should the print-agent name be shown?** **No** — hostname/agent identity is internal, leaks
   device topology, and is meaningless to visitors.

**Option A ("Ready for pickup at Front Door") vs Option B ("Printed at FrontDoorPi03") —
recommend Option A.** A uses the durable **station name** the visitor can act on; B leaks a
transient hostname, confuses guests, and couples the message to a device that may be swapped mid-
event. The minimized status endpoint should therefore **not** carry `printer_name`/hostname.

### 21.6 Task 6 — Failure scenarios & visitor messaging

Principle: collapse many internal states into a few friendly buckets; **never** surface device,
agent, or security internals; always provide a max-wait fallback.

| Scenario | Internal reality | Visitor message |
|---|---|---|
| A. Printer offline | Job pinned `Pending`/`Printing`, no agent draining | "Your nametag is waiting to print." → after max-wait: **"This is taking longer than expected — please see a staff member."** |
| B. Agent disabled | Siblings may still print; if none, queue stalls `Pending` | Same "waiting" → escalation copy. Never reveal agent state. |
| C. Agent revoked | Same visitor-visible effect as disabled | Same "waiting" → escalation copy. |
| D. Job recovered | Transient: status returns to `Pending`/`Printing`, generation bumped | Show "waiting"/"printing" again — recovery is **invisible**; no alarming message. |
| E. Job reassigned | `station_name` changes (admin moved it) | "Ready for pickup at **{new station}**" — poll reflects it naturally. |
| F. Multiple agents active | One wins the lease; others `409` | Single status; pickup location = **station**; never name the agent. |

**Recommendation:** implement the 5-bucket mapping (Pending / Claimed / Printing / Completed /
Failed) plus a **max-wait escalation** to the staff-member message; recovery and multi-agent
churn stay hidden behind the "waiting"/"printing" copy.

### 21.7 Task 7 — Owner decisions required

| # | Decision | Options | Recommendation | Operational impact | Security impact | Default if no action |
|---|---|---|---|---|---|---|
| 1 | Migration strategy | A heavy framework now / B additive-only `create_all` / C lightweight hybrid | **C — minimal reviewed additive runner; defer Alembic** | Unblocks 5D on existing DBs; small startup step | Reviewed/versioned; no ad-hoc `ALTER` | B — **unsafe** (columns never reach existing DBs) |
| 2 | Minimum ownership fields | 4 (owner+lease+gen+attempts) / 5 (+reason) | **5 (recommended)**; 4 is the hard minimum | Adds recovery + generation checks | Ownership + stale-reject enforceable | *(none — 5D blocked)* |
| 3 | Claim-lease timeout | 60 / 90–120 / 180 s | **90–120 s (2× print time)** + 5 min `last_seen` guard | Fast recovery, low dup risk | none | 90–120 s |
| 4 | Retry limit | 2 / 3 / 5 | **3, then terminal `Failed`** | Bounds runaway retries | none | 3 |
| 5 | Multi-agent per station | forbid / **allow + single active lease** | **allow + single active lease** (ratified §20.10) | Redundancy/failover | dup-print bounded by lease+generation | allow (ratified) |
| 6 | Guest print-status screen | keep 5 s timeout / poll-until-terminal screen | **poll-until-terminal screen (Batch 5E)** | Accurate pickup UX; needs 1 new minimized endpoint | New endpoint stays anonymous + minimized | keep 5 s timeout |
| 7 | Auto return-to-home delay | 5 / 8 / 10 s after terminal | **8 s after a terminal state** (or immediate on Completed + short hold) | Readable without blocking the kiosk | none | 5 s (current) |
| 8 | Visitor messaging strategy | station-name (A) / device-name (B) | **A — station name only; hide agent/hostname** — **RATIFIED (§21.10)** | Actionable pickup message | No device/topology leak | A (safe default) |

### 21.8 Recommended next implementation order

1. **Batch 5D Step 0 (blocker):** minimal reviewed additive-migration runner (Option C) +
   apply the **4–5** `print_jobs` columns (§21.2). Idempotent, `PRAGMA`-guarded, greenfield via
   `create_all`.
2. **Batch 5D:** enforce auth + station ownership on `pending`/`claim`/`status`/`badge-image`
   (grace-exit gated); atomic station-scoped lease-exclusive claim; split `Claimed` vs
   `Printing`; recovery sweep (lease + `last_seen`) → requeue to station queue, cap 3 → terminal
   `Failed`; generation-based stale-update rejection; admin requeue path; audit events per
   §20.6A.
3. **Batch 5E (independent of schema, can precede or follow 5D):** add anonymous **minimized**
   `GET /api/print-jobs/{id}/status` (`{status, station_name}` only); kiosk poll-until-terminal
   status screen with the 5-bucket messaging (§21.6), Option-A location copy, max-wait
   escalation, and configurable auto-return countdown. The `Claimed` state text only appears
   once 5D lands.

### 21.9 Validation (this pass)
- Backend pytest: **53 passed**; `py_compile`: **exit 0**; frontend test **9 passed**; build
  **success**; lint **16 (13/3)** unchanged; `git diff --check` **clean**; `git status --short`
  shows only this document modified.
- Confirmed: **no runtime behavior changed, no schema changed, no migrations introduced, no auth
  enforcement added, no endpoint security modified, no kiosk workflow changed.** Only this
  document (§21) was edited.

### 21.10 Ratified architecture decision (OWNER) — station model & visitor-facing identity

The owner has ratified the following. It is binding for Batch 5D (enforcement/recovery) and
Batch 5E (guest print-status screen), and supersedes the "default if no action" column for the
decisions it touches. It extends §20.10 with an explicit **visitor-facing identity boundary**.

> **Station = physical location.** A `PrintStation` is a physical place — Front Door, Back Door,
> Dining Hall. It is the durable anchor.
>
> **Agents = printing devices assigned to a station.** `PrintAgent` rows are devices
> (`FrontDoorPi01`, `FrontDoorPi02`, `FrontDoorPi03`) that attach to a station via
> `print_station_id`. **Multiple agents per station is supported.**
>
> **Jobs belong to stations. Claim leases belong to agents. Recovered jobs return to the
> station queue.** *(Reaffirms §20.10.)*
>
> **Visitors see station names only.** Visitors **never** see agent names, hostnames, printer
> names, IP addresses, or any internal identifier. Visitor-facing print-status messages are
> **location-based** — e.g. *"Ready for pickup at Front Door."*, never *"Printed by
> FrontDoorPi03."*

**Binding implications:**

1. **Visitor identity boundary (ratifies decision 8 → Option A).** Any anonymous/kiosk-facing
   surface may expose **`station_name` only**. `printer_name`, agent `hostname`, `agent_key`,
   `last_ip`, and every other device/agent identifier are **prohibited** from visitor-facing
   responses and copy.
2. **Batch 5E status endpoint shape is fixed.** The new anonymous `GET /api/print-jobs/{id}/
   status` returns **only** `{ status, station_name }` (§21.5). It must **not** carry
   `printer_name`/hostname/IP. This mirrors the §19.9 minimization pattern and is now a hard
   constraint, not a preference.
3. **Messaging is location-based.** All five visitor buckets (§21.6) reference the **station**;
   recovery, re-lease, and multi-agent churn stay invisible to the visitor.
4. **Staff surfaces are unaffected.** Authenticated staff/admin views may still show agent
   hostnames, `last_seen`, and device diagnostics — the boundary applies to **visitor-facing**
   surfaces only.

**No schema or runtime change in this pass.** This decision is a documentation ratification; it
constrains how Batch 5D/5E responses are shaped but introduces no columns, endpoints, or
behavior here.

---

## 22. Station Routing Architecture Lock — Milestone 5.9 (COMMITTED, LOCKED)

**Nature of this checkpoint:** the station-routing implementation is complete and has been
**locked to a single deterministic path** with a regression-prevention audit. This section
records the milestone; the work itself shipped across three commits and the working tree is
clean at HEAD `ec37f33` (`Milestone 5.8.14`). This documentation update is the **Milestone 5.9**
commit.

> **Batch-naming note.** "Station routing" is distinct from the *planned* Batch 5E guest print-
> status screen in §21.4 (still not started). The milestone numbering moved to the `5.8.x` line
> during this work (`git log`: `5.8.12` → `5.8.13` → `5.8.14`); `Milestone 5.9` rolls that line
> up to mark the routing architecture as locked.

### 22.1 The one deterministic chain

Station assignment has exactly one path, captured from the kiosk/QR **URL path** at check-in and
persisted on the visitor as the single source of truth:

```
URL path → visitor.print_station_id → print_job.print_station_id → agent (station-matched lease)
```

No query params, no request-body station override, no default value, no fallback, no client-
driven selection. An unresolved/unknown/disabled station **fails closed** (HTTP 400) and no
visitor or print job is created.

### 22.2 Delivering commits

| Commit | Milestone | What it delivered |
|---|---|---|
| `bbe5d05` | 5.8.12 | Capture check-in station on the visitor; derive the print station server-side. |
| `0ebc616` | 5.8.13 | **Final hardening** — strict single-path, fail-closed: URL path is the only station source; `create_visitor` 400s on missing/unknown/disabled slug; `create_print_job` derives station **only** from `visitor.print_station_id` (dropped the body param/fallback); rewrote `test_station_routing.py` (9 strict tests). |
| `ec37f33` | 5.8.14 | **Regression lock** — removed the reassign dual-path (endpoint + `PrintJobReassign` schema + `reassignPrintJob` API + modal/state), removed the unused `PrintJobCreate` schema, removed the print-agent `DEFAULT_PRINT_STATION_SLUG` fallback, neutralized the client-driven staff station dropdown (now read-only `/{slug}` display), and added `test_no_reassign_route_exists`. |

### 22.3 Regression-prevention audit (verification only — no code change)

Every site that writes `print_station_id` was re-scanned and classified. All originate from the
chain or the legitimate **agent node**; no alternate source exists.

| Write site | Source | Verdict |
|---|---|---|
| `create_visitor` (`main.py`) | `station` resolved from the URL-path slug (`visitor.station`), enabled-only, fail-closed 400 | Chain entry |
| `create_print_job` (`main.py`) | Derived **only** from `visitor.print_station_id`; fail-closed if `None`/disabled | Chain |
| `checkin_again` (`main.py`) | Carry-over from `original.print_station_id`; no client override | Chain |
| `assign_print_agent` (`main.py`) | Admin binds an **agent** to a station | Agent node (terminal), not visitor routing |
| Agent self-test label (`main.py`) | The agent's **own** assigned station | Agent node |
| Station QR label (`main.py`) | The station printing **its own** QR sign | Station-scoped admin action |

All other `print_station_id` references are reads/comparisons — the agent-layer match
enforcement (jobs rejected when `print_job.print_station_id != agent.print_station_id`) and the
pending-jobs filter by `agent.print_station_id`, ensuring agents consume only matching-station
jobs. Frontend `getPrintStationSlug()` reads `window.location.pathname` **only** (no query
param); its value is sent to `createVisitor` at a single point and is otherwise read-only display.
No `?station`, `location.search`, `URLSearchParams`, request-body station override, `reassign`,
default, or fallback exists in backend, frontend, or print-agent.

### 22.4 Validation

- Backend pytest **80 passed**; `py_compile` **exit 0**.
- Frontend test **9 passed**; build **success**; lint **14 problems (13 errors, 1 warning)** —
  down from the §21 baseline of 16 (removed two dead-variable warnings when the reassign/dropdown
  state was deleted); no new problems introduced.
- `git diff --check` **clean**; working tree clean at `Milestone 5.8.14`.

### 22.5 Standing constraint (regression prevention)

The routing architecture is **locked**. Future work must not reintroduce any station assignment
outside `URL → visitor → job → agent`: no query-param routing, no default values, no request-body
overrides, and no reassign or equivalent secondary-assignment mechanism. `test_no_reassign_route_exists`
and the strict `test_station_routing.py` suite guard against regression.

**Suggested commit message:**
`Milestone 5.9: station-routing architecture lock — single deterministic URL→visitor→job→agent path; regression-prevention audit (docs)`
