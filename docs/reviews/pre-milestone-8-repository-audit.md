# Pre-Milestone 8 Repository Audit

**Repository:** PBC-guest-kiosk (`stemy-msft/PBC-Guest-Kiosk`, branch `main`)
**Audit date:** 2026-07-30
**Type:** Inspection and reporting only. No application code, configuration, database, migrations, dependencies, tests, or documentation were modified. This file is the only artifact created.

> **Secret-handling note:** Real secret values discovered in tracked files (a JWT signing key and a staff password) are **redacted** throughout this report as `[REDACTED]`. Their existence is reported; their values are not reproduced here.

---

## 1. Executive Summary

### Overall readiness assessment
The application is feature-complete for a single-site kiosk and the code **compiles/parses cleanly** (Python `py_compile` passes; the Vite frontend lints with errors but is structurally intact). However, the repository has **several confirmed Critical/High issues centered on secrets management and broken access control** that make it unsafe to advance into Milestone 8 without remediation.

### Should Milestone 8 proceed?
**No — not without addressing the blockers below.** The two dominant risks are:

1. **Committed secrets.** `.env` (containing the JWT signing key and a staff password) and `print-agent/.env` are tracked in git, and `.env.example` ships a real-looking JWT key and password. The signing key must be treated as compromised and rotated.
2. **No server-side authorization.** Every authenticated endpoint uses only `get_current_user` (proves authentication, not role). Any authenticated staff account can create Administrator users, reset the admin password, change roles, disable users, and change system settings. Frontend role gating is cosmetic (role is read from `localStorage`). This is a broken-access-control / privilege-escalation defect and contradicts the role model in the requirements document.

### Critical and high-risk themes
- Secrets and a real SQLite database (`visitor_kiosk.db.old`) and the entire `.venv/` are committed to the repo.
- Authorization is authentication-only; roles are never enforced on the backend.
- Several public, integer-ID endpoints allow IDOR/enumeration of visitor PII and print jobs.
- A frontend field-name mismatch (`report.visitorTypes`) will crash the Reporting screen.
- No automated tests exist anywhere in the repository.

### Explicit review limitations
- **Runtime behavior was not exercised.** Importing `backend/app/main.py` has **import-time side effects** (`Base.metadata.create_all()`, `create_default_admin()`, directory creation). To honor "do not alter the database," the backend was **not imported or started**; findings marked *Needs runtime verification* require a live run against a disposable database.
- `frontend/src/App.jsx` is 6,603 lines and `backend/app/main.py` is 2,109 lines. All backend routes and the API layer were read in full; App.jsx was read structurally (state, effects, session handling, role gating, reporting, list rendering) plus the full ESLint pass — a few deeply nested render branches were sampled rather than read line-by-line.
- The working tree was **not clean** at review start (see §3); in-progress edits were left untouched.

---

## 2. Repository and Architecture Inventory

### Main components
| Component | Path | Notes |
|---|---|---|
| Backend API | `backend/app/` | FastAPI monolith. All ~50 routes in `main.py` (2,109 lines). |
| Frontend | `frontend/src/` | React/Vite single-file app `App.jsx` (6,603 lines) + `api.js` (827 lines). |
| Print agent | `print-agent/print_agent.py` | CUPS/`lp`-based poller for Raspberry Pi. |
| Docs | `docs/` | ADMINISTRATION, CHEATSHEET, INSTALL, KNOWN_GOOD_BUILD, PRINT-SERVER, TROUBLESHOOTING. |

### Runtime entry points
- **Backend:** `backend/app/main.py` — module top level runs `Base.metadata.create_all(bind=engine)`, opens a session and calls `create_default_admin(db)`, configures logging, mounts `/uploads`, and defines all routes on a module-level `app = FastAPI(...)`.
- **Frontend:** `frontend/src/main.jsx` → `App.jsx` (`export default function App()`).
- **Print agent:** `print-agent/print_agent.py` (script `__main__` loop; uses `lp`).

### Data stores
- **SQLite** `sqlite:///visitor_kiosk.db` — hardcoded in `backend/app/database.py` (env `DATABASE_URL` is **ignored**). Relative path → depends on process CWD.
- **File uploads** under `backend/uploads/{photos,badges,qr-codes}`.
- **System settings** JSON: `backend/config/system_settings.json`.
- Models: `Visitor`, `PrintJob`, `User`, `PrintStation`, `PrintAgent` (`backend/app/models.py`).

### Authentication boundaries
- JWT (HS256) issued at `/api/auth/login`; validated by `get_current_user` in `backend/app/auth.py`. The dependency decodes the token and returns the `sub` (username) **without any DB lookup** — no enabled/existence/role check.
- Frontend stores `access_token`, `username`, `role` in `localStorage`.

### Public, staff, admin, and print-agent surfaces
See the full matrix in §6. Summary:
- **Public (no auth):** kiosk check-in/photo/badge/print/checkout, returning-visitor `find`, print-station list, print-agent register/heartbeat/pending/claim/status/badge-image, `/`, `/health`, `GET /api/settings`.
- **Staff-authenticated (auth only, no role check):** dashboard, active/search/history/update visitor, users CRUD, settings update, print-job/station/agent management, reporting.
- **Administrator-only:** *none enforced server-side.* Intended admin actions are gated **only** in the React UI.
- **Print-agent:** register/heartbeat/pending/claim/status/badge-image — unauthenticated (agent token is optional and unverified).

---

## 3. Validation Commands Executed

| # | Command | Result | Relevant output / limitation |
|---|---|---|---|
| 1 | `git status` / `git branch --show-current` | **Dirty working tree** | Modified but uncommitted: `backend/app/main.py`, `frontend/src/App.jsx`, `frontend/src/api.js`, and a tracked `backend/app/__pycache__/main.cpython-313.pyc`. Branch `main`. In-progress edits left untouched. |
| 2 | `git ls-files` (filtered) | **Tracked artifacts found** | `.env`, `print-agent/.env`, entire `.venv/` (**3,128 files**), 10 `*.pyc`, and `backend/visitor_kiosk.db.old` are tracked despite `.gitignore`. |
| 3 | `git diff` on the 3 modified files | In-progress session-handling work | `api.js` diff *adds* the `401/403 → handleUnauthorized()` block to the shared `handleResponse` and routes `getDashboardStats` through it; `App.jsx` diff is a version-string bump (`0.7.9 Alpha`→`Beta`). |
| 4 | `python -m py_compile` on all 9 backend `.py` + `print_agent.py` | **PASS (exit 0)** | No syntax errors. Did **not** import/execute (avoids DB side effects). |
| 5 | `npm run lint` (`eslint .`) in `frontend/` | **FAIL (exit 1): 18 problems (15 errors, 3 warnings)** | Confirms ~13 unused symbols, a `no-undef` (`handleUnauthorized`) in dead code, `set-state-in-effect`, and 3 `exhaustive-deps`. Full list in §5/§7. |
| 6 | `file_search`/`Get-ChildItem` for test files & runners | **No tests found** | No `test_*.py`, no `*.test.jsx`, no `pytest.ini`/`conftest.py`/`vitest.config.*`/`pyproject.toml`. Zero automated coverage. |
| 7 | Header inspection of `backend/visitor_kiosk.db.old` | **Real SQLite DB, 65,536 bytes** | Magic `SQLite format 3`. Tracked in git; likely contains visitor PII. Not read/opened. |

Backend was intentionally **not started** (import-time DB creation) — see §1 limitations.

---

## 4. Findings Summary

| ID | Sev | Confidence | Category | File | Short title | M8 blocker |
|---|---|---|---|---|---|---|
| F-001 | Critical | Confirmed | Secrets/Config | `.env`, `print-agent/.env`, `.env.example` | Secrets committed to git; example ships real key | **Yes** |
| F-002 | Critical | Confirmed | AuthZ | `backend/app/main.py` (users/settings routes) | No server-side role enforcement → privilege escalation | **Yes** |
| F-003 | High | Confirmed | AuthZ/Session | `backend/app/auth.py:50` | `get_current_user` skips DB; disabled user's token stays valid | **Yes** |
| F-004 | High | Confirmed | Public/IDOR | `backend/app/main.py` (print/visitor routes) | Unauthenticated, enumerable print/visitor endpoints | **Yes** |
| F-005 | High | Confirmed | Data exposure | `backend/app/main.py:1258,707` | Public station list + agent_key/internal IPs exposed | Should |
| F-006 | High | Confirmed | Stability | `frontend/src/App.jsx:4650` | `report.visitorTypes` undefined → Reporting screen crash | **Yes** |
| F-007 | Critical | Confirmed | Repo hygiene | `backend/visitor_kiosk.db.old`, `.venv/` | Real DB + full venv committed | **Yes** |
| F-008 | Medium | Confirmed | CORS | `backend/app/main.py:66` | `allow_origins=["*"]` + `allow_credentials=True` | Should |
| F-009 | Medium | Confirmed | Auth hardening | `backend/app/main.py:590` | No login lockout / rate limiting | Should |
| F-010 | Medium | Needs runtime verification | Upload security | `backend/app/main.py:2318` | Photo upload: no type/size/decompression-bomb guard | Should |
| F-011 | High | Confirmed | Data integrity | `backend/app/main.py:1471` | `delete_print_station` ignores PrintJob FK → 500 | Should |
| F-012 | Medium | Needs runtime verification | Concurrency | `backend/app/main.py:1067` | `claim_print_job` non-atomic; no station-ownership check | Should |
| F-013 | Medium | Confirmed | Data/Time | `backend/app/main.py:895,1533` | `utcnow()` vs local `now()` inconsistency | Should |
| F-014 | Medium | Confirmed | Stability/UX | `backend/app/main.py:515` | Station "online" never expires (staleness ignored) | Should |
| F-015 | Medium | Confirmed | Frontend bug | `frontend/src/App.jsx:305` | Settings `required_returning_checkin_fields` ignored (camelCase typo) | Should |
| F-016 | Medium | Confirmed | Dead/duplicate | `frontend/src/App.jsx:340-360` | Unused duplicate `handleResponse` (401-only) w/ `no-undef` | Should |
| F-017 | Medium | Confirmed | Session UX | `frontend/src/api.js` (many) | ~22 API fns bypass shared handler → no session-expiry handling | Should |
| F-018 | Low | Confirmed | Data model | `backend/app/main.py` (search/history) | Visitor-as-person-and-visit: name-based grouping fragile | Defer (M8) |
| F-019 | Medium | Confirmed | Migrations | `backend/app/main.py:56` | `create_all()` at import; no Alembic; no migration path | Should |
| F-020 | Low | Confirmed | Audit logging | `backend/app/main.py:906` | `audit()` mislabeled args on agent register | Should |
| F-021 | Low | Confirmed | Audit coverage | `backend/app/main.py` (public routes) | No audit events for kiosk check-in/checkout/print | Defer (M8) |
| F-022 | Low | Confirmed | Dead code | `backend/app/main.py`, `auth.py` | Debug prints, unused imports/vars, duplicate log lines | Should |
| F-023 | Low | Confirmed | Dead code | `frontend/src/App.jsx` (ESLint) | ~13 unused functions/vars | Defer (M8) |
| F-024 | Low | Confirmed | Dead code | empty `.jsx` scaffolds | 9 zero-byte component/screen files tracked | Defer (M8) |
| F-025 | Low | Confirmed | Broken client fn | `frontend/src/api.js:525` | `disablePrintStation` calls nonexistent route | Should |
| F-026 | Low | Confirmed | Dependencies | `backend/requirements.txt` | `git-filter-repo` shipped as runtime dep; `qrcode` unpinned | Should |
| F-027 | Low | Confirmed | Config drift | `backend/app/database.py:4` vs `.env.example` | `DATABASE_URL`/`STAFF_*`/`PRINT_AGENT_URL` documented but ignored | Should |
| F-028 | Medium | Needs runtime verification | Logging | `backend/app/main.py:97-135` | Module-level log handlers → duplicate handlers under `--reload` | Defer (M8) |
| F-029 | Low | Confirmed | Startup validation | `backend/app/auth.py:29` | Missing `JWT_SECRET_KEY` fails only at login, not startup | Should |
| F-030 | High | Confirmed | Testing | (whole repo) | No automated tests exist | Should |
| F-031 | Medium | Confirmed | Doc drift | `visitor-kiosk-requirements-v0.1.md` vs code | Role separation specified but not enforced | Should |
| F-032 | Low | Confirmed | Frontend perf/quality | `frontend/src/App.jsx:237,213,303` | `setState` in mount effect; missing effect deps | Defer (M8) |

---

## 5. Detailed Findings

### F-001 — Secrets committed to git; example file ships real-looking secrets
- **Severity:** Critical · **Confidence:** Confirmed · **Category:** Secrets/Configuration
- **Files:** `.env` (tracked), `print-agent/.env` (tracked), `.env.example`
- **Symbols:** `JWT_SECRET_KEY`, `STAFF_PASSWORD`, `PBC_PRINT_AGENT_KEY`
- **Problem:** `.gitignore` lists `.env`, but `.env` and `print-agent/.env` are already **tracked** (`git ls-files` confirms) — `.gitignore` does not untrack committed files. `.env.example` additionally contains a **real-looking JWT signing key** (`JWT_SECRET_KEY=[REDACTED]`) and `STAFF_PASSWORD=[REDACTED]`.
- **Evidence:** `git ls-files` → `.env`, `print-agent/.env`; `.env.example` contents show a populated `JWT_SECRET_KEY` and `STAFF_PASSWORD` (values redacted here).
- **Abuse scenario:** Anyone with repo read access obtains the JWT signing key and can **forge valid staff tokens** (`sub` = any username) that pass `get_current_user`, fully bypassing login.
- **Recommendation:** Treat the key as compromised: **rotate `JWT_SECRET_KEY`**, change staff/admin passwords, `git rm --cached` the `.env` files, replace `.env.example` values with placeholders, and purge secrets from history (e.g., `git filter-repo`) before any wider distribution.
- **Scope:** Config + secret rotation + history rewrite (coordinate with anyone holding clones).
- **Blocks M8:** **Yes.**
- **Regression risk:** History rewrite changes commit hashes; coordinate. Rotating the key invalidates existing tokens (users re-login) — acceptable.
- **Verify after fix:** `git ls-files | Select-String '\.env$'` returns nothing; new key differs from the exposed value; login still issues working tokens.

### F-002 — No server-side authorization (privilege escalation)
- **Severity:** Critical · **Confidence:** Confirmed · **Category:** Authorization
- **File:** `backend/app/main.py` — `create_user` (1775), `update_user` (1817), `reset_password` (1865), `update_user_status` (1908), `update_settings` (559), `get_users` (1768)
- **Problem:** These endpoints depend only on `get_current_user` (authentication). `get_current_user` returns a username string and performs **no role check**. There is no admin-only dependency anywhere in the codebase. The `role` field exists on `User` but is never enforced.
- **Evidence:** Every route signature is `current_user: str = Depends(get_current_user)`; there is no `require_admin`/role dependency. Frontend gates admin screens with `role === "Administrator"` (App.jsx:5021, 5339) using a value read from `localStorage` (App.jsx:234), which the client controls.
- **Abuse scenario:** A low-privilege `CheckInStaff` account (or anyone who can reach the API with any valid token) calls `POST /api/users` with `role: "Administrator"`, or `POST /api/users/{admin_id}/reset-password` to seize the admin account, or `PUT /api/settings` to alter system behavior.
- **Recommendation:** Add a role-aware dependency that loads the `User` from the DB and asserts `role == "Administrator"` for user-management and settings-write endpoints. (Do not implement during this audit.)
- **Scope:** New dependency + apply to ~6 routes; keep frontend gating as defense-in-depth.
- **Blocks M8:** **Yes.**
- **Regression risk:** Legitimate non-admin staff lose access to admin actions (intended). Ensure the seeded admin can still operate.
- **Verify after fix:** Non-admin token receives 403 on user-management/settings-write; admin token succeeds.

### F-003 — `get_current_user` never checks the database
- **Severity:** High · **Confidence:** Confirmed · **Category:** Authorization/Session
- **File:** `backend/app/auth.py:50-73`
- **Problem:** The dependency decodes the JWT and returns `payload["sub"]` with no DB lookup. A user disabled via `update_user_status`/`update_user` keeps a valid token until expiry (`JWT_EXPIRE_MINUTES`, default **480 = 8h**). Role changes are likewise not reflected until re-login.
- **Evidence:** `auth.py` body returns `username` directly; only `login` checks `user.enabled`.
- **Abuse scenario:** Admin disables a compromised/terminated staff account, but that account continues to call protected endpoints for up to 8 hours.
- **Recommendation:** Load the `User` in the dependency; reject if missing or `enabled is False`; optionally return the `User` object so routes can enforce role (supports F-002).
- **Scope:** `auth.py` dependency + minor route signature updates.
- **Blocks M8:** **Yes** (pairs with F-002).
- **Regression risk:** Adds one query per request (acceptable for this scale).
- **Verify after fix:** Token for a now-disabled user returns 401/403.

### F-004 — Unauthenticated, enumerable print/visitor endpoints (IDOR)
- **Severity:** High · **Confidence:** Confirmed · **Category:** Public surface / IDOR
- **File/routes:** `GET /api/print-jobs/{id}/badge-image` (948), `PUT /api/print-jobs/{id}/claim` (1067), `PUT /api/print-jobs/{id}/status` (1186), `GET /api/print-jobs/pending` (1035), `PUT /api/visitors/{id}/checkout` (2295), `POST /api/visitors/{id}/photo` (2318), `POST /api/visitors/{id}/badge` (2351), `POST /api/visitors/{id}/print` (2388), `POST /api/visitors` (1952), `GET /api/visitors/find` (2150).
- **Problem:** None of these require authentication and all key on sequential integer IDs. `badge-image` returns a PNG containing visitor name/photo/host (PII). `checkout` lets anyone check out any visitor by ID. `status` (public) can mark a job `Completed`, which flips `visitor.badge_printed = True`. `find` returns full `VisitorResponse` (phone/email/notes/vehicle) for partial-name queries.
- **Evidence:** Route signatures have no `Depends(get_current_user)`; `get_print_job_badge_image` does `Path(print_job.badge_path)` and returns `FileResponse`.
- **Abuse scenario:** An attacker on the LAN enumerates `/api/print-jobs/1..N/badge-image` to harvest visitor photos/PII, or POSTs `/api/visitors/{id}/checkout` to sabotage the on-campus roster.
- **Realistic tradeoff:** The kiosk check-in/photo/badge/print flow is **intentionally public** (unauthenticated kiosk). The print-agent endpoints are **intentionally used by an unauthenticated agent** (see §8). But `checkout` and `find` returning full PII, and unbounded ID enumeration, exceed what the kiosk role requires.
- **Recommendation (report only):** Decide the trust boundary in M8: at minimum, restrict `badge-image`/`status`/`claim` to an authenticated print agent (agent token is already plumbed but unverified — see §8), narrow `find`'s response fields, and consider network-level isolation. Do **not** naively add staff JWT to agent endpoints without the agent-auth analysis in §8.
- **Scope:** Boundary decision + targeted auth; non-trivial.
- **Blocks M8:** **Yes** for the PII-exposing `badge-image`/`find`; the kiosk-intended writes may be accepted with compensating controls.
- **Verify after fix:** Unauthenticated `badge-image` returns 401 (or agent-token required); `find` returns only fields the kiosk needs.

### F-005 — Public data exposure of infrastructure and agent keys
- **Severity:** High · **Confidence:** Confirmed · **Category:** Data exposure
- **Files:** `GET /api/print-stations` (1258, **no auth**) returns `print_server_host` and `last_ip`; `GET /api/print-agents` (707) returns `agent_key` to any authenticated user.
- **Problem:** `PrintStationResponse` includes internal hostnames/IPs; the public station list leaks internal network topology. `agent_key` is effectively a shared credential; exposing it in a staff-visible list widens its blast radius.
- **Abuse scenario:** Recon of internal print-server hosts/IPs; a staff user copies an `agent_key` to impersonate an agent.
- **Recommendation:** Require auth on `GET /api/print-stations` (or strip `print_server_host`/`last_ip` from the public shape); omit `agent_key` from list responses.
- **Blocks M8:** Should fix.

### F-006 — Reporting screen crashes on `report.visitorTypes`
- **Severity:** High · **Confidence:** Confirmed · **Category:** Stability (frontend)
- **File:** `frontend/src/App.jsx:4650` and `4653`
- **Problem:** The code reads `report.visitorTypes.length` and `report.visitorTypes.map(...)`, but the backend `ReportingSummaryResponse` field is `visitor_types` (snake_case, `backend/app/schemas.py`/`main.py:1545`). `report.visitorTypes` is `undefined`; `undefined.length` throws `TypeError`. Every other reporting field on this screen correctly uses snake_case (`check_ins_by_location`, `recent_arrivals`, `daily_trends`, `print_station_usage`, `peak_check_in_times`).
- **Evidence:** Backend returns `visitor_types=[...]`; App.jsx uniquely accesses `visitorTypes`.
- **Failure scenario:** As soon as the Reporting screen renders a loaded `report`, the render throws and the screen (or app) white-screens.
- **Recommendation:** Change to `report.visitor_types` (report-only; not applied here).
- **Blocks M8:** **Yes** (breaks the Administrator reporting feature).
- **Verify after fix:** Reporting screen renders the Visitor Types card with data.

### F-007 — Real database and full virtualenv committed
- **Severity:** Critical · **Confidence:** Confirmed · **Category:** Repository hygiene / privacy
- **Files:** `backend/visitor_kiosk.db.old` (**65,536-byte SQLite DB**), `backend/.venv/` (**3,128 tracked files**), 10 `*.pyc` under `backend/app/__pycache__/`.
- **Problem:** `.gitignore` lists `*.db`, `.venv/`, `__pycache__/`, but these were committed earlier and remain tracked. Note `*.db` does **not** match `visitor_kiosk.db.old` (the `.old` suffix), so the DB backup isn't even ignored. The DB likely contains visitor PII.
- **Abuse scenario:** Anyone with repo access downloads real visitor records; the venv bloats the repo and can leak host-specific paths.
- **Recommendation:** `git rm --cached` the DB, venv, and pyc files; extend `.gitignore` to cover `*.db.old`/`*.db*`; purge from history alongside F-001.
- **Blocks M8:** **Yes** (privacy).
- **Verify after fix:** `git ls-files` shows no `.venv/`, `*.pyc`, or `*.db*`.

### F-008 — Permissive CORS
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** CORS
- **File:** `backend/app/main.py:66-73` — `allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`.
- **Problem:** Wildcard origin with credentials is an unsafe combination (and technically contradictory for cookie-credentialed requests). Any site can script authenticated cross-origin calls if a token is reachable.
- **Recommendation:** Pin `allow_origins` to the kiosk/staff origins.
- **Blocks M8:** Should fix.

### F-009 — No login lockout / rate limiting
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Auth hardening
- **File:** `backend/app/main.py:590-635` (`login`)
- **Problem:** `failed_login_count` is incremented but never used to lock the account; no per-IP throttling. Brute-force is unbounded.
- **Recommendation:** Enforce lockout after N failures and/or add rate limiting.
- **Blocks M8:** Should fix.

### F-010 — Photo upload lacks validation and DoS guards
- **Severity:** Medium · **Confidence:** Needs runtime verification · **Category:** Upload security
- **File:** `backend/app/main.py:2318-2349` (`upload_photo`, public)
- **Problem:** `Image.open(file.file)` runs with no content-type allow-list, no max size, and no decompression-bomb protection (`Image.MAX_IMAGE_PIXELS` default warns but a large image still allocates). A malformed image raises inside the handler and surfaces as a 500 via the global handler.
- **Abuse scenario:** A crafted "pixel-flood" PNG exhausts memory; repeated public uploads overwrite `photos/{visitor_id}.jpg` and can DoS the box.
- **Recommendation:** Validate MIME/extension, cap request size, set a sane `MAX_IMAGE_PIXELS`, and wrap decode in try/except returning 400.
- **Verify:** Upload an oversized/corrupt image and confirm graceful 400.

### F-011 — `delete_print_station` ignores PrintJob foreign key
- **Severity:** High · **Confidence:** Confirmed · **Category:** Data integrity
- **File:** `backend/app/main.py:1471-1514`
- **Problem:** The handler blocks deletion only if agents are assigned, then `db.delete(station)`. `PrintJob.print_station_id` is `ForeignKey("print_stations.id")`, **`nullable=False`, no `ondelete`**, and there is no relationship cascade. Deleting a station that has any print jobs raises an IntegrityError → 500 (with SQLite FK enforcement) or orphans rows.
- **Evidence:** `models.py` `PrintJob.print_station_id`; delete handler checks agents only.
- **Recommendation:** Block deletion when jobs reference the station, or define explicit cascade/`ON DELETE` semantics.
- **Blocks M8:** Should fix.

### F-012 — Non-atomic job claim; no station-ownership check
- **Severity:** Medium · **Confidence:** Needs runtime verification · **Category:** Concurrency
- **File:** `backend/app/main.py:1067-1098` (`claim_print_job`)
- **Problem:** Claim reads the job, checks `status == "Pending"`, then writes `"Printing"` in a separate step — a read-then-write race. Two agents polling the same station can both pass the check before either commits. Also, any agent can claim any job by ID regardless of the job's station.
- **Recommendation:** Use a conditional UPDATE (`... WHERE status='Pending'`) and verify the claiming agent owns the job's station.
- **Verify:** Concurrent claim test returns exactly one 200 and one 409.

### F-013 — Inconsistent datetime handling (UTC vs local, naive)
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Data/Time
- **Files:** `register_print_agent` (895) and `print_station_heartbeat` (1533) use `datetime.utcnow()` (naive UTC); the rest of the app uses `datetime.now()` (naive local). `User.created_date` default uses `datetime.now(UTC)` (aware) evaluated at import time.
- **Problem:** Mixed naive-local and naive-UTC timestamps in the same columns corrupt freshness math and reporting. The `default=datetime.now(UTC)` is evaluated **once at class definition**, not per row (should be a callable).
- **Recommendation:** Standardize on timezone-aware UTC; use `default=lambda/func.now()` for created timestamps.
- **Blocks M8:** Should fix.

### F-014 — Station "online" status never expires
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Stability/UX
- **File:** `backend/app/main.py:515-523` (`get_dashboard_stats`)
- **Problem:** A station counts as online if **any** assigned agent has `last_seen is not None`. Staleness is never considered, so once an agent registers, its station shows "online" forever even if the agent is dead.
- **Recommendation:** Compare `last_seen` against a freshness window (e.g., 2–3× heartbeat interval).
- **Blocks M8:** Should fix (operational trust).

### F-015 — Settings `required_returning_checkin_fields` silently ignored
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Frontend bug
- **File:** `frontend/src/App.jsx:305`
- **Problem:** `systemSettings?.requiredReturningCheckinFields` (camelCase) never matches the backend key `required_returning_checkin_fields`, so the value is always `undefined` and the code falls back to the `REQUIRED_RETURNING_CHECKIN_FIELDS` constant. The sibling `required_checkin_fields` (App.jsx:300) uses the correct snake_case.
- **Impact:** Admin edits to required returning-visitor fields never take effect.
- **Recommendation:** Use `systemSettings?.required_returning_checkin_fields`.
- **Blocks M8:** Should fix.

### F-016 — Dead duplicate `handleResponse` in App.jsx (401-only, `no-undef`)
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Dead/duplicate code
- **File:** `frontend/src/App.jsx:340-360`
- **Problem:** App.jsx defines a second `handleResponse` that checks only `status === 401` (misses 403) and calls a bare `handleUnauthorized()` that is **not in scope** (ESLint `no-undef` at 359). ESLint also flags this `handleResponse` as unused (357). The live handler lives in `api.js` (checks 401 **and** 403). This dead copy is a latent trap if ever wired in.
- **Recommendation:** Remove the dead App.jsx copy; keep the `api.js` implementation.
- **Blocks M8:** Should fix (cheap, removes a footgun).

### F-017 — Inconsistent session-expiry handling across the API layer
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Session UX
- **File:** `frontend/src/api.js` (throughout)
- **Problem:** Only functions that route through the shared `handleResponse` (createVisitor, uploadPhoto, generateBadge, checkInAgain, checkoutVisitor, bulkCheckout, getActiveVisitors, findVisitors, searchVisitors, getVisitor, getVisitorHistory, getDashboardStats) get the 401/403 → `handleUnauthorized()` clean-logout. The remaining ~22 (users, print-jobs, print-agents, print-stations, settings, reporting, updateVisitor, changePassword) hand-roll `if (!response.ok) throw` and **do not** trigger session expiry — a 401 there throws a generic error and leaves the user on a broken screen with stale data.
- **Recommendation:** Route all authenticated calls through `handleResponse`.
- **Blocks M8:** Should fix.

### F-018 — Visitor-as-person-and-visit: fragile name-based grouping
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Data model
- **Files:** `checkin_again` (2003), `get_visitor_history` (2086), `search_visitors` (2186) — all group/dedup by exact `first_name` + `last_name`.
- **Problem (by current design):** Each check-in inserts a new `Visitor` row (person == visit). History and duplicate-active detection match on exact name, so: a name change breaks history grouping; two different people with the same name are merged; the search dedup can pick the wrong visit; and an active visit could be hidden if a checked-out namesake sorts first.
- **Note:** Explicitly flagged in code as temporary pending a Person/Visit refactor (a `# TEMPORARY` comment at `search_visitors`). **Do not implement the refactor now.**
- **Blocks M8:** Defer into M8 (this is essentially the M8 boundary).

### F-019 — Schema created at import; no migrations
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Migrations
- **File:** `backend/app/main.py:56` (`Base.metadata.create_all`) + no Alembic anywhere.
- **Problem:** Tables are created on import; there is no migration tooling, so schema evolution against existing SQLite data (e.g., the coming Person/Visit work) has no supported path and risks manual drift. Import-time side effects also make the module hard to test.
- **Recommendation:** Introduce Alembic (or an explicit init routine) before schema changes land in M8.
- **Blocks M8:** Should fix (prerequisite for safe M8 schema work).

### F-020 — Mislabeled audit call on agent registration
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Audit logging
- **File:** `backend/app/main.py:906`
- **Problem:** `audit("REGISTER_PRINT_AGENT", f"AgentKey=...")` passes only two positional args to `audit(user, action, details="")`, so the log records `user='REGISTER_PRINT_AGENT'` and `action='AgentKey=...'` — wrong fields.
- **Recommendation:** Pass a proper `user`/`action`/`details`.
- **Blocks M8:** Should fix (audit correctness).

### F-021 — No audit events for public kiosk actions
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Audit coverage
- **File:** `create_visitor` (1952), `checkout_visitor` (2295), `upload_photo` (2318), `create_print_job` (2388) — none call `audit()`.
- **Problem:** Check-in, checkout, photo, and print (the core visitor lifecycle) leave no audit trail, undermining "who is/was on campus" accountability (a stated goal G3).
- **Recommendation:** Emit audit events (with a `kiosk`/`system` actor) for these.
- **Blocks M8:** Defer into M8.

### F-022 — Backend debug output and dead code
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Dead code / cleanliness
- **Evidence (all `backend/app/main.py` unless noted):**
  - `from urllib3 import request` (line 1) — unused import.
  - `print("REGISTERING SETTINGS ENDPOINTS")` (129) and `print(settings_file := SETTINGS_FILE)` (133) — debug output at import.
  - `print("SUCCESS: TrueType fonts loaded")` (225) — debug.
  - `checkin_again` prints six `request.*`/`original.*`/`new_visitor.*` debug lines (2050-2078).
  - Duplicated `audit_logger.info("Settings initialized …")` (two near-identical lines, 145-152).
  - `update_settings`: `old_settings` loaded but never used (560).
  - `register_print_agent`: `assigned_station` computed, discarded, then recomputed (890-940).
  - `update_user` audit details string ends with a stray `, request` (1857).
  - `auth.py`: duplicate `from jose import jwt` (line 9 duplicates line 4); `STAFF_USERNAME`/`STAFF_PASSWORD` loaded (25-26) but never used (obsolete env-based auth superseded by DB users).
- **Recommendation:** Remove debug prints (use the configured logger if needed), drop unused imports/vars, de-dup log lines.
- **Blocks M8:** Should fix (low effort, reduces noise/PII-in-stdout risk from the `checkin_again` prints).

### F-023 — Unused frontend symbols (ESLint-confirmed)
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Dead code
- **File:** `frontend/src/App.jsx` — `successMessage` (97), `successTitle` (98), `handleResponse` (357), `goBack` (402), `saved` (500), `handleCreateUser` (757), `isStationOnline` (1143), `queuePrintJob` (1158), `handleSubmitReturningVisitor` (1351), `validateCheckIn` (1402), `checkedInToday` (5134), `stationHealthSummary` (5144), `queueHealthSummary` (5145).
- **Problem:** Dead state/functions increase the surface of a 6,600-line file. Some (e.g., `validateCheckIn`, `queuePrintJob`) suggest superseded implementations left behind.
- **Recommendation:** Remove after confirming no dynamic reference.
- **Blocks M8:** Defer into M8.

### F-024 — Empty component/screen scaffolds tracked
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Dead files
- **Files (0 bytes):** `frontend/src/CheckInScreen.jsx`, `CheckOutScreen.jsx`, `HomeScreen.jsx`, `StaffLoginScreen.jsx`, `SuccessScreen.jsx`, `components/BigButton.jsx`, `DropdownField.jsx`, `KioskCard.jsx`, `PhotoCapture.jsx`.
- **Problem:** Nine empty files imply an intended component split that never happened; they mislead readers about structure.
- **Recommendation:** Delete or implement (do not delete during this audit).
- **Blocks M8:** Defer into M8.

### F-025 — `disablePrintStation` calls a nonexistent route
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Broken client function
- **File:** `frontend/src/api.js:525` (marked `// Deprecated?`)
- **Problem:** It issues `DELETE /api/print-stations/{id}`, but the backend only defines `DELETE /api/print-stations/{id}/permanent` (main.py:1471). If ever called it returns 404/405. `getUser` (247) and `getPendingPrintJobs` (372) are likewise flagged `// Deprecated?`.
- **Recommendation:** Remove the dead functions (confirm no callers first).
- **Blocks M8:** Should fix (avoid shipping broken client code).

### F-026 — Dependency hygiene
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Dependencies
- **File:** `backend/requirements.txt`
- **Problem:** `git-filter-repo==2.47.0` is a git-history tool, not a runtime dependency (likely used to attempt secret purging) and should not be a backend requirement. `qrcode[pil]` is unpinned while every other package is pinned.
- **Recommendation:** Drop `git-filter-repo`; pin `qrcode`.
- **Blocks M8:** Should fix.

### F-027 — Config drift: documented env vars ignored by code
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Config drift
- **Evidence:** `.env.example` documents `DATABASE_URL`, `STAFF_USERNAME`, `STAFF_PASSWORD`, `PRINT_AGENT_URL`, but `database.py:4` hardcodes `sqlite:///visitor_kiosk.db`, and `STAFF_*` are unused (F-022). Operators setting `DATABASE_URL` will be silently ignored.
- **Recommendation:** Either honor `DATABASE_URL` or remove it (and the other dead keys) from `.env.example`.
- **Blocks M8:** Should fix.

### F-028 — Module-level logging → duplicate handlers under reload
- **Severity:** Medium · **Confidence:** Needs runtime verification · **Category:** Logging
- **File:** `backend/app/main.py:97-135`
- **Problem:** `RotatingFileHandler`s are attached at import with `addHandler` and no guard. Under `uvicorn --reload` (or repeated imports in tests) handlers can be added multiple times, producing duplicated audit/app log lines.
- **Recommendation:** Guard with `if not logger.handlers:` or configure logging in a startup hook.
- **Verify:** Run with `--reload`, trigger a log, confirm single line.

### F-029 — No startup validation of critical config
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Startup validation
- **File:** `backend/app/auth.py:29` — `JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")` (may be `None`).
- **Problem:** If `JWT_SECRET_KEY` is unset, the app still starts and only fails later at `jwt.encode` during the first login (confusing 500). Same class of issue for a missing settings file (404 at request time).
- **Recommendation:** Fail fast at startup if `JWT_SECRET_KEY` is missing.
- **Blocks M8:** Should fix.

### F-030 — No automated tests
- **Severity:** High · **Confidence:** Confirmed · **Category:** Testing
- **Evidence:** No `test_*.py`, `*.test.jsx`, `pytest.ini`, `conftest.py`, `vitest.config.*`, or `pyproject.toml` anywhere in the repo.
- **Problem:** None of the security-sensitive flows (login/lockout, token expiry, role authorization, claim races, checkout, uploads) are covered, so the M8 refactor will proceed without a regression net.
- **Recommendation:** Stand up minimal backend (pytest + FastAPI TestClient against a temp DB) and frontend (vitest) suites — see §11 for the priority list.
- **Blocks M8:** Should fix (strongly recommended before schema/refactor work).

### F-031 — Documentation/role-model drift
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Doc drift
- **Evidence:** `visitor-kiosk-requirements-v0.1.md` specifies distinct **Office Staff** vs **Administrator** capabilities (staff "Cannot" access admin functions; admin owns settings/reports/data export). The backend enforces none of this (F-002). README lists `.env` as a normal repo file, normalizing the committed-secret state.
- **Recommendation:** Reconcile: implement role enforcement (F-002) and correct the docs to reflect the actual (and intended) boundaries.
- **Blocks M8:** Should fix.

### F-032 — React effect issues (perf/correctness)
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Frontend quality
- **Evidence (ESLint):** `set-state-in-effect` in the mount auth-restore effect (App.jsx:237 — `setIsAuthenticated(true)` etc. synchronously in an effect → cascading renders); `exhaustive-deps` warnings for `refreshSeconds` (213) and `loadPrintStations` (303, 308). The staff refresh effect reads `refreshSeconds` but omits it from deps, and the print-queue effect hardcodes `5000` ignoring the configured refresh interval.
- **Recommendation:** Address per React guidance; align refresh intervals with settings.
- **Blocks M8:** Defer into M8.

---

## 6. API Contract and Authentication Matrix

Legend — **Audience:** P=Public kiosk, A=Print-agent, S=Staff (auth only), Admin*=intended admin (UI-gated only, **not** enforced server-side), H=Health/root.

| Method | Route | Function (main.py) | Auth dep | Request | Response | Frontend caller | Agent caller | Audience | Risk |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/` | `root` (475) | none | — | JSON | — | — | H | Returns `version:"1.0"` (mismatch w/ FastAPI `version="0.7"`) |
| GET | `/health` | `health` (583) | none | — | JSON | — | — | H | ok |
| POST | `/api/auth/login` | `login` (590) | none | `LoginRequest` | `LoginResponse` | `login` | — | P→S | No lockout (F-009) |
| POST | `/api/change-password` | `change_password` (637) | user | `PasswordChangeRequest` | JSON | `changePassword` | — | S | No complexity/reuse check |
| GET | `/api/me` | `get_me` (678) | user | — | JSON | (App) | — | S | ok |
| GET | `/api/dashboard` | `get_dashboard_stats` (482) | user | — | `DashboardStatsResponse` | `getDashboardStats` | — | S | Online logic (F-014) |
| GET | `/api/settings` | `get_settings` (545) | **none** | — | `SettingsResponse` | `getSettings` | — | P | Public read |
| PUT | `/api/settings` | `update_settings` (559) | user | `SettingsUpdate` | `SettingsResponse` | `saveSettings` | — | Admin* | No role check (F-002); unused `old_settings` |
| GET | `/api/users` | `get_users` (1768) | user | — | `list[UserResponse]` | `getUsers` | — | Admin* | No role check |
| GET | `/api/users/{id}` | `get_user` (1748) | user | — | `UserResponse` | `getUser`(dep) | — | Admin* | No role check |
| POST | `/api/users` | `create_user` (1775) | user | `UserCreate` | `UserResponse` | `createUser` | — | Admin* | **Priv-esc (F-002)** |
| PUT | `/api/users/{id}` | `update_user` (1817) | user | `UserUpdate` | `UserResponse` | `updateUser` | — | Admin* | Can disable admin (bypasses status guard) |
| POST | `/api/users/{id}/reset-password` | `reset_password` (1865) | user | `PasswordResetRequest` | JSON | `resetPassword` | — | Admin* | **Admin takeover (F-002)** |
| PUT | `/api/users/{id}/status` | `update_user_status` (1908) | user | `UserStatusUpdate` | `UserResponse` | `updateUserStatus` | — | Admin* | No role check |
| GET | `/api/print-agents` | `get_print_agents` (707) | user | — | `list` (dict) | `getPrintAgents` | — | S | Exposes `agent_key` (F-005) |
| PUT | `/api/print-agents/{id}/assign` | `assign_print_agent` (750) | user | `PrintAgentAssign` | dict | `assignPrintAgent` | — | S | ok |
| POST | `/api/print-agents/{id}/test-label` | `create_print_agent_test_label` (817) | user | — | JSON | `printAgentTestLabel` | — | S | ok |
| POST | `/api/print-agents/register` | `register_print_agent` (878) | **none** | `PrintAgentRegister` | dict | — | ✓ | A | Public; audit mislabeled (F-020) |
| GET | `/api/print-jobs/{id}/badge-image` | `get_print_job_badge_image` (948) | **none** | — | PNG file | — | ✓ | A | **PII IDOR (F-004)** |
| GET | `/api/print-jobs` | `get_print_jobs` (979) | user | — | list (dict) | `getPrintJobs` | — | S | N+1 queries |
| GET | `/api/print-jobs/pending` | `get_pending_print_jobs` (1035) | **none** | `station?` | `list[PrintJobResponse]` | `getPendingPrintJobs`(dep) | ✓ | A | Public |
| PUT | `/api/print-jobs/{id}/claim` | `claim_print_job` (1067) | **none** | `printer_name?` | `PrintJobResponse` | — | ✓ | A | Race + cross-station (F-012) |
| PUT | `/api/print-jobs/{id}/reassign` | `reassign_print_job` (1100) | user | `PrintJobReassign` | JSON | `reassignPrintJob` | — | S | ok |
| DELETE | `/api/print-jobs/completed` | `clear_completed_print_jobs` (1147) | user | — | JSON | `clearCompletedPrintJobs` | — | S | Registered before `{id}` (ok) |
| DELETE | `/api/print-jobs/failed` | `clear_failed_print_jobs` (1167) | user | — | JSON | `clearFailedPrintJobs` | — | S | ok |
| PUT | `/api/print-jobs/{id}/status` | `update_print_job_status` (1186) | **none** | `PrintJobStatusUpdate` | `PrintJobResponse` | — | ✓ | A | Public; flips `badge_printed` (F-004) |
| DELETE | `/api/print-jobs/{id}` | `delete_print_job` (1234) | user | — | JSON | `deletePrintJob` | — | S | ok |
| GET | `/api/print-stations` | `get_print_stations` (1258) | **none** | — | `list[PrintStationResponse]` | `getPrintStations` | (agent via slug) | P/S | Exposes host/IP (F-005) |
| POST | `/api/print-stations` | `create_print_station` (1268) | user | `PrintStationCreate` | `PrintStationResponse` | `createPrintStation` | — | Admin* | No role check |
| GET | `/api/print-stations/{id}/stats` | `get_print_station_stats` (1301) | **none** | — | `PrintStationStatsResponse` | — | — | P | Public |
| GET | `/api/print-stations/{id}/qr` | `download_print_station_qr` (1349) | user | — | PNG | `downloadPrintStationQr` | — | S | ok |
| POST | `/api/print-stations/{id}/print-qr` | `print_station_qr_label` (1381) | user | — | JSON | `printStationQrLabel` | — | S | ok |
| PUT | `/api/print-stations/{id}` | `update_print_station` (1436) | user | `PrintStationUpdate` | `PrintStationResponse` | `updatePrintStation` | — | Admin* | No role check |
| DELETE | `/api/print-stations/{id}/permanent` | `delete_print_station` (1471) | user | — | JSON | `deletePrintStation` | — | Admin* | FK not handled (F-011) |
| POST | `/api/print-stations/heartbeat` | `print_station_heartbeat` (1516) | **none** | `PrintStationHeartbeat` | JSON | — | ✓ | A | `utcnow()` (F-013) |
| GET | `/api/reporting/summary` | `get_reporting_summary` (1545) | user | — | `ReportingSummaryResponse` | `getReportingSummary` | — | Admin* | Frontend crash (F-006) |
| POST | `/api/visitors` | `create_visitor` (1952) | **none** | `VisitorCreate` | `VisitorResponse` | `createVisitor` | — | P | No audit (F-021) |
| GET | `/api/visitors` | `get_visitors` (1980) | user | — | `list[VisitorResponse]` | — | — | S | Unbounded |
| GET | `/api/visitors/active` | `get_active_visitors` (1991) | user | — | `list[VisitorResponse]` | `getActiveVisitors` | — | S | ok |
| POST | `/api/visitors/{id}/checkin-again` | `checkin_again` (2003) | user | `ReturningVisitorCheckInRequest` | `VisitorResponse` | `checkInAgain` | — | S | Debug prints (F-022) |
| GET | `/api/visitors/{id}/history` | `get_visitor_history` (2086) | user | — | JSON | `getVisitorHistory` | — | S | Name grouping (F-018) |
| POST | `/api/visitors/bulk-checkout` | `bulk_checkout` (2119) | user | — | JSON | `bulkCheckout` | — | S | ok |
| GET | `/api/visitors/find` | `find_visitors` (2150) | **none** | `first_name,last_name` | `list[VisitorResponse]` | `findVisitors` | — | P | Full PII exposed (F-004) |
| GET | `/api/visitors/search` | `search_visitors` (2186) | user | `q` | `list[VisitorResponse]` | `searchVisitors` | — | S | Name dedup (F-018) |
| GET | `/api/visitors/{id}` | `get_visitor` (2235) | user | — | `VisitorResponse` | `getVisitor` | — | S | Registered last (ok ordering) |
| PUT | `/api/visitors/{id}` | `update_visitor` (2255) | user | `VisitorUpdateRequest` | `VisitorResponse` | `updateVisitor` | — | S | Partial fields may null others |
| PUT | `/api/visitors/{id}/checkout` | `checkout_visitor` (2295) | **none** | — | `VisitorResponse` | `checkoutVisitor` | — | P | IDOR checkout (F-004) |
| POST | `/api/visitors/{id}/photo` | `upload_photo` (2318) | **none** | multipart file | `VisitorResponse` | `uploadPhoto` | — | P | Upload guards (F-010) |
| POST | `/api/visitors/{id}/badge` | `generate_badge` (2351) | **none** | — | `VisitorResponse` | `generateBadge` | — | P | Public |
| POST | `/api/visitors/{id}/print` | `create_print_job` (2388) | **none** | `PrintJobCreate?` | `PrintJobResponse` | `createPrintJob` | — | P | Public print spam |

**Route-ordering check:** Static visitor routes (`/active`, `/find`, `/search`, `/bulk-checkout`) and print-job (`/completed`, `/failed`, `/pending`) are all registered **before** their dynamic `{id}` siblings, so no dynamic route shadows a static one. No route-order defect found.

---

## 7. Dead and Potentially Unused Code Inventory

### Confirmed unused (evidence: ESLint / direct read)
- App.jsx unused symbols (F-023): `successMessage`, `successTitle`, `handleResponse`, `goBack`, `saved`, `handleCreateUser`, `isStationOnline`, `queuePrintJob`, `handleSubmitReturningVisitor`, `validateCheckIn`, `checkedInToday`, `stationHealthSummary`, `queueHealthSummary`.
- Nine empty `.jsx` scaffolds (F-024).
- `backend/app/main.py`: `from urllib3 import request` (unused); `update_settings` `old_settings`; duplicated `assigned_station` compute in `register_print_agent`; duplicate "Settings initialized" audit lines; multiple debug `print()`s (F-022).
- `backend/app/auth.py`: duplicate `from jose import jwt`; unused `STAFF_USERNAME`/`STAFF_PASSWORD`.
- `backend/requirements.txt`: `git-filter-repo` (not a runtime dep).
- `backend/visitor_kiosk.db.old`: obsolete DB backup (also a privacy issue, F-007).

### Likely unused (verify no dynamic/framework use)
- `frontend/src/api.js`: `getUser` (247), `getPendingPrintJobs` (372), `disablePrintStation` (525 — also broken, F-025). All self-marked `// Deprecated?`.
- Empty `frontend/src/assets/react.svg`/`vite.svg` (Vite starter leftovers — cosmetic).

### Externally consumed or uncertain (do NOT remove without agent analysis)
- `register_print_agent`, `get_pending_print_jobs`, `claim_print_job`, `update_print_job_status`, `get_print_job_badge_image`, `print_station_heartbeat`, `get_print_stations` — consumed by the **print agent** (`print-agent/print_agent.py`), not the React app. They have no React caller but are **live**.
- `get_or_create_system_qr_visitor` / `get_or_create_system_test_visitor` — used by QR/test-label routes.

---

## 8. Security Boundary Review

### How the print agent actually authenticates (analyzed before recommending changes)
`print-agent/print_agent.py` reads `PBC_PRINT_AGENT_TOKEN` and, **only if set**, sends `Authorization: Bearer <token>` (`auth_headers()`). The default `.env.example` ships it **empty**, and **no backend endpoint validates this token** — the agent endpoints are effectively unauthenticated. The agent also holds a `PBC_PRINT_AGENT_KEY` (a server-assigned UUID persisted back into its `.env`) used as an identity in `register`, but it is not required by pending/claim/status/badge-image. **Conclusion:** the current agent trust model is "network-trusted, unauthenticated." Any hardening of agent endpoints must implement and enforce the already-plumbed agent token/key rather than bolting on staff JWT (which the agent cannot obtain).

### Public kiosk surface (intended)
`POST /api/visitors`, `/photo`, `/badge`, `/print`, `PUT /checkout`, `GET /api/visitors/find`, `GET /api/settings`, `GET /api/print-stations(/…/stats)`, `/`, `/health`. **Concern:** `find` and `badge-image` expose full PII and are ID-enumerable (F-004); `checkout` allows tampering by ID; settings/stations are readable anonymously (F-005).

### Staff surface (auth only)
Dashboard, visitor active/search/history/update, print-job/station/agent management, reporting. **Concern:** no role separation (F-002/F-003).

### Administrator surface (intended, unenforced)
User management, settings write, station CRUD, reporting. **Enforced only in the React UI via `role` from `localStorage`.** Server treats these as plain staff endpoints — the central trust-boundary defect.

### Print-agent surface
register/heartbeat/pending/claim/status/badge-image — unauthenticated today (see above).

### Unresolved trust-boundary questions (for M8 decision, not this audit)
1. Should kiosk-public writes (`checkout`, `print`, `photo`) require *any* control (station binding, LAN-only, per-kiosk key)?
2. Should agent endpoints enforce `PBC_PRINT_AGENT_TOKEN`/`agent_key`?
3. What is the minimum PII the kiosk `find` flow needs to return?

---

## 9. Data Integrity and Visitor-History Review

- **Visitor == person == visit.** `create_visitor`/`checkin_again` insert a fresh row per visit. There is no person identity; `Visitor` carries both identity fields (name/phone/church) and visit fields (check_in/out, badge). This is the design the future Person/Visit refactor targets (**not** to be done now).
- **Observed consequences (F-018):**
  - History (`get_visitor_history`) and returning check-in dedup (`checkin_again`) match on **exact** `first_name`+`last_name`. A name edit fragments history; homonyms merge into one history.
  - `search_visitors` collapses to one row per name and only prefers an active row over a checked-out one — an edge case can surface the wrong visit.
  - Duplicate active detection is name-only, so two genuinely different same-name people can't both be active.
- **Referential integrity:** `PrintJob.print_station_id` is `nullable=False` with no `ondelete`/cascade → station deletion with existing jobs errors (F-011). `PrintJob.visitor_id` has `ondelete="CASCADE"` and a relationship cascade (consistent). `PrintAgent.print_station_id` is nullable with no `ondelete`.
- **Datetime:** mixed naive-local/naive-UTC (F-013); `User.created_date` default evaluated once at import (not per-row).
- **Indexing:** only PKs and `User.username`/`PrintStation.slug`/`PrintAgent.agent_key` uniques are indexed; visitor name/`check_out_time` (hot query filters) are unindexed — fine at expected scale, note for growth.
- **Transactions:** handlers commit directly; `get_db` closes the session in `finally` (implicit rollback on unhandled error). No explicit rollback in the global handler (F-028-adjacent), acceptable given `close()` semantics.

---

## 10. Stability and Operational Reliability Review

- **Frontend crash (F-006):** `report.visitorTypes` TypeError on the Reporting screen — highest-impact stability bug.
- **Silent config no-op (F-015):** returning-visitor required fields never apply.
- **Session UX (F-017):** ~22 API functions don't handle 401/403; a mid-session expiry leaves broken screens with stale data instead of a clean re-login. (In-progress edits are extending the shared handler — see §3 #3.)
- **Effects (F-032):** `setState` in a mount effect (cascading renders); refresh intervals not tied to configured `refreshSeconds`; missing effect deps. `setInterval`s are cleaned up correctly (`clearInterval` returned from each effect).
- **Backend robustness:** global exception handler logs then re-raises (generic 500). Upload decode (F-010) and station-online staleness (F-014) are the notable gaps. N+1 queries in `get_print_jobs`/`get_print_agents` are inefficient but low-risk at scale.
- **Import-time side effects (F-019/F-028):** table creation, admin seeding, directory creation, and log-handler attachment all happen on import — brittle for testing and reload.

---

## 11. Test Coverage and Verification Gaps

**No tests exist (F-030).** Recommended minimum coverage before M8 refactor work, in priority order:

| Area | Why | Suggested |
|---|---|---|
| Login success/failure, disabled user, bad password | Security core | pytest + TestClient, temp SQLite |
| Expired/invalid token → 401 | Session integrity | forge token w/ past `exp` |
| **Role authorization** (non-admin blocked from user/settings writes) | Gap F-002 (will fail today) | pytest |
| `claim_print_job` concurrency | Race F-012 | threaded/async test |
| `delete_print_station` with jobs present | FK F-011 | pytest |
| Checkout, bulk-checkout, active-visitor load | Core lifecycle | pytest |
| Photo upload (bad type/oversize) | F-010 | pytest |
| Reporting summary shape ↔ frontend keys | F-006 | contract test |
| Settings round-trip incl. returning fields | F-015 | pytest + vitest |
| Frontend session-expiry redirect | F-017 | vitest + mocked fetch |

**Validation actually run this pass:** `py_compile` (pass), `eslint` (18 problems), test discovery (none found). Backend runtime tests could not be run without importing the app (DB side effects) — deferred to a disposable-DB harness.

---

## 12. Documentation Drift

- **Role model (F-031):** requirements define Office Staff vs Administrator boundaries the backend never enforces.
- **Config (F-027):** `.env.example` advertises `DATABASE_URL`/`STAFF_*`/`PRINT_AGENT_URL` that the code ignores.
- **Version strings:** `root()` returns `version:"1.0"`, `FastAPI(version="0.7")`, `APP_VERSION="0.7.9 Beta"` (App.jsx) — three inconsistent version identities.
- **README:** lists `.env` as a normal repo file, implicitly endorsing the committed-secret state (F-001).
- **Deeper docs** (`docs/ADMINISTRATION.md`, `INSTALL.md`, `PRINT-SERVER.md`, `TROUBLESHOOTING.md`, `KNOWN_GOOD_BUILD.md`, `CHEATSHEET.md`) were inventoried but not line-audited; validate their endpoint/setup claims against §6 during M8 doc cleanup (*Needs verification*).

---

## 13. Recommended Remediation Order

### Must fix before Milestone 8 (blockers)
- **F-001** Rotate + purge committed secrets; scrub `.env.example`.
- **F-007** Remove tracked DB/venv/pyc; extend `.gitignore` (`*.db*`).
- **F-002 / F-003** Add DB-backed role/enabled enforcement (admin-only for user/settings writes).
- **F-004** Decide + close the PII-exposing public endpoints (`badge-image`, `find`).
- **F-006** Fix `report.visitorTypes` → `visitor_types`.

### Should fix before Milestone 8
- **F-005** (data exposure), **F-008** (CORS), **F-009** (lockout), **F-010** (upload guards), **F-011** (station-delete FK), **F-012** (claim race), **F-013** (datetime), **F-014** (online staleness), **F-015** (returning fields), **F-016** (dead handler), **F-017** (session handling), **F-019** (migrations), **F-020** (audit label), **F-025** (broken client fn), **F-026** (deps), **F-027**/**F-031** (drift), **F-029** (startup validation), **F-030** (tests), **F-022** (backend debug/dead code).

### Safe to defer into Milestone 8
- **F-018** (Person/Visit refactor — this *is* M8), **F-021** (kiosk audit events), **F-023/F-024** (frontend dead code/scaffolds), **F-028** (log handler guard), **F-032** (effect cleanups).

### Safe to defer beyond Milestone 8
- Indexing/pagination for growth; version-string unification; docs deep-audit.

---

## 14. Proposed Remediation Batches (bounded; not implemented)

- **Batch A — Secret & repo hygiene (blocker):** `git rm --cached` `.env`, `print-agent/.env`, `.venv/`, `*.pyc`, `visitor_kiosk.db.old`; extend `.gitignore`; placeholder `.env.example`; rotate key/passwords; plan history purge. *Regression:* history rewrite + token invalidation.
- **Batch B — Authorization (blocker):** DB-backed `get_current_user` (enabled check) + `require_admin` dependency applied to user/settings/station-write routes. *Regression:* non-admin staff lose admin actions (intended); verify seeded admin.
- **Batch C — Public-endpoint containment (blocker, partial):** restrict `badge-image`/`find` (agent-token / reduced PII); keep kiosk flow public. Depends on §8 boundary decision.
- **Batch D — Reporting/settings frontend fixes:** F-006 + F-015 + F-016 (remove dead `handleResponse`). Small, isolated to App.jsx.
- **Batch E — Backend correctness:** F-011, F-012, F-013, F-014, F-020, F-029. Cohesive backend changes; add tests alongside.
- **Batch F — Session handling uniformity:** route all `api.js` calls through the shared `handleResponse` (F-017); complete the in-progress edit already in the working tree.
- **Batch G — Hygiene/deps/docs:** F-022, F-025, F-026, F-027, F-031, remove empty scaffolds (F-024).
- **Batch H — Test harness (foundational):** pytest+TestClient (temp DB) and vitest per §11.

Batches A, B, C, D are the blocker set and are largely independent (A is version-control; B/C are backend auth; D is frontend), enabling parallel work with low cross-regression risk.

---

## 15. Final Readiness Decision

### NOT READY

**Rationale (evidence-based):**
- **Secrets are committed and a real key is shipped** (`.env`, `print-agent/.env` tracked; `.env.example` populated) — the JWT signing key must be considered compromised (F-001), which alone undermines the entire auth model.
- **Authorization is not enforced server-side** (F-002/F-003): any authenticated account can create admins, reset the admin password, and change settings; the role model in the requirements is unimplemented.
- **Real visitor data is in the repo** (`visitor_kiosk.db.old`, 64 KB SQLite) and **PII is reachable anonymously** by ID enumeration (F-004/F-007).
- **A field-name mismatch crashes the Administrator Reporting screen** (F-006).
- **There is no automated test coverage** (F-030) to protect the upcoming M8 schema/refactor work.

These are concrete, confirmed defects (not style preferences). Once the five blockers in §13 are remediated and re-verified (secret rotation confirmed, non-admin 403 on privileged routes, PII endpoints closed/limited, Reporting renders, a minimal auth/authorization test suite passing), the project can be re-assessed for **READY WITH NON-BLOCKING CORRECTIONS**.
