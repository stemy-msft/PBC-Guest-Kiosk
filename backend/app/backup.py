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
        config/{system_settings.json,user_themes.json}
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

TOOL_VERSION = "1.1.0"
MANIFEST_NAME = "manifest.json"
DB_FILENAME = "visitor_kiosk.db"
UPLOADS_DIRNAME = "uploads"
CONFIG_DIRNAME = "config"

# Upload categories captured by a backup. Photos hold visitor PII; badges/QR
# are regenerable but slow to reproduce; theme-logos are operator content.
UPLOAD_SUBDIRS = ("photos", "badges", "qr-codes", "theme-logos")

# Every runtime-mutable, non-secret configuration file required to reconstruct
# operator state. ``system_settings.template.json`` is tracked in git and is
# NOT runtime state, so it is intentionally excluded.
CONFIG_FILENAMES = ("system_settings.json", "user_themes.json")

# SQLite sidecar files that must be cleared next to the live DB on restore so a
# stale journal/WAL can never shadow the freshly restored database file.
_SQLITE_SIDECARS = ("-wal", "-shm", "-journal")

# Backup-label safety. Labels become part of a directory name, so reject
# anything that could escape the backup root or produce an invalid path.
_MAX_LABEL_LEN = 64
_INVALID_LABEL_CHARS = set('<>:"/\\|?*')

# This file is backend/app/backup.py -> BACKEND_DIR is backend/.
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / DB_FILENAME
DEFAULT_UPLOADS_DIR = BACKEND_DIR / UPLOADS_DIRNAME
DEFAULT_CONFIG_DIR = BACKEND_DIR / CONFIG_DIRNAME
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


def _file_meta(path: Path, relpath: str) -> dict:
    """Return the manifest record (relpath/bytes/sha256) for one captured file."""
    return {
        "relpath": relpath,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def _sanitize_label(label: str | None) -> str | None:
    """Validate a user-supplied backup label used in a directory name.

    Rejects path separators, parent traversal, control characters, and
    filename-invalid characters so a label can never escape the backup root.
    """
    if label is None:
        return None
    if not isinstance(label, str) or not label.strip():
        raise BackupError("Backup label must be a non-empty string.")
    label = label.strip()
    if len(label) > _MAX_LABEL_LEN:
        raise BackupError(f"Backup label exceeds {_MAX_LABEL_LEN} characters.")
    if ".." in label or "/" in label or "\\" in label:
        raise BackupError("Backup label may not contain path separators or '..'.")
    for ch in label:
        if ord(ch) < 0x20 or ch in _INVALID_LABEL_CHARS:
            raise BackupError(f"Backup label contains an invalid character: {ch!r}")
    return label


def _resolve(path: Path) -> Path:
    return Path(path).resolve()


def _is_within(child: Path, parent: Path) -> bool:
    child, parent = _resolve(child), _resolve(parent)
    return child == parent or parent in child.parents


def _reject_capture_overlap(backup_root: Path, uploads_dir: Path) -> None:
    """Reject a backup destination that would recursively capture backups.

    Only the uploads tree is copied recursively, so a backup root nested inside
    it (or vice versa) would fold prior snapshots into new ones.
    """
    if _is_within(backup_root, uploads_dir) or _is_within(uploads_dir, backup_root):
        raise BackupError(
            f"Backup destination {backup_root} overlaps the uploads directory "
            f"{uploads_dir}; choose a separate location."
        )


def _load_manifest(backup_dir: Path) -> dict:
    """Load a snapshot manifest, normalizing every failure to BackupError."""
    manifest_path = Path(backup_dir) / MANIFEST_NAME
    if not manifest_path.exists():
        raise BackupError(f"No manifest found in {backup_dir}")
    try:
        text = manifest_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise BackupError(f"Manifest unreadable in {backup_dir}: {exc}") from exc
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise BackupError(f"Manifest malformed in {backup_dir}: {exc}") from exc
    if not isinstance(data, dict):
        raise BackupError(f"Manifest malformed in {backup_dir}: not an object")
    return data


def _verify_file(backup_dir: Path, meta: dict) -> None:
    """Assert one manifested file exists with the recorded size and checksum."""
    relpath = meta.get("relpath")
    if not relpath:
        raise BackupError(f"Manifest entry missing relpath: {meta!r}")
    path = Path(backup_dir) / relpath
    if not path.exists():
        raise BackupError(f"Backup file missing: {relpath}")
    if path.stat().st_size != meta.get("bytes"):
        raise BackupError(f"Size mismatch for {relpath} (backup corrupted)")
    if sha256_file(path) != meta.get("sha256"):
        raise BackupError(f"SHA-256 mismatch for {relpath} (backup corrupted)")



# --------------------------------------------------------------------------- #
# Backup
# --------------------------------------------------------------------------- #
def create_backup(
    *,
    db_path: Path = DEFAULT_DB_PATH,
    uploads_dir: Path = DEFAULT_UPLOADS_DIR,
    config_dir: Path = DEFAULT_CONFIG_DIR,
    config_filenames: tuple[str, ...] = CONFIG_FILENAMES,
    backup_root: Path = DEFAULT_BACKUP_ROOT,
    retention: int | None = DEFAULT_RETENTION,
    label: str | None = None,
    now: datetime | None = None,
) -> dict:
    """Create one verified snapshot and return its manifest (incl. ``path``).

    The database is captured via the online backup API and integrity-checked;
    a failed check raises ``BackupError``. Every captured upload and config file
    is recorded in the manifest with its relative path, byte size, and SHA-256.
    Missing sources are recorded as ``present: false`` (so a fresh install still
    produces a valid backup) which also lets restore reproduce the snapshot
    exactly by removing stale live content. Any failure removes the incomplete
    snapshot directory before re-raising.
    """
    db_path = Path(db_path)
    uploads_dir = Path(uploads_dir)
    config_dir = Path(config_dir)
    backup_root = Path(backup_root)
    label = _sanitize_label(label)
    _reject_capture_overlap(backup_root, uploads_dir)
    now = now or datetime.now(timezone.utc)

    stamp = _utc_stamp(now)
    dir_name = f"{stamp}__{label}" if label else stamp
    dest = backup_root / dir_name
    counter = 1
    while dest.exists():
        dest = backup_root / f"{dir_name}-{counter}"
        counter += 1
    dest.mkdir(parents=True)

    try:
        manifest: dict = {
            "tool_version": TOOL_VERSION,
            "created_utc": now.astimezone(timezone.utc).isoformat(),
            "label": label,
            "database": {"present": False},
            "uploads": {},
            "config": {},
        }

        # --- Database (consistent online backup + integrity verification) ---
        if db_path.exists():
            dst_db = dest / DB_FILENAME
            backup_sqlite(db_path, dst_db)
            if not integrity_check(dst_db):
                raise BackupError(
                    f"Integrity check FAILED on backup copy of {db_path}; "
                    "snapshot discarded."
                )
            manifest["database"] = {
                "present": True,
                **_file_meta(dst_db, DB_FILENAME),
                "integrity": "ok",
            }

        # --- Uploads (photos/badges/qr-codes/theme-logos) ---
        for sub in UPLOAD_SUBDIRS:
            src_sub = uploads_dir / sub
            if src_sub.exists():
                dst_sub = dest / UPLOADS_DIRNAME / sub
                shutil.copytree(src_sub, dst_sub)
                files = [
                    _file_meta(f, f.relative_to(dest).as_posix())
                    for f in sorted(dst_sub.rglob("*"))
                    if f.is_file()
                ]
                manifest["uploads"][sub] = {"present": True, "files": files}
            else:
                manifest["uploads"][sub] = {"present": False, "files": []}

        # --- Runtime configuration (system settings + user themes) ---
        for name in config_filenames:
            src_cfg = config_dir / name
            if src_cfg.exists():
                dst_cfg = dest / CONFIG_DIRNAME / name
                dst_cfg.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_cfg, dst_cfg)
                rel = dst_cfg.relative_to(dest).as_posix()
                manifest["config"][name] = {"present": True, **_file_meta(dst_cfg, rel)}
            else:
                manifest["config"][name] = {"present": False}

        manifest["path"] = str(dest)
        (dest / MANIFEST_NAME).write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
    except BaseException:
        # Never leave a half-written snapshot behind.
        shutil.rmtree(dest, ignore_errors=True)
        raise

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
    """Validate a snapshot: manifest, DB integrity, and EVERY manifested file.

    Each captured upload and config file is checked for existence, byte size,
    and SHA-256 against the manifest. Any discrepancy raises ``BackupError``.
    """
    backup_dir = Path(backup_dir)
    manifest = _load_manifest(backup_dir)
    result = {
        "path": str(backup_dir),
        "database": "absent",
        "uploads_files": 0,
        "config_files": 0,
    }

    db_info = manifest.get("database", {})
    if db_info.get("present"):
        db_copy = backup_dir / db_info.get("relpath", DB_FILENAME)
        if not db_copy.exists():
            raise BackupError(f"Manifest lists a database but {db_copy} is missing")
        if not integrity_check(db_copy):
            raise BackupError(f"Integrity check FAILED for {db_copy}")
        _verify_file(backup_dir, db_info)
        result["database"] = "ok"

    for info in manifest.get("uploads", {}).values():
        if info.get("present"):
            for meta in info.get("files", []):
                _verify_file(backup_dir, meta)
                result["uploads_files"] += 1

    for info in manifest.get("config", {}).values():
        if info.get("present"):
            _verify_file(backup_dir, info)
            result["config_files"] += 1

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
    config_dir: Path = DEFAULT_CONFIG_DIR,
    make_safety: bool = True,
    safety_backup_root: Path | None = None,
) -> dict:
    """Restore a verified snapshot, reproducing it EXACTLY over live locations.

    The backup is verified first (``verify_backup``). When ``make_safety`` is
    set and any live data exists (database, uploads, OR configuration), a
    pre-restore safety snapshot of the CURRENT state is taken first, so an
    overwrite restore is itself reversible. Managed upload/config categories
    recorded absent in the snapshot are REMOVED from the live tree rather than
    silently merged. The database is restored atomically: rebuilt into a
    temporary sibling, integrity-checked, then swapped in with ``os.replace``.
    The caller (runbook) is responsible for stopping the backend first.
    """
    backup_dir = Path(backup_dir)
    db_path = Path(db_path)
    uploads_dir = Path(uploads_dir)
    config_dir = Path(config_dir)

    # A snapshot stored inside a tree we are about to rewrite would be
    # partially deleted mid-restore.
    if _is_within(backup_dir, uploads_dir):
        raise BackupError(
            f"Backup {backup_dir} is inside the uploads directory being "
            "restored; move it out first."
        )
    if _is_within(backup_dir, config_dir):
        raise BackupError(
            f"Backup {backup_dir} is inside the config directory being "
            "restored; move it out first."
        )

    manifest = _load_manifest(backup_dir)
    verify_backup(backup_dir)

    summary: dict = {
        "source": str(backup_dir),
        "safety_backup": None,
        "database_restored": False,
        "uploads_restored": {},
        "uploads_removed": [],
        "config_restored": [],
        "config_removed": [],
    }

    # Managed config names = whatever the snapshot recorded, plus the standard
    # set, so a live file the snapshot omitted is still captured by the safety
    # snapshot and removed on restore.
    managed_config = list(
        dict.fromkeys([*manifest.get("config", {}).keys(), *CONFIG_FILENAMES])
    )

    live_data_exists = (
        db_path.exists()
        or any((uploads_dir / sub).exists() for sub in UPLOAD_SUBDIRS)
        or any((config_dir / name).exists() for name in managed_config)
    )
    if make_safety and live_data_exists:
        safety_root = safety_backup_root or (db_path.parent / "backups")
        safety = create_backup(
            db_path=db_path,
            uploads_dir=uploads_dir,
            config_dir=config_dir,
            backup_root=safety_root,
            retention=None,
            label="pre-restore",
        )
        summary["safety_backup"] = safety["path"]

    # --- Database: atomic rebuild via a temp sibling + os.replace ---
    db_info = manifest.get("database", {})
    if db_info.get("present"):
        src_db = backup_dir / db_info.get("relpath", DB_FILENAME)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_db = db_path.with_name(db_path.name + ".restore-tmp")
        if tmp_db.exists():
            tmp_db.unlink()
        _clear_sqlite_sidecars(tmp_db)
        backup_sqlite(src_db, tmp_db)
        if not integrity_check(tmp_db):
            tmp_db.unlink(missing_ok=True)
            raise BackupError("Restored database failed integrity check")
        _clear_sqlite_sidecars(db_path)
        os.replace(tmp_db, db_path)  # atomic swap on the same filesystem
        summary["database_restored"] = True

    # --- Uploads: reproduce the snapshot exactly (present -> replace, absent -> remove) ---
    for sub in UPLOAD_SUBDIRS:
        info = manifest.get("uploads", {}).get(sub, {"present": False})
        dst_sub = uploads_dir / sub
        src_sub = backup_dir / UPLOADS_DIRNAME / sub
        if info.get("present"):
            if dst_sub.exists():
                shutil.rmtree(dst_sub)
            if src_sub.exists():
                shutil.copytree(src_sub, dst_sub)
            else:
                dst_sub.mkdir(parents=True, exist_ok=True)
            summary["uploads_restored"][sub] = _count_files(dst_sub)
        elif dst_sub.exists():
            shutil.rmtree(dst_sub)
            summary["uploads_removed"].append(sub)

    # --- Configuration: reproduce exactly (present -> restore, absent -> remove) ---
    for name in managed_config:
        info = manifest.get("config", {}).get(name, {"present": False})
        dst_cfg = config_dir / name
        if info.get("present"):
            src_cfg = backup_dir / CONFIG_DIRNAME / name
            if src_cfg.exists():
                dst_cfg.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_cfg, dst_cfg)
                summary["config_restored"].append(name)
        elif dst_cfg.exists():
            dst_cfg.unlink()
            summary["config_removed"].append(name)

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
    b.add_argument("--config-dir", dest="config_dir", default=str(DEFAULT_CONFIG_DIR))
    b.add_argument("--dest", default=str(DEFAULT_BACKUP_ROOT))
    b.add_argument("--retention", type=int, default=DEFAULT_RETENTION)
    b.add_argument("--label", default=None)

    r = sub.add_parser("restore", help="Restore a snapshot (stop backend first).")
    r.add_argument("--from", dest="source", required=True)
    r.add_argument("--db", default=str(DEFAULT_DB_PATH))
    r.add_argument("--uploads", default=str(DEFAULT_UPLOADS_DIR))
    r.add_argument("--config-dir", dest="config_dir", default=str(DEFAULT_CONFIG_DIR))
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
            config_dir=Path(args.config_dir),
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
            count = len(info["files"]) if info.get("present") else 0
            print(f"  uploads/{sub}: {count} file(s)")
        present_cfg = [n for n, i in m["config"].items() if i.get("present")]
        print(f"  config: {', '.join(present_cfg) if present_cfg else 'none'}")
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
            config_dir=Path(args.config_dir),
            make_safety=not args.no_safety,
        )
        print(f"Restored from: {s['source']}")
        if s["safety_backup"]:
            print(f"  pre-restore safety snapshot: {s['safety_backup']}")
        print(f"  database restored: {s['database_restored']}")
        for sub, count in s["uploads_restored"].items():
            print(f"  uploads/{sub}: {count} file(s)")
        if s["uploads_removed"]:
            print(f"  uploads removed: {', '.join(s['uploads_removed'])}")
        if s["config_restored"]:
            print(f"  config restored: {', '.join(s['config_restored'])}")
        if s["config_removed"]:
            print(f"  config removed: {', '.join(s['config_removed'])}")
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
