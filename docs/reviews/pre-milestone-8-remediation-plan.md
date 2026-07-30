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
| 3 — AuthN/AuthZ (DB-backed user, admin role) | F-002, F-003 | 2 | Not started |
| 4 — Repository & secret hygiene | F-001, F-007, F-027, STAFF_* removal | 2 | Not started |
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
