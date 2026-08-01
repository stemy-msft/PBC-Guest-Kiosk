"""M9.1 Recovery & Backup Hardening — backup/restore + recovery validation.

Two concerns are covered:

1. Backup / restore core (``app.backup``) exercised against throwaway temp
   directories only. The operational ``visitor_kiosk.db`` is never referenced.

2. Print-recovery validation (``app.main.recover_stale_print_jobs``) exercised
   against a file-backed temporary SQLite database built from the real ORM
   schema, including a full backup -> restore round-trip proving visitor and
   print records survive and recovery logic still functions on restored data.

All databases used here live under pytest's ``tmp_path``; none touch the real
operational database or the conftest in-memory engine.
"""

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.backup import (
    BackupError,
    create_backup,
    integrity_check,
    list_backups,
    restore_backup,
    verify_backup,
)
from app.database import Base
from app.main import PRINT_JOB_MAX_ATTEMPTS, recover_stale_print_jobs
from app.models import PrintAgent, PrintJob, PrintStation, Visitor


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _make_sample_db(path):
    """Create a tiny on-disk SQLite DB with representative data."""
    conn = sqlite3.connect(str(path))
    conn.execute("CREATE TABLE visitors (id INTEGER PRIMARY KEY, name TEXT)")
    conn.executemany(
        "INSERT INTO visitors (name) VALUES (?)",
        [("Alice",), ("Bob",), ("Carol",)],
    )
    conn.commit()
    conn.close()


def _make_uploads(root):
    """Create a populated uploads tree; return counts per subdir."""
    counts = {"photos": 2, "badges": 1, "qr-codes": 1, "theme-logos": 0}
    for sub, n in counts.items():
        d = root / sub
        d.mkdir(parents=True, exist_ok=True)
        for i in range(n):
            (d / f"{sub}-{i}.bin").write_bytes(b"x" * (10 + i))
    return counts


@pytest.fixture
def live_env(tmp_path):
    """A simulated live install: db + uploads + config under tmp_path."""
    db = tmp_path / "visitor_kiosk.db"
    uploads = tmp_path / "uploads"
    config = tmp_path / "config" / "system_settings.json"
    backups = tmp_path / "backups"

    _make_sample_db(db)
    _make_uploads(uploads)
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text('{"camp_name": "PBC"}', encoding="utf-8")

    return {
        "db": db,
        "uploads": uploads,
        "config": config,
        "backups": backups,
        "root": tmp_path,
    }


# --------------------------------------------------------------------------- #
# Backup capability
# --------------------------------------------------------------------------- #
class TestBackup:
    def test_backup_captures_db_uploads_and_config(self, live_env):
        m = create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        dest = Path(m["path"])

        assert m["database"]["present"] is True
        assert m["database"]["integrity"] == "ok"
        assert m["database"]["sha256"]
        assert m["uploads"]["photos"]["files"] == 2
        assert m["uploads"]["badges"]["files"] == 1
        assert m["uploads"]["theme-logos"]["files"] == 0
        assert m["config"]["present"] is True

        # Files physically present in the snapshot directory.
        assert dest.exists()
        assert (dest / "visitor_kiosk.db").exists()
        assert (dest / "manifest.json").exists()
        assert (dest / "config" / "system_settings.json").exists()

    def test_backup_uses_consistent_copy_that_passes_integrity(self, live_env):
        m = create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        db_copy = list_backups(live_env["backups"])[0] / "visitor_kiosk.db"
        assert integrity_check(db_copy) is True
        # Row data is really present in the copy (not just an empty file).
        conn = sqlite3.connect(str(db_copy))
        try:
            count = conn.execute("SELECT COUNT(*) FROM visitors").fetchone()[0]
        finally:
            conn.close()
        assert count == 3

    def test_backup_succeeds_with_no_database_yet(self, tmp_path):
        # Fresh install: no db, no uploads, no config.
        m = create_backup(
            db_path=tmp_path / "missing.db",
            uploads_dir=tmp_path / "uploads",
            config_file=tmp_path / "config" / "system_settings.json",
            backup_root=tmp_path / "backups",
        )
        assert m["database"]["present"] is False
        assert m["config"]["present"] is False

    def test_retention_prunes_oldest_snapshots(self, live_env):
        stamps = [
            datetime(2026, 8, 1, 10, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 8, 1, 11, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 8, 1, 13, 0, 0, tzinfo=timezone.utc),
        ]
        for ts in stamps:
            create_backup(
                db_path=live_env["db"],
                uploads_dir=live_env["uploads"],
                config_file=live_env["config"],
                backup_root=live_env["backups"],
                retention=2,
                now=ts,
            )
        remaining = list_backups(live_env["backups"])
        assert len(remaining) == 2
        # Newest two kept (13:00 and 12:00).
        names = [p.name for p in remaining]
        assert names[0].startswith("20260801-130000Z")
        assert names[1].startswith("20260801-120000Z")


# --------------------------------------------------------------------------- #
# Verify / corruption detection
# --------------------------------------------------------------------------- #
class TestVerify:
    def test_verify_passes_for_good_backup(self, live_env):
        create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        snap = list_backups(live_env["backups"])[0]
        result = verify_backup(snap)
        assert result["database"] == "ok"

    def test_verify_detects_tampered_database(self, live_env):
        create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        snap = list_backups(live_env["backups"])[0]
        # Corrupt the backup DB copy after the fact.
        (snap / "visitor_kiosk.db").write_bytes(b"not a database")
        with pytest.raises(BackupError):
            verify_backup(snap)

    def test_verify_requires_manifest(self, tmp_path):
        empty = tmp_path / "not-a-backup"
        empty.mkdir()
        with pytest.raises(BackupError):
            verify_backup(empty)


# --------------------------------------------------------------------------- #
# Restore capability
# --------------------------------------------------------------------------- #
class TestRestore:
    def test_restore_into_clean_environment(self, live_env, tmp_path):
        create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        snap = list_backups(live_env["backups"])[0]

        clean = tmp_path / "clean"
        target_db = clean / "visitor_kiosk.db"
        target_uploads = clean / "uploads"
        target_config = clean / "config" / "system_settings.json"

        summary = restore_backup(
            backup_dir=snap,
            db_path=target_db,
            uploads_dir=target_uploads,
            config_file=target_config,
            make_safety=False,
        )
        assert summary["database_restored"] is True
        assert summary["safety_backup"] is None
        assert target_db.exists()
        assert integrity_check(target_db) is True
        assert (target_uploads / "photos" / "photos-0.bin").exists()
        assert target_config.exists()
        # Data preserved.
        conn = sqlite3.connect(str(target_db))
        try:
            count = conn.execute("SELECT COUNT(*) FROM visitors").fetchone()[0]
        finally:
            conn.close()
        assert count == 3

    def test_restore_overwrite_takes_safety_snapshot_first(self, live_env, tmp_path):
        # First backup we will restore FROM.
        create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        snap = list_backups(live_env["backups"])[0]

        # Mutate live data so we can prove the safety snapshot captured it.
        conn = sqlite3.connect(str(live_env["db"]))
        conn.execute("INSERT INTO visitors (name) VALUES ('Dave')")
        conn.commit()
        conn.close()

        safety_root = tmp_path / "safety"
        summary = restore_backup(
            backup_dir=snap,
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            make_safety=True,
            safety_backup_root=safety_root,
        )
        # Overwrite restore reverted the live DB back to 3 rows.
        conn = sqlite3.connect(str(live_env["db"]))
        try:
            live_count = conn.execute("SELECT COUNT(*) FROM visitors").fetchone()[0]
        finally:
            conn.close()
        assert live_count == 3

        # The pre-restore safety snapshot preserved the 4-row state.
        assert summary["safety_backup"] is not None
        safety_snap = list_backups(safety_root)[0]
        safety_db = safety_snap / "visitor_kiosk.db"
        conn = sqlite3.connect(str(safety_db))
        try:
            safety_count = conn.execute("SELECT COUNT(*) FROM visitors").fetchone()[0]
        finally:
            conn.close()
        assert safety_count == 4

    def test_restore_clears_stale_wal_sidecar(self, live_env, tmp_path):
        create_backup(
            db_path=live_env["db"],
            uploads_dir=live_env["uploads"],
            config_file=live_env["config"],
            backup_root=live_env["backups"],
        )
        snap = list_backups(live_env["backups"])[0]

        clean = tmp_path / "clean"
        target_db = clean / "visitor_kiosk.db"
        target_db.parent.mkdir(parents=True)
        # Plant a stale WAL sidecar that must be removed on restore.
        stale_wal = clean / "visitor_kiosk.db-wal"
        stale_wal.write_bytes(b"stale")

        restore_backup(
            backup_dir=snap,
            db_path=target_db,
            uploads_dir=clean / "uploads",
            config_file=clean / "config" / "system_settings.json",
            make_safety=False,
        )
        assert not stale_wal.exists()


# --------------------------------------------------------------------------- #
# Print-recovery validation (against a file-backed ORM database)
# --------------------------------------------------------------------------- #
@pytest.fixture
def orm_db(tmp_path):
    """A file-backed SQLite DB with the real ORM schema + a session factory."""
    db_path = tmp_path / "recovery.db"
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    yield {"path": db_path, "engine": engine, "Session": Session}
    engine.dispose()


def _station(session):
    st = PrintStation(name="Front Gate", slug="front-gate", enabled=True)
    session.add(st)
    session.commit()
    return st


def _agent(session, station, *, last_seen):
    ag = PrintAgent(
        agent_key="agent-1",
        hostname="pi-front",
        print_station_id=station.id,
        enabled=True,
        last_seen=last_seen,
    )
    session.add(ag)
    session.commit()
    return ag


def _printing_job(session, station, agent, *, lease_expires, attempts=0):
    job = PrintJob(
        badge_path="uploads/badges/b1.pdf",
        status="Printing",
        print_station_id=station.id,
        created_time=datetime.utcnow(),
        claimed_by_agent_id=agent.id if agent else None,
        claim_expires_at=lease_expires,
        claim_generation=1,
        attempt_count=attempts,
    )
    session.add(job)
    session.commit()
    return job


class TestPrintRecovery:
    def test_agent_crash_expired_lease_requeues_job(self, orm_db):
        s = orm_db["Session"]()
        try:
            station = _station(s)
            # Agent last_seen well beyond stale threshold (crashed).
            agent = _agent(s, station, last_seen=datetime.utcnow() - timedelta(minutes=30))
            job = _printing_job(
                s, station, agent,
                lease_expires=datetime.utcnow() - timedelta(minutes=10),
            )
            gen_before = job.claim_generation

            recovered = recover_stale_print_jobs(s, station_id=station.id)
            s.refresh(job)

            assert recovered == 1
            assert job.status == "Pending"
            assert job.claimed_by_agent_id is None
            assert job.claim_expires_at is None
            assert job.claim_generation == gen_before + 1  # fences stale updates
        finally:
            s.close()

    def test_expired_lease_but_live_agent_is_left_alone(self, orm_db):
        s = orm_db["Session"]()
        try:
            station = _station(s)
            # Agent still heartbeating (slow print, not a crash).
            agent = _agent(s, station, last_seen=datetime.utcnow())
            job = _printing_job(
                s, station, agent,
                lease_expires=datetime.utcnow() - timedelta(minutes=10),
            )

            recovered = recover_stale_print_jobs(s, station_id=station.id)
            s.refresh(job)

            assert recovered == 0
            assert job.status == "Printing"  # untouched
        finally:
            s.close()

    def test_offline_station_agent_never_seen_is_recovered(self, orm_db):
        s = orm_db["Session"]()
        try:
            station = _station(s)
            agent = _agent(s, station, last_seen=None)  # never checked in
            job = _printing_job(
                s, station, agent,
                lease_expires=datetime.utcnow() - timedelta(minutes=10),
            )

            recovered = recover_stale_print_jobs(s, station_id=station.id)
            s.refresh(job)

            assert recovered == 1
            assert job.status == "Pending"
        finally:
            s.close()

    def test_retry_cap_marks_job_failed(self, orm_db):
        s = orm_db["Session"]()
        try:
            station = _station(s)
            agent = _agent(s, station, last_seen=datetime.utcnow() - timedelta(minutes=30))
            job = _printing_job(
                s, station, agent,
                lease_expires=datetime.utcnow() - timedelta(minutes=10),
                attempts=PRINT_JOB_MAX_ATTEMPTS,
            )

            recovered = recover_stale_print_jobs(s, station_id=station.id)
            s.refresh(job)

            assert recovered == 1
            assert job.status == "Failed"
            assert job.last_recovery_reason
            assert job.error_message
        finally:
            s.close()

    def test_recovery_still_works_after_backup_restore_round_trip(self, orm_db, tmp_path):
        # Seed a visitor + a stuck print job, then back up and restore into a
        # fresh location and prove records survive AND recovery still runs.
        s = orm_db["Session"]()
        try:
            visitor = Visitor(
                first_name="Grace",
                last_name="Hopper",
                visitor_type="Guest",
                purpose="Tour",
                host_type="Staff",
                host_name="Admin",
                check_in_time=datetime.utcnow(),
            )
            s.add(visitor)
            station = _station(s)
            agent = _agent(s, station, last_seen=datetime.utcnow() - timedelta(minutes=30))
            _printing_job(
                s, station, agent,
                lease_expires=datetime.utcnow() - timedelta(minutes=10),
            )
        finally:
            s.close()
        orm_db["engine"].dispose()  # release the file before snapshotting

        # Back up the file-backed DB and restore it into a clean path.
        backup_root = tmp_path / "backups"
        create_backup(
            db_path=orm_db["path"],
            uploads_dir=tmp_path / "no-uploads",
            config_file=tmp_path / "no-config.json",
            backup_root=backup_root,
        )
        snap = list_backups(backup_root)[0]

        restored_db = tmp_path / "restored" / "recovery.db"
        restore_backup(
            backup_dir=snap,
            db_path=restored_db,
            uploads_dir=tmp_path / "restored" / "uploads",
            config_file=tmp_path / "restored" / "config.json",
            make_safety=False,
        )

        engine2 = create_engine(f"sqlite:///{restored_db}")
        Session2 = sessionmaker(bind=engine2)
        s2 = Session2()
        try:
            # Records survived the restore.
            assert s2.query(Visitor).count() == 1
            assert s2.query(Visitor).first().last_name == "Hopper"
            stuck = s2.query(PrintJob).first()
            assert stuck.status == "Printing"

            # Recovery logic operates correctly on the restored data.
            recovered = recover_stale_print_jobs(s2)
            s2.refresh(stuck)
            assert recovered == 1
            assert stuck.status == "Pending"
        finally:
            s2.close()
            engine2.dispose()
