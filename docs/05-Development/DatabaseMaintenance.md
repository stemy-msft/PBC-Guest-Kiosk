# Database Maintenance

## 1. Database Overview

The backend persists all state in a single **SQLite** database accessed through
**SQLAlchemy**. The schema is defined by the ORM models in
`backend/app/models.py`. On startup the application creates any missing tables
and applies a small set of **inline, idempotent migrations** to add columns that
`create_all()` cannot add to pre-existing tables. There is **no Alembic or other
migration framework** in this repository.

This document explains how the database is located, created, and migrated, and
how to change it safely. Operational recovery procedures are not duplicated here;
they live in
[../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)
and [../DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md).

---

## 2. SQLite Location and Working-Directory Dependency

`backend/app/database.py` defines the connection URL as a **hardcoded, relative**
path:

```python
DATABASE_URL = "sqlite:///visitor_kiosk.db"
```

There is **no environment variable override**. The path is relative to the
process working directory, so:

- Starting the backend from `backend/` creates/opens **`backend/visitor_kiosk.db`**
  — the intended location, aligned with the backend's base directory.
- Starting it from anywhere else creates/opens a *different* database file in
  that other directory.

> **Always start the backend from `backend/`** (see
> [LocalDevelopment.md](LocalDevelopment.md#9-starting-the-backend)). A
> misplaced working directory is the most common cause of "my data disappeared"
> and "no such table" confusion.

The engine is created with `check_same_thread=False`; sessions are provided by
`SessionLocal` and the `get_db` dependency.

---

## 3. Schema Ownership

- **`backend/app/models.py`** is the source of truth for the schema: tables and
  columns are defined as SQLAlchemy ORM models bound to `Base`.
- **`backend/app/main.py`** owns table creation and the inline migrations that
  reconcile a pre-existing database with newer model columns.

If you add or change a model, both places may need attention (§7).

---

## 4. Table Creation

At **import time**, before the FastAPI app is constructed, `main.py` runs:

```python
Base.metadata.create_all(bind=engine)
```

`create_all()` creates any **missing tables** from the models. It does **not**
alter existing tables — it never adds, drops, or changes columns on a table that
already exists. That limitation is exactly why the inline migrations in §5 exist.

The same import-time startup also creates runtime directories and bootstraps the
default administrator; see
[LocalDevelopment.md](LocalDevelopment.md#9-starting-the-backend).

---

## 5. Current Inline Migration Behavior

After `create_all()`, `main.py` runs three **idempotent** migration functions at
import time. Each inspects the live schema with `PRAGMA table_info(<table>)` and
issues `ALTER TABLE ... ADD COLUMN` only for columns that are missing, logging
what it added:

| Function | Table | Columns added if missing |
| --- | --- | --- |
| `_apply_print_jobs_ownership_migration` | `print_jobs` | `claimed_by_agent_id`, `claim_expires_at`, `claim_generation`, `attempt_count`, `last_recovery_reason` |
| `_apply_visitors_station_migration` | `visitors` | `print_station_id` |
| `_apply_users_lockout_migration` | `users` | `locked_until` |

Key properties, verified in code:

- **Idempotent:** re-running against an already-migrated database is a no-op
  (the `PRAGMA` check finds the columns and skips the `ALTER`).
- **Additive only:** these migrations only *add* columns. They never drop or
  rename columns and never delete data.
- **Import-time:** they run when `app.main` is imported (including under the test
  harness, which points them at the in-memory database).

---

## 6. Absence or Presence of Formal Migration Tooling

There is **no Alembic** and **no other migration framework** in this repository.
There is no `alembic.ini`, no `migrations/` directory, and no versioned
migration scripts for the kiosk backend. Schema evolution is handled entirely by
`create_all()` plus the hand-written inline `ALTER TABLE` migrations in §5.

> Do not introduce a migration framework as a side effect of unrelated work.
> Adopting one would be its own scoped decision and change.

---

## 7. Safe Schema-Change Procedure

When you need to change the schema:

1. **Back up first** if the target database holds data you care about (§8).
2. **Update the model** in `backend/app/models.py`.
3. **Decide how existing databases reconcile:**
   - A brand-new table is handled automatically by `create_all()`.
   - A **new column on an existing table** is *not* handled by `create_all()`;
     add an idempotent inline migration in `main.py` following the exact pattern
     in §5 (PRAGMA check, then `ALTER TABLE ... ADD COLUMN`).
4. **Provide safe defaults** for new non-nullable columns (the existing
   migrations use `NOT NULL DEFAULT` where required) so existing rows remain
   valid.
5. **Add or update tests** — e.g. `test_schema_contracts.py` — to cover the new
   shape. See [Testing.md](Testing.md).
6. **Validate** on a copy: run the backend against a scratch database and confirm
   the migration applies once and is a no-op on the second start.

> SQLite cannot drop or alter a column in place with a simple `ALTER`. A
> destructive or type-changing schema change is a significant operation
> (table rebuild) and must be planned deliberately, with a backup and a tested
> procedure — it is **not** part of the additive inline-migration pattern.

---

## 8. Backup Before Schema Changes

Take a verified snapshot before any schema change against a database with real
data. The backup core (`backend/app/backup.py`) copies the database with the
SQLite **online-backup API** and runs `PRAGMA integrity_check` on every snapshot:

```bash
python scripts/backup.py backup
python scripts/backup.py list
```

Snapshots are written under `backend/backups/<UTC-timestamp>[__label]/` and
contain the database, the `uploads/` subtrees, and the live `config/` files.
Retention keeps the newest 14 by default. Full details and operational context
are in
[../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md).

---

## 9. Development Database Reset

> **Destructive — deletes all local development data.** Only do this on a
> development database you are willing to lose. Back up first (§8) if unsure.

To reset the development database to a clean state:

1. **Stop the backend** (Ctrl+C) and any print agents.
2. **Delete** the database file and its SQLite sidecars from `backend/`:

   ```powershell
   # Windows PowerShell, from backend/
   Remove-Item visitor_kiosk.db, visitor_kiosk.db-wal, visitor_kiosk.db-shm, visitor_kiosk.db-journal -ErrorAction SilentlyContinue
   ```

   ```bash
   # macOS/Linux, from backend/
   rm -f visitor_kiosk.db visitor_kiosk.db-wal visitor_kiosk.db-shm visitor_kiosk.db-journal
   ```

3. **Restart the backend** from `backend/`. It will recreate the tables, apply
   the inline migrations, create runtime directories, and bootstrap the default
   administrator.

Uploaded photos, badges, and logs under `backend/uploads/` and `backend/logs/`
are independent of the database; delete them separately if you want a fully
clean environment.

---

## 10. Inspecting the Database

Inspection is read-only and safe. Use the SQLite CLI if installed:

```bash
sqlite3 backend/visitor_kiosk.db ".tables"
sqlite3 backend/visitor_kiosk.db ".schema users"
```

If the `sqlite3` CLI is not available (common on Windows), use the Python
standard library — no extra dependency required:

```bash
python -c "import sqlite3; c=sqlite3.connect('backend/visitor_kiosk.db'); print([r[0] for r in c.execute(\"select name from sqlite_master where type='table'\")])"
```

Prefer inspecting a **copy** or a stopped database if you need to browse while
avoiding any interaction with a running backend.

---

## 11. Data Integrity Considerations

- Every backup snapshot is integrity-checked (`PRAGMA integrity_check`); a copy
  that fails is not counted as a valid backup.
- The database holds **visitor PII** (names, and photos referenced under
  `backend/uploads/photos/`). Treat both the database and the uploads as
  sensitive; both are git-ignored and must never be committed.
- The inline migrations are additive and preserve existing rows. Any procedure
  that would delete or transform data is out of scope for the automatic startup
  path and must be done deliberately with a backup.

---

## 12. Runtime File Relationships

The database is one part of a larger runtime state that must be kept consistent:

| Path | Relationship to the database |
| --- | --- |
| `backend/visitor_kiosk.db` | The database itself |
| `backend/visitor_kiosk.db-wal` / `-shm` / `-journal` | SQLite sidecars; must not be separated from the DB |
| `backend/uploads/photos/` | Visitor photos referenced by DB rows |
| `backend/uploads/badges/`, `qr-codes/`, `theme-logos/` | Generated artifacts and operator content |
| `backend/config/system_settings.json`, `user_themes.json` | Live settings that pair with operational data |

A backup snapshot captures the database **together with** the uploads and live
config so the set stays consistent on restore.

---

## 13. Restore and Rollback Considerations

Restore is the rollback mechanism for a bad schema change or data loss. It is
**destructive** to the current state:

- **Stop the backend and print agents first.**
- A **pre-restore safety snapshot** is taken automatically unless `--no-safety`
  is passed, so an overwrite restore is itself reversible.
- Restore clears the SQLite sidecars (`-wal`, `-shm`, `-journal`) next to the
  live database so a stale journal cannot shadow the restored file.

```bash
python scripts/restore.py restore --from backend/backups/<snapshot>
```

Do not duplicate the operational runbook here — follow
[../03-Operations/BackupAndRecovery.md](../03-Operations/BackupAndRecovery.md)
and [../DISASTER-RECOVERY.md](../DISASTER-RECOVERY.md).

---

## 14. Prohibited Shortcuts

- **Do not** hand-edit the database file with ad-hoc `UPDATE`/`DELETE`/`DROP`
  against a running system to "fix" data; take a backup and use a deliberate,
  reviewed procedure.
- **Do not** move the database out of `backend/`, or start the backend from a
  different directory, to relocate it — the path is hardcoded relative to the
  working directory.
- **Do not** add a migration framework, retention/anonymization/auto-deletion
  behavior, or destructive "auto-fix" migrations. None exist today; inventing
  them is out of scope.
- **Do not** commit the database, sidecars, backups, or uploads.

---

## 15. Validation Checklist

After a database or schema change:

- [ ] Backup taken and verified before touching a database with real data (§8).
- [ ] Model updated in `models.py`; new-column migration added to `main.py`
  following the §5 pattern.
- [ ] Backend starts cleanly from `backend/`; migration applies once and is a
  no-op on the second start (idempotent).
- [ ] `backend/tests/test_schema_contracts.py` (and any affected tests) pass.
- [ ] No data loss on existing rows; new non-nullable columns have defaults.
- [ ] Database, sidecars, backups, and uploads remain git-ignored (none staged).

---

## 16. Known Database-Maintenance Risks

- **Working-directory sensitivity.** The hardcoded relative path means the wrong
  CWD silently creates a second database. This is the single largest footgun.
- **No formal migrations.** Column additions rely on hand-written inline
  migrations; destructive/renaming changes have no framework support and require
  a manual table-rebuild procedure with a backup.
- **SQLite ALTER limitations.** You cannot drop or retype a column with a simple
  `ALTER`; such changes are non-trivial in SQLite.
- **PII in the database and uploads.** Both are sensitive and must be protected
  and never committed.
- **Consistency across files.** The database, its sidecars, uploads, and live
  config must be backed up and restored together to stay consistent.
