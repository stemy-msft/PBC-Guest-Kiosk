# Development Workflow

## 1. Workflow Principles

This document describes how to make a change to the PBC Guest Kiosk safely. It
distinguishes clearly between:

- **Repository-supported practice** — something the code, tests, scripts, or
  history actually encode; and
- **Recommendation** — sensible practice that the repository does **not**
  currently enforce, labelled as such so you are never misled into thinking a
  policy exists when it does not.

The project is in a **release-candidate (RC) phase** (`1.0.0-rc.x`). The guiding
principle throughout is *narrow, evidence-backed changes*: touch as little as
possible, prove it with the existing validation, and document what you did.

> **This repository does not contain any CI configuration** (there is no
> `.github/` directory and no pipeline files). All validation described here is
> **local**. Do not describe or assume an automated pipeline that does not exist.

---

## 2. Selecting and Scoping Work

- Prefer the **smallest change that fully addresses the goal**. Large,
  multi-concern changes are hard to validate against the existing test suite and
  the RC validation campaign.
- Identify which component(s) a change touches — backend, frontend, print agent,
  scripts, or docs — because each has its own validation path (§7).
- If a change spans a schema, a dependency, or the print path, read the matching
  maintenance document *first*: [DatabaseMaintenance.md](DatabaseMaintenance.md),
  [DependencyMaintenance.md](DependencyMaintenance.md), or
  [../02-Deployment/RaspberryPiPrintAgent.md](../02-Deployment/RaspberryPiPrintAgent.md).

---

## 3. Reviewing Existing Architecture and Decisions

Before changing behavior, understand the current design:

- Architecture → [../01-Architecture/Overview.md](../01-Architecture/Overview.md)
  and its siblings (components, data flow, network flow, print architecture).
- Where common changes belong →
  [RepositoryStructure.md](RepositoryStructure.md#14-where-to-make-common-changes).
- Reference behavior → [../06-Reference/](../06-Reference/EnvironmentVariables.md).

> **No formal decision log (ADR) exists in this repository.** There is no
> `docs/decisions/` directory. *Recommendation:* when you make a non-obvious
> design decision, capture the rationale in the pull-request description and the
> commit message so future maintainers can reconstruct it.

---

## 4. Creating a Working Branch

> **Repository state:** the visible history is linear on `main`; there is no
> encoded branch-naming policy, no protected-branch configuration in the repo,
> and no branch templates.

*Recommendation* (not an enforced policy): create a short-lived topic branch per
change rather than committing directly to `main`:

```bash
git switch -c docs/clarify-backup-cadence
```

Use a concise, descriptive branch name. Because no naming scheme is enforced,
consistency is a courtesy to reviewers, not a gate.

---

## 5. Making Focused Changes

- Keep each change to one concern. If you discover an unrelated defect, record
  it separately — do **not** fold an unrelated fix into your change.
- Respect the source/runtime boundary in
  [RepositoryStructure.md](RepositoryStructure.md#13-generated-runtime-and-source-controlled-boundaries):
  never hand-edit generated or runtime files.
- The frontend's `src/App.jsx` is large and monolithic; when adding logic that
  can be expressed as a pure function, prefer putting it in
  `frontend/src/lib/viewModel.js`, which is unit-tested.

---

## 6. Updating Tests

- Backend changes that alter behavior should be covered by a test in
  `backend/tests/`. The suite uses pytest with an in-memory database and the
  fixtures `db_session`, `seed_users`, and `client` — see
  [Testing.md](Testing.md).
- Frontend logic changes should be covered in `frontend/src/api.test.js` or
  `frontend/src/lib/viewModel.test.js` (Vitest).
- The **print agent has no automated tests**; validate print-path changes
  manually on a Linux/CUPS host (§11).

Do not claim coverage a test does not provide. Add or adjust the test that
actually exercises the new behavior.

---

## 7. Running Validation

Run the validation appropriate to what you changed. These commands are verified
and are the same ones documented in [Testing.md](Testing.md).

| Changed | Command | From |
| --- | --- | --- |
| Backend | `python -m pytest` | `backend/` (venv active) |
| Frontend logic | `npm run test` | `frontend/` |
| Frontend code style | `npm run lint` | `frontend/` |
| Frontend build health | `npm run build` | `frontend/` |

> As of `v1.0.0-rc.2` the frontend lint reported an **observed baseline of 11
> problems (10 errors, 1 warning)** (run `npm run lint` to confirm the current
> count); the project does **not** gate on lint. Do not increase that count. See
> [Testing.md](Testing.md#8-linting-and-static-checks).

Passing these checks is necessary but **not** a statement of operational or
production readiness (§16 and [ReleaseManagement.md](ReleaseManagement.md)).

---

## 8. Reviewing Documentation Impact

If your change alters a command, an environment variable, an endpoint, a schema,
or an operational procedure, update the affected documentation in the same
change:

- Commands / setup → [LocalDevelopment.md](LocalDevelopment.md)
- Structure → [RepositoryStructure.md](RepositoryStructure.md)
- Variables → [../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md)
- Operations → [../03-Operations/Administration.md](../03-Operations/Administration.md)

Keep a single source of truth: extend the canonical document rather than creating
a competing one.

---

## 9. Reviewing Database Impact

Any change to `backend/app/models.py` or the persisted schema **must** be
reviewed against [DatabaseMaintenance.md](DatabaseMaintenance.md). The backend
creates tables and applies **inline, idempotent migrations at import time**
(there is no Alembic in this repository). New columns require a matching inline
migration; destructive changes require a backup first.

---

## 10. Reviewing Security Impact

If a change touches authentication, JWT handling, password hashing, CORS, upload
handling, or account lockout, review it against
[../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md) and
re-run the relevant tests (`test_auth_and_access.py`, `test_cors.py`,
`test_account_lockout.py`, `test_upload_boundary.py`). See
[Testing.md](Testing.md#13-security-regression-validation).

---

## 11. Reviewing Print-System Impact

Print-path changes (backend queue logic or `print-agent/print_agent.py`) cannot
be fully validated by automated tests. Validate manually on a Raspberry Pi /
Linux host with a configured CUPS queue, following
[../PRINT-SERVER.md](../PRINT-SERVER.md) and
[../03-Operations/PrintOperations.md](../03-Operations/PrintOperations.md). Never
introduce a Windows print-agent path — none exists.

---

## 12. Commit Preparation

- Stage only the files your change intends to modify. Confirm no generated or
  runtime files are staged (`git status`).
- Run `git diff --check` to catch whitespace errors before committing.

> **Observed commit-message convention (from history, not an enforced rule):**
> commits are prefixed with a milestone or phase identifier and a short topic,
> e.g. `M9.3.3 Upload Boundary Hardening`, `M9.4.2 ... device-workflow defect
> fixes`, `RC1 - Documentation Wave 4 Correction Pass`. Following the same style
> keeps the history consistent.

---

## 13. Pull-Request Preparation

> **The repository contains no pull-request template and no CODEOWNERS file.**
> The following is a *recommendation*, not an enforced process.

A useful PR description includes: what changed and why, which components are
affected, the validation commands you ran and their results, documentation
updated, and any database/security/print impact. For RC-phase changes, state the
evidence explicitly (§16) rather than asserting readiness.

---

## 14. Review Expectations

> No review automation, required-reviewer rule, or status check is configured in
> the repository. Review is therefore a human, out-of-band step.

*Recommendation:* a reviewer should confirm the change is narrowly scoped, that
tests were added/updated and pass locally, that documentation was updated, and
that no generated/runtime files or secrets were committed.

---

## 15. Defect-Fix Workflow

1. Reproduce the defect and capture the exact symptom (error text, endpoint,
   steps).
2. Write or identify a test that fails because of the defect (backend/frontend),
   where the defect is testable.
3. Make the **smallest** fix that resolves it.
4. Re-run the relevant validation (§7) and confirm the new/updated test passes.
5. Update any documentation the defect touched.
6. In the commit/PR, describe root cause, fix, and the evidence that it works.

---

## 16. Release-Candidate Change Discipline

During the RC phase, apply extra discipline:

- **Keep RC changes narrowly scoped.** Prefer defect fixes, documentation, and
  hardening over new features.
- **Require evidence for any validation claim.** "Tests pass" must be backed by
  the actual command and result; "works on the device" must be backed by a
  described manual validation.
- **Do not equate a passing test suite with release readiness.** Automated tests
  are one input; the RC validation campaign and operational sign-off are separate
  (see [ReleaseManagement.md](ReleaseManagement.md)).
- **Do not** introduce new deployment mechanisms (service units, additional
  reverse-proxy/TLS beyond the documented container path), CI, migration tooling,
  or a Windows print agent as a side effect of an RC change; those are out of
  scope for the current phase. (The optional container deployment is documented
  separately in [../container-deployment.md](../container-deployment.md).)

---

## 17. Handoff Checklist

Before considering a change complete:

- [ ] The change is scoped to a single concern.
- [ ] Tests added/updated where the behavior is testable, and the relevant suite
  passes locally (§7).
- [ ] Frontend lint not increased beyond the known baseline (§7).
- [ ] Documentation updated in the canonical location (§8).
- [ ] Database, security, and print impacts reviewed where applicable
  (§9–§11).
- [ ] No generated/runtime files or secrets staged; `git diff --check` clean
  (§12).
- [ ] Commit/PR describes the change and its validation evidence (§12–§13).
- [ ] No out-of-scope RC additions (§16).
