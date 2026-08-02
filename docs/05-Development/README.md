# 05 — Development and Maintenance

Canonical, source-verified guidance for **developing, testing, and maintaining**
the PBC Guest Kiosk. This section is written for a technically competent
maintainer who did not build the system and needs to work on it safely without
tribal knowledge.

Everything here is verified against the current repository — application code,
dependency manifests, scripts, tests, and configuration. Where the repository
does **not** encode a formal process (for example, branch naming or CI), the
guidance is explicitly labelled as a *recommendation* rather than an existing
rule.

> **Scope boundary.** This section covers the **development lifecycle**. It does
> not replace the deployment and operations sections:
>
> - Production install / hosting → [../02-Deployment/](../02-Deployment/README.md)
> - Day-to-day operation, backup/restore runbooks → [../03-Operations/Administration.md](../03-Operations/Administration.md)
> - Environment-variable and control reference → [../06-Reference/EnvironmentVariables.md](../06-Reference/EnvironmentVariables.md)

---

## Intended reading order

1. **[LocalDevelopment.md](LocalDevelopment.md)** — Stand up a working local
   environment for the backend, frontend, and (on Linux) the print agent.
2. **[RepositoryStructure.md](RepositoryStructure.md)** — Learn what every
   directory contains and, critically, which files are generated or runtime data
   and must not be mistaken for source.
3. **[DevelopmentWorkflow.md](DevelopmentWorkflow.md)** — How to scope, branch,
   change, validate, and hand off work.
4. **[Testing.md](Testing.md)** — The actual automated tests, how to run them,
   and where the coverage gaps are.
5. **[DatabaseMaintenance.md](DatabaseMaintenance.md)** — How the SQLite schema
   is created and migrated, and how to change it safely.
6. **[DependencyMaintenance.md](DependencyMaintenance.md)** — How dependencies
   are pinned and how to update them safely, including a known manifest defect.
7. **[ReleaseManagement.md](ReleaseManagement.md)** — Version sources, release
   stages, and the tagging practice the repository history actually shows.
8. **[MaintainerHandoff.md](MaintainerHandoff.md)** — The one-stop orientation
   and responsibility map for a new maintainer; read it first for navigation,
   last for sign-off.

A new maintainer taking ownership should start with
**[MaintainerHandoff.md](MaintainerHandoff.md)** for orientation, then follow the
order above.

---

## Audience

| Document | Primary audience |
| --- | --- |
| LocalDevelopment.md | Any developer setting up the project for the first time |
| RepositoryStructure.md | Anyone navigating or reviewing the codebase |
| DevelopmentWorkflow.md | Contributors making changes during the release-candidate phase |
| Testing.md | Contributors and reviewers validating changes |
| DatabaseMaintenance.md | Developers touching models, schema, or persisted data |
| DependencyMaintenance.md | Maintainers updating Python or npm dependencies |
| ReleaseManagement.md | Whoever prepares a release candidate or hand-off build |
| MaintainerHandoff.md | An incoming maintainer taking over the project |

---

## Ground rules referenced throughout this section

- **Run the backend from `backend/`.** The database path and all runtime
  directories are resolved relative to that working directory. See
  [DatabaseMaintenance.md](DatabaseMaintenance.md).
- **The print agent is Raspberry Pi / Linux + CUPS only.** There is no Windows
  print agent in this repository.
- **Passing automated tests are necessary but not sufficient for release.** They
  do not, by themselves, constitute operational or production approval. See
  [Testing.md](Testing.md) and [ReleaseManagement.md](ReleaseManagement.md).
- **There is one open release-candidate manifest defect** in the print agent
  (an undeclared `python-dotenv` dependency). It is documented, not fixed, in
  [DependencyMaintenance.md](DependencyMaintenance.md) and
  [LocalDevelopment.md](LocalDevelopment.md).
