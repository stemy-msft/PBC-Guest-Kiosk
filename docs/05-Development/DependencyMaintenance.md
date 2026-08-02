# Dependency Maintenance

## 1. Dependency Overview

The PBC Guest Kiosk has three independent dependency sets:

| Component | Manifest(s) | Lockfile | Style |
| --- | --- | --- | --- |
| Backend (runtime) | `backend/requirements.txt` | none (the pinned manifest *is* the lock) | fully pinned `==`, flat |
| Backend (tests) | `backend/requirements-dev.txt` | none | range-pinned |
| Frontend | `frontend/package.json` | `frontend/package-lock.json` | semver ranges + lockfile |
| Print agent | `print-agent/requirements.txt` | none | single pinned `==` |

There is **no automated dependency tooling configured** in this repository — no
Dependabot/Renovate (there is no `.github/`), and no `pip-audit`/`npm audit`
automation. Dependency maintenance is a deliberate, manual, per-component
activity.

---

## 2. Backend Python Dependencies

`backend/requirements.txt` is **fully pinned and flat**: every package —
including transitive dependencies — is listed with an exact `==` version. Direct
runtime dependencies include, among others:

- `fastapi==0.139.0`, `starlette==1.3.1`, `uvicorn==0.51.0` (plain uvicorn — no
  `[standard]` extra, no gunicorn)
- `SQLAlchemy==2.0.51`, `pydantic==2.13.4` (+ `pydantic_core==2.46.4`)
- `python-jose==3.5.0`, `pwdlib==0.3.0`, `argon2-cffi==25.1.0`,
  `python-multipart==0.0.32` (auth, hashing, form parsing)
- `pillow==12.3.0`, `qrcode[pil]==8.2` (badge/QR generation)
- `python-dotenv==1.2.2`, `cryptography==49.0.0`

> **Encoding gotcha.** `backend/requirements.txt` is stored as **UTF-16LE**.
> When editing it, preserve that encoding — a tool that rewrites it as UTF-8 (or
> strips the BOM) can break `pip`'s ability to read it. On Windows, read/write it
> with PowerShell (`Get-Content` / `Set-Content`), which handles the encoding.

Because the manifest is fully pinned, an install is already reproducible without
a separate lockfile.

---

## 3. Frontend npm Dependencies

`frontend/package.json` declares runtime and dev dependencies with **caret
(`^`) ranges**, and a committed `frontend/package-lock.json` pins the exact
resolved tree:

- Runtime: `react` and `react-dom` (`^19.2.7`) only. (The former `axios`
  dependency was removed; the API client uses the browser `fetch` API.)
- Dev/toolchain: `vite` (`^8.1.1`), `vitest` (`^3.2.4`), `eslint` (`^10.6.0`),
  `jsdom` (`^25.0.1`), `@vitejs/plugin-react`, `eslint-plugin-react-hooks`,
  `eslint-plugin-react-refresh`, `globals`, and `@types/react(-dom)`.

Use `npm ci` for reproducible installs (honors the lockfile exactly); use
`npm install` when intentionally updating dependencies (which updates the
lockfile).

---

## 4. Print-Agent Python Dependencies

`print-agent/requirements.txt` declares exactly one package:

```text
requests==2.34.2
```

However, `print-agent/print_agent.py` also imports `python-dotenv`
(`from dotenv import load_dotenv`). That package is **not declared** in the
manifest. This omission is a **known, open manifest defect** (see §13). Until it
is corrected under change control, a clean install from the manifest alone will
fail at startup with `ModuleNotFoundError: No module named 'dotenv'`.

---

## 5. Version Pinning Strategy Found in the Repository

The repository uses **different pinning strategies per component**, and this
document does not change them:

- **Backend runtime:** exact `==` pins for direct *and* transitive packages
  (strongest reproducibility; upgrades are explicit and deliberate).
- **Backend tests:** compatible ranges (`pytest>=8,<9`, `httpx>=0.27,<1`) — kept
  separate from runtime so the runtime install is unchanged.
- **Frontend:** semver caret ranges plus a committed lockfile (the lockfile is
  the reproducibility anchor).
- **Print agent:** a single exact `==` pin.

---

## 6. Identifying Outdated Dependencies

Use each ecosystem's standard, read-only reporting:

```bash
# Backend / print agent (from the component dir, venv active)
pip list --outdated

# Frontend (from frontend/)
npm outdated
```

These only *report*; they do not modify anything. Because the backend manifest
pins transitive packages too, expect `pip list --outdated` to surface transitive
updates as well as direct ones — evaluate each deliberately.

---

## 7. Security Review Considerations

- **Frontend:** `npm audit` works against the committed lockfile and is the
  primary signal for the Node dependency tree.
- **Backend / print agent:** there is no audit tool pinned in the repository. A
  vulnerability scan (for example `pip-audit`) requires installing the tool
  separately in your environment; it is not part of the project's dependencies
  and running it does not change the repository.
- Do not assume any of this runs automatically — it does not. Security review is
  a manual step you must perform when updating.

Cross-reference security-relevant packages (auth/JWT/hashing/TLS) with
[../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md).

---

## 8. Updating One Dependency Safely

1. **Back up / branch.** Work on a topic branch (see
   [DevelopmentWorkflow.md](DevelopmentWorkflow.md)).
2. **Change exactly one pin** in the relevant manifest.
   - Backend: edit the `==` version in `requirements.txt` (preserve UTF-16LE).
     If it is a direct dependency, also update any transitive pins it forces.
   - Frontend: `npm install <pkg>@<version>` (updates `package.json` +
     lockfile).
3. **Reinstall** in a clean environment (`pip install -r requirements.txt`, or
   `npm ci` after a lockfile change).
4. **Validate the affected component** (§11) — do not rely on unrelated suites.
5. **Read the changelog** for the bump; watch for breaking changes in FastAPI,
   Pydantic, SQLAlchemy, Vite, or ESLint, which can have migration notes.

---

## 9. Updating Multiple Dependencies Safely

- Prefer **small, grouped, related** updates (e.g. a framework and its plugins)
  over a sweeping "update everything" change.
- Update, reinstall, and **validate after each group** so a regression is easy to
  attribute.
- Do **not** perform a broad, all-at-once upgrade without component-specific
  validation — a green unrelated suite does not vouch for an unrelated bump.
- Keep runtime and dev/test updates separate so a test-tool bump never silently
  changes the runtime install.

---

## 10. Lockfiles and Reproducibility

- **Frontend:** `package-lock.json` is the reproducibility anchor. Commit lockfile
  changes together with the `package.json` change that caused them. Use `npm ci`
  for exact installs.
- **Backend:** there is no separate lockfile because `requirements.txt` is fully
  pinned (it serves the same purpose). Keep it exhaustive and exact.
- **Print agent:** the single exact pin is trivially reproducible — plus the
  undeclared `python-dotenv` (§4/§13), which is *not* reproducible from the
  manifest until corrected.

---

## 11. Validation After Dependency Changes

Run the validation for the component you changed (verified commands; see
[Testing.md](Testing.md)):

| Changed | Validate with | From |
| --- | --- | --- |
| Backend runtime/test deps | `python -m pytest` | `backend/` |
| Frontend deps | `npm run test`, `npm run lint`, `npm run build` | `frontend/` |
| Print-agent deps | Manual run on Linux/CUPS + start-up smoke check | `print-agent/` |

A dependency bump is not "done" until the affected component's validation passes.
Passing validation still does not equal operational approval
([ReleaseManagement.md](ReleaseManagement.md)).

---

## 12. Rollback Procedure

- **Version control is the rollback.** Revert the manifest (and lockfile) change
  with git and reinstall (`pip install -r requirements.txt` or `npm ci`).
- Because the backend manifest is fully pinned and the frontend lockfile is
  committed, reverting restores the exact previous dependency set.
- If a bad update reached a running environment, restore per the operational
  procedures — but dependency rollback itself is a source-control action, not a
  data restore.

---

## 13. Known Manifest Defects

**Print agent — undeclared `python-dotenv` (OPEN, release-candidate).**

| Aspect | Fact |
| --- | --- |
| Required by implementation | `print_agent.py` imports `from dotenv import load_dotenv` |
| Declared by manifest | `print-agent/requirements.txt` lists **only** `requests==2.34.2` |
| Result of a clean install | `ModuleNotFoundError: No module named 'dotenv'` at startup |
| Temporary workaround (local only) | `pip install python-dotenv` |
| Correct resolution | Add `python-dotenv` to `print-agent/requirements.txt` as its **own** scoped, reviewed change |

> This document **does not fix** the manifest. Do not add the dependency as a
> side effect of unrelated work. The three-way distinction above
> (required-by-code vs. declared-by-manifest vs. temporary manual install) must
> be preserved until the defect is closed deliberately.

No other manifest defects are known at this time.

---

## 14. Documentation Updates Required

When you change a dependency in a way that affects setup, behavior, or supported
versions, update the docs in the same change:

- Required software / setup → [LocalDevelopment.md](LocalDevelopment.md)
- Supported software versions → [../06-Reference/SoftwareMatrix.md](../06-Reference/SoftwareMatrix.md)
- Security-relevant packages → [../06-Reference/SecurityControls.md](../06-Reference/SecurityControls.md)
- If the print-agent defect is fixed, update §4/§13 here **and**
  [LocalDevelopment.md](LocalDevelopment.md#7-print-agent-development-setup).

---

## 15. Dependency-Maintenance Checklist

- [ ] Change is scoped to one component's manifest (and lockfile, for frontend).
- [ ] Backend `requirements.txt` edits preserved **UTF-16LE** encoding.
- [ ] Reinstalled cleanly (`pip install -r …` / `npm ci`).
- [ ] Affected component validated (§11); other components not assumed.
- [ ] Changelog reviewed for breaking changes on major bumps.
- [ ] Lockfile committed with the `package.json` change (frontend).
- [ ] Documentation updated where versions/setup changed (§14).
- [ ] Print-agent manifest defect left intact unless intentionally closing it.
