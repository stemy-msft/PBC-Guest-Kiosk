"""PBC Guest Kiosk — backup & restore core (M9.1 Recovery & Backup Hardening).

Stdlib-only and intentionally decoupled from the FastAPI application so it can
run as a standalone operational tool AND be unit-tested without standing up the
server or touching the operational database.

Crash consistency
-----------------
The SQLite database is copied with the online backup API
(``sqlite3.Connection.backup``), never a raw file copy. A snapshot taken while
the backend is running (WAL or rollback-journal mode) is therefore
transactionally consistent. Every snapshot's database copy is verified with
``PRAGMA integrity_check`` before the backup is considered complete — a copy
that fails the check raises and is not counted as a valid backup.

Layout of a snapshot directory::

    <backup_root>/<UTC-timestamp>[__label]/
        manifest.json
        visitor_kiosk.db            # consistent online-backup copy (if present)
        uploads/{photos,badges,qr-codes,theme-logos}/...
        config/system_settings.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

TOOL_VERSION = "1.0.0"
MANIFEST_NAME = "manifest.json"
DB_FILENAME = "visitor_kiosk.db"
UPLOADS_DIRNAME = "uploads"
CONFIG_DIRNAME = "config"
SETTINGS_FILENAME = "system_settings.json"

# Upload categories captured by a backup. Photos hold visitor PII; badges/QR
# are regenerable but slow to reproduce; theme-logos are operator content.
UPLOAD_SUBDIRS = ("photos", "badges", "qr-codes", "theme-logos")

# SQLite sidecar files that must be cleared next to the live DB on restore so a
# stale journal/WAL can never shadow the freshly restored database file.
_SQLITE_SIDECARS = ("-wal", "-shm", "-journal")

# This file is backend/app/backup.py -> BACKEND_DIR is backend/.
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / DB_FILENAME
DEFAULT_UPLOADS_DIR = BACKEND_DIR / UPLOADS_DIRNAME
DEFAULT_CONFIG_FILE = BACKEND_DIR / CONFIG_DIRNAME / SETTINGS_FILENAME
DEFAULT_BACKUP_ROOT = BACKEND_DIR / "backups"
DEFAULT_RETENTION = 14


class BackupError(RuntimeError):
    """Raised when a backup or restore cannot be completed safely."""


# --------------------------------------------------------------------------- #
# Low-level primitives
# --------------------------------------------------------------------------- #
def backup_sqlite(src_db: Path, dst_db: Path) -> None:
    """Copy ``src_db`` to ``dst_db`` using SQLite's consistent online backup."""
    dst_db.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(str(src_db))
    try:
        dst = sqlite3.connect(str(dst_db))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def integrity_check(db_path: Path) -> bool:
    """Return True iff ``PRAGMA integrity_check`` reports a single ``ok`` row.

    A file that is not a valid SQLite database (corrupted/truncated) raises
    ``sqlite3.DatabaseError``; that is treated as a failed check rather than
    propagating, so callers get a clean boolean verdict.
    """
    try:
        conn = sqlite3.connect(str(db_path))
        try:
            rows = conn.execute("PRAGMA integrity_check").fetchall()
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return False
    return len(rows) == 1 and rows[0][0] == "ok"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _count_files(directory: Path) -> int:
    if not directory.exists():
        return 0
    return sum(1 for p in directory.rglob("*") if p.is_file())


def _utc_stamp(now: datetime) -> str:
    return now.astimezone(timezone.utc).strftime("%Y%m%d-%H%M%SZ")


# --------------------------------------------------------------------------- #
# Backup
# --------------------------------------------------------------------------- #
def create_backup(
    *,
    db_path: Path = DEFAULT_DB_PATH,
    uploads_dir: Path = DEFAULT_UPLOADS_DIR,
    config_file: Path = DEFAULT_CONFIG_FILE,
    backup_root: Path = DEFAULT_BACKUP_ROOT,
    retention: int | None = DEFAULT_RETENTION,
    label: str | None = None,
    now: datetime | None = None,
) -> dict:
    """Create one verified snapshot and return its manifest (incl. ``path``).

    The database is captured via the online backup API and integrity-checked;
    a failed check raises ``BackupError`` and the snapshot is not retained.
    Missing sources are recorded as ``present: false`` rather than failing, so a
    fresh install with no uploads yet still produces a valid backup.
    """
    db_path = Path(db_path)
    uploads_dir = Path(uploads_dir)
    config_file = Path(config_file)
    backup_root = Path(backup_root)
    now = now or datetime.now(timezone.utc)

    stamp = _utc_stamp(now)
    dir_name = f"{stamp}__{label}" if label else stamp
    dest = backup_root / dir_name
    counter = 1
    while dest.exists():
        dest = backup_root / f"{dir_name}-{counter}"
        counter += 1
    dest.mkdir(parents=True)

    manifest: dict = {
        "tool_version": TOOL_VERSION,
        "created_utc": now.astimezone(timezone.utc).isoformat(),
        "label": label,
        "database": {"present": False},
        "uploads": {},
        "config": {"present": False},
    }

    # --- Database (consistent online backup + integrity verification) ---
    if db_path.exists():
        dst_db = dest / DB_FILENAME
        backup_sqlite(db_path, dst_db)
        if not integrity_check(dst_db):
            shutil.rmtree(dest, ignore_errors=True)
            raise BackupError(
                f"Integrity check FAILED on backup copy of {db_path}; "
                "snapshot discarded."
            )
        manifest["database"] = {
            "present": True,
            "filename": DB_FILENAME,
            "bytes": dst_db.stat().st_size,
            "sha256": sha256_file(dst_db),
            "integrity": "ok",
        }

    # --- Uploads (photos/badges/qr-codes/theme-logos) ---
    for sub in UPLOAD_SUBDIRS:
        src_sub = uploads_dir / sub
        if src_sub.exists():
            dst_sub = dest / UPLOADS_DIRNAME / sub
            shutil.copytree(src_sub, dst_sub)
            manifest["uploads"][sub] = {"present": True, "files": _count_files(dst_sub)}
        else:
            manifest["uploads"][sub] = {"present": False, "files": 0}

    # --- Configuration required for recovery ---
    if config_file.exists():
        dst_cfg = dest / CONFIG_DIRNAME / config_file.name
        dst_cfg.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(config_file, dst_cfg)
        manifest["config"] = {"present": True, "filename": config_file.name}

    manifest["path"] = str(dest)
    (dest / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    if retention is not None and retention > 0:
        prune_backups(backup_root, retention)

    return manifest


def list_backups(backup_root: Path) -> list[Path]:
    """Return snapshot directories (those with a manifest), newest first."""
    backup_root = Path(backup_root)
    if not backup_root.exists():
        return []
    snapshots = [
        child
        for child in backup_root.iterdir()
        if child.is_dir() and (child / MANIFEST_NAME).exists()
    ]
    return sorted(snapshots, key=lambda p: p.name, reverse=True)


def prune_backups(backup_root: Path, retention: int) -> list[Path]:
    """Delete snapshots beyond the newest ``retention``; return removed dirs."""
    removed: list[Path] = []
    for old in list_backups(backup_root)[retention:]:
        shutil.rmtree(old, ignore_errors=True)
        removed.append(old)
    return removed


def verify_backup(backup_dir: Path) -> dict:
    """Validate a snapshot: manifest present, DB integrity + sha256 match."""
    backup_dir = Path(backup_dir)
    manifest_path = backup_dir / MANIFEST_NAME
    if not manifest_path.exists():
        raise BackupError(f"No manifest found in {backup_dir}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    result = {"path": str(backup_dir), "database": "absent", "uploads_ok": True}

    db_info = manifest.get("database", {})
    if db_info.get("present"):
        db_copy = backup_dir / db_info.get("filename", DB_FILENAME)
        if not db_copy.exists():
            raise BackupError(f"Manifest lists a database but {db_copy} is missing")
        if not integrity_check(db_copy):
            raise BackupError(f"Integrity check FAILED for {db_copy}")
        if sha256_file(db_copy) != db_info.get("sha256"):
            raise BackupError(f"SHA-256 mismatch for {db_copy} (backup corrupted)")
        result["database"] = "ok"

    return result


# --------------------------------------------------------------------------- #
# Restore
# --------------------------------------------------------------------------- #
def _clear_sqlite_sidecars(db_path: Path) -> None:
    for suffix in _SQLITE_SIDECARS:
        sidecar = Path(str(db_path) + suffix)
        if sidecar.exists():
            sidecar.unlink()


def restore_backup(
    *,
    backup_dir: Path,
    db_path: Path = DEFAULT_DB_PATH,
    uploads_dir: Path = DEFAULT_UPLOADS_DIR,
    config_file: Path = DEFAULT_CONFIG_FILE,
    make_safety: bool = True,
    safety_backup_root: Path | None = None,
) -> dict:
    """Restore a verified snapshot over the live locations.

    The backup is verified first (``verify_backup``). When ``make_safety`` is
    set and any live data exists, a pre-restore safety snapshot of the CURRENT
    state is taken first, so an overwrite restore is itself reversible. The
    caller (runbook) is responsible for stopping the backend before restoring.
    """
    backup_dir = Path(backup_dir)
    db_path = Path(db_path)
    uploads_dir = Path(uploads_dir)
    config_file = Path(config_file)

    manifest = json.loads((backup_dir / MANIFEST_NAME).read_text(encoding="utf-8"))
    verify_backup(backup_dir)

    summary: dict = {
        "source": str(backup_dir),
        "safety_backup": None,
        "database_restored": False,
        "uploads_restored": {},
        "config_restored": False,
    }

    live_data_exists = db_path.exists() or any(
        (uploads_dir / sub).exists() for sub in UPLOAD_SUBDIRS
    )
    if make_safety and live_data_exists:
        safety_root = safety_backup_root or (db_path.parent / "backups")
        safety = create_backup(
            db_path=db_path,
            uploads_dir=uploads_dir,
            config_file=config_file,
            backup_root=safety_root,
            retention=None,
            label="pre-restore",
        )
        summary["safety_backup"] = safety["path"]

    # --- Database: rebuild a clean file via the online backup API ---
    db_info = manifest.get("database", {})
    if db_info.get("present"):
        src_db = backup_dir / db_info.get("filename", DB_FILENAME)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _clear_sqlite_sidecars(db_path)
        if db_path.exists():
            db_path.unlink()
        backup_sqlite(src_db, db_path)
        if not integrity_check(db_path):
            raise BackupError("Restored database failed integrity check")
        summary["database_restored"] = True

    # --- Uploads: replace each captured category wholesale ---
    for sub in UPLOAD_SUBDIRS:
        src_sub = backup_dir / UPLOADS_DIRNAME / sub
        if src_sub.exists():
            dst_sub = uploads_dir / sub
            if dst_sub.exists():
                shutil.rmtree(dst_sub)
            shutil.copytree(src_sub, dst_sub)
            summary["uploads_restored"][sub] = _count_files(dst_sub)

    # --- Configuration ---
    cfg_info = manifest.get("config", {})
    if cfg_info.get("present"):
        src_cfg = backup_dir / CONFIG_DIRNAME / cfg_info.get(
            "filename", SETTINGS_FILENAME
        )
        if src_cfg.exists():
            config_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_cfg, config_file)
            summary["config_restored"] = True

    return summary


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pbc-backup",
        description="PBC Guest Kiosk backup / restore / verify tool.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("backup", help="Create a verified snapshot.")
    b.add_argument("--db", default=str(DEFAULT_DB_PATH))
    b.add_argument("--uploads", default=str(DEFAULT_UPLOADS_DIR))
    b.add_argument("--config", default=str(DEFAULT_CONFIG_FILE))
    b.add_argument("--dest", default=str(DEFAULT_BACKUP_ROOT))
    b.add_argument("--retention", type=int, default=DEFAULT_RETENTION)
    b.add_argument("--label", default=None)

    r = sub.add_parser("restore", help="Restore a snapshot (stop backend first).")
    r.add_argument("--from", dest="source", required=True)
    r.add_argument("--db", default=str(DEFAULT_DB_PATH))
    r.add_argument("--uploads", default=str(DEFAULT_UPLOADS_DIR))
    r.add_argument("--config", default=str(DEFAULT_CONFIG_FILE))
    r.add_argument("--no-safety", action="store_true", help="Skip pre-restore snapshot.")
    r.add_argument("--yes", action="store_true", help="Do not prompt for confirmation.")

    v = sub.add_parser("verify", help="Verify a snapshot's integrity.")
    v.add_argument("--from", dest="source", required=True)

    sub.add_parser("list", help="List snapshots (newest first).").add_argument(
        "--dest", default=str(DEFAULT_BACKUP_ROOT)
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.command == "backup":
        m = create_backup(
            db_path=Path(args.db),
            uploads_dir=Path(args.uploads),
            config_file=Path(args.config),
            backup_root=Path(args.dest),
            retention=args.retention,
            label=args.label,
        )
        db = m["database"]
        print(f"Backup created: {m['path']}")
        print(
            "  database: "
            + ("ok" if db.get("present") else "absent")
            + (f" ({db['bytes']} bytes)" if db.get("present") else "")
        )
        for sub, info in m["uploads"].items():
            print(f"  uploads/{sub}: {info['files']} file(s)")
        print(f"  config: {'ok' if m['config'].get('present') else 'absent'}")
        return 0

    if args.command == "restore":
        if not args.yes:
            reply = input(
                f"Restore {args.source} over live data at {args.db}? [y/N] "
            ).strip().lower()
            if reply not in ("y", "yes"):
                print("Aborted.")
                return 1
        s = restore_backup(
            backup_dir=Path(args.source),
            db_path=Path(args.db),
            uploads_dir=Path(args.uploads),
            config_file=Path(args.config),
            make_safety=not args.no_safety,
        )
        print(f"Restored from: {s['source']}")
        if s["safety_backup"]:
            print(f"  pre-restore safety snapshot: {s['safety_backup']}")
        print(f"  database restored: {s['database_restored']}")
        for sub, count in s["uploads_restored"].items():
            print(f"  uploads/{sub}: {count} file(s)")
        print(f"  config restored: {s['config_restored']}")
        return 0

    if args.command == "verify":
        result = verify_backup(Path(args.source))
        print(f"Verified: {result['path']}  database={result['database']}")
        return 0

    if args.command == "list":
        for snap in list_backups(Path(args.dest)):
            print(snap)
        return 0

    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BackupError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
