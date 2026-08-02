# Release Management

## 1. Release Management Scope

This document describes how releases of the PBC Guest Kiosk are versioned,
prepared, validated, and tagged, based strictly on what the repository and its
**local Git history** actually contain. It covers the release-candidate (RC)
discipline the project is currently in and the handoff to deployment.

It does **not** invent release automation. There is **no CI/CD, no release
pipeline, no packaging/build-artifact step, and no automated tagging** in this
repository (there is no `.github/`). Everything here is a **manual, human-driven**
process, and anything not encoded in the repo is labelled a *recommendation*.

> Releasing is a deliberate human decision. This document does not commit, push,
> tag, or declare production readiness on anyone's behalf.

---

## 2. Current Version Sources

| Source | Value | Role |
| --- | --- | --- |
| `backend/app/version.py` — `APP_VERSION` | `1.0.0-rc.1` | **SSOT** for the FastAPI app version and `/health` |
| `backend/app/version.py` — `APP_VERSION_DISPLAY` | `1.0.0 RC1` | Human-readable release label |
| `frontend/package.json` — `version` | `1.0.0-rc.1` | Frontend package version |
| `GET /` response banner | `"1.0"` | A static, coarse banner string (not the precise version) |
| `GET /health` | includes `1.0.0-rc.1` / `1.0.0 RC1` | Runtime readiness surface |

`version.py` is the authoritative version for the running backend; the `GET /`
banner is intentionally coarse ("1.0") and should not be treated as the precise
version.

---

## 3. Release Stages and Terminology

The project uses standard semantic-version pre-release terminology:

- **`x.y.z-rc.N` (release candidate):** a build believed complete and undergoing
  validation. The project is here now (`1.0.0-rc.1` in code).
- **`x.y.z` (RTM / general release):** a candidate that has passed validation and
  been accepted for production. **Not yet reached.**
- **Hotfix / RC defect fix:** a narrowly scoped correction on top of an RC (§14).

The project status in [../../README.md](../../README.md) records RC1 as the
current state with a subsequent RTM milestone planned; this document does not
assert that RTM has been reached.

---

## 4. Milestone Completion Versus Release Readiness

The commit history is organized around **milestones** (e.g. `M9.3.3`, `M9.4.2`).
Completing a milestone means its scoped work landed — it does **not** by itself
mean the product is release-ready.

Likewise, a **passing test suite is not release readiness** (see
[Testing.md](Testing.md)). Release readiness additionally requires the RC
validation campaign (device/browser, print path, backup/restore on real
hardware) and the production-readiness review in
[../02-Deployment/ProductionReadiness.md](../02-Deployment/ProductionReadiness.md).
Keep these three ideas distinct: milestone done ≠ tests green ≠ release ready.

---

## 5. Release-Candidate Preparation

When preparing or advancing an RC:

1. Confirm the intended scope is complete and **narrowly bounded** (RC phase is
   for fixes and hardening, not new features — see
   [DevelopmentWorkflow.md](DevelopmentWorkflow.md#16-release-candidate-change-discipline)).
2. Ensure the version sources (§2) are consistent and reflect the intended RC
   (§8).
3. Gather the validation evidence (§6).
4. Review documentation for accuracy (§7).
5. Only then consider tagging (§9) — as a human decision.

---

## 6. Required Validation Evidence

A release or RC advancement should be backed by **explicit evidence**, not
assertions:

- **Automated suites:** the exact commands and results — backend
  `python -m pytest` (demonstrated: 225 passed) and frontend `npm run test`
  (demonstrated: 14 passed). See [Testing.md](Testing.md).
- **Frontend build/lint:** `npm run build` succeeds; `npm run lint` not above the
  known 11-problem baseline.
- **Manual campaign:** device/browser validation, print-path validation on
  Linux/CUPS, and a backup/restore exercise — each described with what was run
  and observed.

Record this evidence with the release (recommendation: in the release notes and
the PR/commit description). "It works" without the command and result is not
evidence.

---

## 7. Documentation Review

Before release, confirm the documentation matches the shipped behavior:

- Version-bearing and setup docs are accurate ([LocalDevelopment.md](LocalDevelopment.md),
  [../06-Reference/SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md)).
- Operational and deployment docs reflect the release
  ([../03-Operations/](../03-Operations/Administration.md),
  [../02-Deployment/](../02-Deployment/README.md)).
- Known defects (e.g. the print-agent `python-dotenv` manifest defect) are stated
  where a reader will encounter them
  ([DependencyMaintenance.md](DependencyMaintenance.md#13-known-manifest-defects)).

---

## 8. Version Consistency Review

Before tagging, verify every version source in §2 agrees on the intended value.

> **Known finding (factual, unresolved): a version/tag mismatch exists.**
> The local Git history contains a tag **`v1.0.0-rc.2`**, but the in-code version
> sources (`backend/app/version.py` and `frontend/package.json`) still read
> **`1.0.0-rc.1`**. In other words, a later RC tag exists than the version the
> code reports.
>
> This document records the mismatch **as a fact**; it does not resolve it and
> does not instruct you to change any version or tag. Reconciling it (bumping the
> in-code version to match the tag, or clarifying the tag) is a deliberate,
> separately reviewed decision — not part of routine documentation work.

Whoever prepares the next release should decide, explicitly, what the canonical
version is and bring all sources into agreement as a scoped change.

---

## 9. Tagging Procedure Supported by Repository History

The repository's history shows releases marked with **Git tags** on specific
commits:

| Tag | Commit | Associated milestone |
| --- | --- | --- |
| `v1.0.0-rc.1` | `dbed800` | M9.4.1 |
| `v1.0.0-rc.2` | `6571d0c` | M9.4.2 (device-workflow fixes) |

This establishes the observed convention: a `vX.Y.Z-rc.N` tag placed on the
commit that represents that candidate.

*Procedure (executed by a human, deliberately — not automated by tooling):*

```bash
# Only after evidence (§6) and version consistency (§8) are satisfied
git tag -a v1.0.0-rc.3 -m "1.0.0 RC3 - <summary>"
git push origin v1.0.0-rc.3
```

> **Do not tag or push automatically.** Tagging is a release decision. This
> document does not create, move, or delete tags, and neither should routine
> work. Confirm the version sources match the tag first (§8).

---

## 10. Release Notes

There is no enforced release-notes format in the repository. *Recommendation:*
for each RC/release, capture concisely:

- The version and the commit/tag it corresponds to.
- What changed (fixes, hardening) — the milestone-prefixed commits make a natural
  source.
- Validation evidence (§6).
- Known open defects and limitations (e.g. the `python-dotenv` manifest defect,
  and any items from
  [../02-Deployment/ProductionReadiness.md](../02-Deployment/ProductionReadiness.md)).

---

## 11. Deployment and Upgrade Handoff

Release management ends where deployment begins. The canonical deployment and
upgrade procedures live in
[../02-Deployment/](../02-Deployment/README.md) (backend, frontend, Linux print
agent, quick start, production readiness). Do not duplicate deployment steps
here; hand off to those documents with the agreed version.

---

## 12. Rollback Planning

- **Code:** roll back by checking out the previous tag/commit and redeploying per
  the deployment docs.
- **Data:** roll back with the backup/restore procedure — restore is destructive
  and requires stopping the backend and agents; a pre-restore safety snapshot is
  automatic. See [DatabaseMaintenance.md](DatabaseMaintenance.md#13-restore-and-rollback-considerations)
  and [../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md).
- Plan both dimensions before a release: know the previous good tag and have a
  verified backup.

---

## 13. Post-Release Validation

After deploying a release, confirm the running system reports the expected
version and is healthy:

- `GET /health` returns the expected version/release and a ready status.
- `GET /health/live` returns alive.
- A real check-in→badge→print workflow succeeds on the target hardware.

Post-release validation is operational confirmation on the deployed system — a
separate activity from the pre-release automated suites.

---

## 14. Hotfix and RC Defect Handling

- Keep hotfixes and RC defect fixes **narrowly scoped** to the specific problem.
- Follow the defect-fix workflow
  ([DevelopmentWorkflow.md](DevelopmentWorkflow.md#15-defect-fix-workflow)):
  reproduce, fix minimally, validate, document.
- Advance the RC number (e.g. `rc.2` → `rc.3`) for a new candidate, updating the
  version sources consistently (§8) before tagging (§9).
- Do not bundle unrelated changes into a hotfix.

---

## 15. Known Release-Management Gaps

Honest gaps in the current release process:

- **No release automation.** No CI, no pipeline, no build artifacts, no automated
  tagging — everything is manual.
- **Version/tag mismatch (§8).** `v1.0.0-rc.2` is tagged while the code reads
  `1.0.0-rc.1`; unresolved and left as a factual finding.
- **No enforced release-notes or changelog format.** Recommended, not required.
- **Coarse `GET /` banner.** The root banner reports `"1.0"`, not the precise
  version; `/health` and `version.py` are the precise sources.
- **RTM not reached.** The project is in RC; this document does not declare
  production/RTM readiness.

---

## 16. Release Checklist

- [ ] Scope complete and narrowly bounded (RC discipline).
- [ ] Version sources (§2) consistent and reconciled with any intended tag (§8).
- [ ] Validation evidence gathered and recorded (§6): backend pytest, frontend
  tests, build, lint baseline, and the manual campaign.
- [ ] Documentation reviewed for accuracy (§7).
- [ ] Known defects/limitations stated in the release notes (§10).
- [ ] Rollback plan known: previous good tag + verified backup (§12).
- [ ] Tagging done deliberately by a human, not automatically (§9).
- [ ] Post-release health and workflow validated on the target (§13).
- [ ] No claim that passing tests equals production approval.
