# Testing

## 1. Testing Overview

The PBC Guest Kiosk has two automated test suites and a set of **manual**
validation activities. This document inventories what actually exists, gives the
verified commands to run each, and is explicit about where coverage stops.

Two distinctions are load-bearing throughout:

1. **Automated tests vs. manual validation.** The automated suites (pytest,
   Vitest) are fast, repeatable checks of code behavior. The manual validation
   (device/browser, print path, backup/restore on real hardware) is the
   release-candidate campaign and is a *separate* activity.
2. **Passing tests vs. operational approval.** A green suite means the covered
   code behaves as tested. It is **not**, by itself, a statement of production or
   operational readiness. See [ReleaseManagement.md](ReleaseManagement.md).

The counts in this document were demonstrated by running the suites in the
repository; re-run them to confirm current numbers.

---

## 2. Existing Test Inventory

| Suite | Framework | Location | Files | Tests (demonstrated) |
| --- | --- | --- | --- | --- |
| Backend | pytest | `backend/tests/` | 16 test modules + `conftest.py` | **225 passed** |
| Frontend | Vitest | `frontend/src/` | `api.test.js`, `lib/viewModel.test.js` (+ `test/setup.js`) | **14 passed** |
| Print agent | — | — | none | no automated tests |

Backend test modules and what they cover (by name):

| Module | Area |
| --- | --- |
| `test_auth_and_access.py` | Authentication and access control |
| `test_account_lockout.py` | Account lockout (F-009) |
| `test_cors.py` | CORS allowlist (F-008) |
| `test_upload_boundary.py` | Upload size/type boundaries (F-010) |
| `test_backup_restore.py` | Backup/restore core |
| `test_schema_contracts.py` | Schema/response contracts |
| `test_visitor_find_minimization.py` | Visitor lookup data minimization |
| `test_print_agent_credentials.py` | Agent credential issuance/rotation/revocation |
| `test_print_job_ownership.py` | Print-job claim/lease/ownership |
| `test_print_job_redirect.py` | Print-job redirection between stations |
| `test_reprint_destination.py` | Badge reprint destination |
| `test_station_routing.py` | Station routing |
| `test_m92_station_awareness.py` | Station awareness / health |
| `test_m92_queue_visibility.py` | Queue visibility metrics |
| `test_m92_health_liveness.py` | Health/liveness and dashboard status |
| `test_m8_feature_completion.py` | M8 feature-completion checks |

---

## 3. Backend Tests

- **Framework:** pytest, configured by `backend/pytest.ini`
  (`pythonpath = .`, `testpaths = tests`, `addopts = -q`).
- **Isolation:** `backend/tests/conftest.py` repoints the SQLAlchemy engine to an
  **in-memory** SQLite database (StaticPool) *before* importing `app.main`, and
  injects deterministic JWT settings into the environment. The operational
  `backend/visitor_kiosk.db` is never opened or modified by the suite.
- **Fixtures:** `db_session` (fresh schema per test), `seed_users` (an enabled
  admin `testadmin`, enabled staff `teststaff`, and disabled `disableduser`, all
  sharing the password `Correct-Horse-Battery-9`), and `client` (a `TestClient`
  whose `get_db` yields the isolated session).

Run from `backend/` with the virtual environment active and the test extras
installed (`pip install -r requirements-dev.txt`):

```bash
python -m pytest
```

Demonstrated result: **225 passed, 146 warnings** in ~60s. The warnings are
pre-existing `datetime.utcnow()` deprecation warnings and are not failures.

---

## 4. Frontend Tests

- **Framework:** Vitest, configured by `frontend/vitest.config.js` with
  `frontend/src/test/setup.js`; runs in a jsdom environment.
- **Files:** `frontend/src/api.test.js` (API client) and
  `frontend/src/lib/viewModel.test.js` (pure view-model logic).

Run from `frontend/`:

```bash
npm run test        # vitest run
```

Demonstrated result: **14 passed** (`lib/viewModel.test.js` 11,
`api.test.js` 3).

---

## 5. Print-Agent Tests

There are **no automated tests** for `print-agent/print_agent.py`. The print
path depends on CUPS (`lp`/`lpstat`) and physical hardware, so it is validated
manually (§11). Do not claim automated print-agent coverage.

---

## 6. Running the Full Test Suite

There is no single command that runs both suites; run each from its component
directory.

```bash
# Backend (from backend/, venv active)
python -m pytest

# Frontend (from frontend/)
npm run test
```

> There is **no CI pipeline** in this repository (no `.github/`). "The full
> suite" means running the two commands above locally.

---

## 7. Running Focused Tests

Backend (pytest) — run a module, a single test, or a keyword filter:

```bash
python -m pytest tests/test_cors.py
python -m pytest tests/test_account_lockout.py::test_account_locks_after_threshold
python -m pytest -k "lockout or cors"
```

Frontend (Vitest) — run a single file:

```bash
npm run test -- src/api.test.js
```

---

## 8. Linting and Static Checks

The frontend has ESLint configured (`frontend/eslint.config.js`):

```bash
npm run lint        # eslint .
```

> **Known baseline: 11 problems (10 errors, 1 warning).** The errors are
> `no-unused-vars` findings in `src/App.jsx` and there is one
> `react-hooks/set-state-in-effect` warning. The project **does not gate** on
> lint (ESLint exits non-zero, by design of the tool). Treat the baseline as a
> ceiling: do not increase it. There is no separate backend linter configured
> (pytest is the backend's static/behavioral check).

---

## 9. Manual Workflow Validation

Automated tests do not exercise the full check-in-to-print workflow end to end.
For that, validate manually against a running backend, frontend, and (on Linux)
print agent. The end-to-end validation checklist in
[../../README.md](../../README.md) is the canonical workflow: load the UI, check
in a visitor, capture a photo, generate a badge, create a print job, have the
agent claim it, and print.

---

## 10. Device and Browser Validation

Real-device validation is a manual campaign, not an automated one. The validated
device/browser set recorded for the project includes Android phone, iPad
(Safari/Chrome), an Amazon Fire tablet, a Pixel 9 Pro XL, and desktop — in both
portrait and landscape (see the project status in
[../../README.md](../../README.md)). When changing UI or camera behavior, re-run
device validation on the affected devices; do not treat a passing Vitest run as
device coverage.

---

## 11. Print-System Validation

Validate print changes on a Raspberry Pi / Linux host with a configured CUPS
queue:

- Confirm the queue and driver options per [../PRINT-SERVER.md](../PRINT-SERVER.md)
  and the validated build record [../KNOWN_GOOD_BUILD.md](../KNOWN_GOOD_BUILD.md).
- Exercise agent registration, approval/assignment, job claim, download, and
  print, per [../03-Operations/PrintOperations.md](../03-Operations/PrintOperations.md).

There is no Windows print agent; do not attempt to validate one.

---

## 12. Backup and Restore Validation

- **Automated:** `backend/tests/test_backup_restore.py` covers the backup/restore
  core (`backend/app/backup.py`), which uses the SQLite online-backup API and a
  `PRAGMA integrity_check` on every snapshot.
- **Manual:** exercise the CLI wrappers against a development database and verify
  a snapshot, then a restore, following
  [../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)
  and [DatabaseMaintenance.md](DatabaseMaintenance.md):

```bash
python scripts/backup.py backup
python scripts/backup.py list
python scripts/backup.py verify --from backend/backups/<snapshot>
```

> Restore is destructive to the current state. Stop the backend and print agents
> first; a pre-restore safety snapshot is taken automatically unless
> `--no-safety` is passed. See [DatabaseMaintenance.md](DatabaseMaintenance.md).

---

## 13. Security Regression Validation

When touching security-relevant code, re-run the security-focused modules:

```bash
python -m pytest tests/test_auth_and_access.py tests/test_cors.py tests/test_account_lockout.py tests/test_upload_boundary.py tests/test_print_agent_credentials.py
```

Cross-check behavior against
[../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md). A
passing security regression confirms the tested controls still behave; it is not
a full security audit.

---

## 14. Test Data and Cleanup

- The backend suite is self-contained: it uses an in-memory database and does not
  create or modify `backend/visitor_kiosk.db`, uploads, logs, or backups.
- The frontend suite runs in jsdom and touches no real backend.
- Manual validation *does* create real data (a development database, uploaded
  photos, badge artifacts, backup snapshots). All of these live under
  git-ignored paths (§ [RepositoryStructure.md](RepositoryStructure.md#7-runtime-data-and-generated-files)).
  Delete the development database and runtime directories to reset — see
  [DatabaseMaintenance.md](DatabaseMaintenance.md#9-development-database-reset).
- Never load real visitor PII into a development or test environment.

---

## 15. Interpreting Failures

| Observation | Meaning | Action |
| --- | --- | --- |
| A pytest test fails | Covered backend behavior changed or regressed | Read the assertion; fix code or update the test if the behavior change is intended and correct |
| Many tests fail with import/DB errors | Likely running from the wrong directory or missing test extras | Run from `backend/`; `pip install -r requirements-dev.txt` |
| Deprecation **warnings** only | Pre-existing `datetime.utcnow()` warnings | Not a failure; safe to ignore for now |
| Vitest fails | Frontend logic/API-client behavior changed | Fix or update the corresponding test |
| Lint count increased above 11 | New unused vars or hook issues introduced | Resolve so the baseline is not exceeded |

A passing suite means the **covered** behavior is correct. It says nothing about
uncovered areas (§16) or operational readiness.

---

## 16. Current Test-Coverage Gaps

Known, honest gaps in automated coverage:

- **Print agent:** no automated tests at all; validated manually on hardware.
- **End-to-end workflow:** the full check-in→badge→print flow is validated
  manually, not by an automated end-to-end harness.
- **Frontend UI:** only the API client and the `viewModel` helpers are
  unit-tested; the large `App.jsx` component is not covered by component/E2E
  tests. Device/browser behavior is validated manually.
- **CUPS / hardware integration:** cannot be exercised without a Pi + printer.

These gaps are why manual validation and the RC campaign remain necessary.

---

## 17. Pre-Commit Validation Checklist

Before committing a change, run what applies:

- [ ] Backend changed → `python -m pytest` from `backend/` passes.
- [ ] Frontend logic changed → `npm run test` from `frontend/` passes.
- [ ] Frontend changed → `npm run lint` not above the 11-problem baseline.
- [ ] Frontend changed → `npm run build` succeeds.
- [ ] Security-relevant change → security modules re-run (§13).
- [ ] Schema change → reviewed against [DatabaseMaintenance.md](DatabaseMaintenance.md).
- [ ] Print change → manually validated on Linux/CUPS (§11).
- [ ] Understood that passing tests ≠ operational approval.
