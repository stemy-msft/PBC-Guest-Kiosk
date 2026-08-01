#!/usr/bin/env python3
"""Thin CLI wrapper: create a verified PBC Guest Kiosk backup snapshot.

Runnable from anywhere; adds ``backend/`` to sys.path so the ``app.backup``
core module is importable. All logic lives in ``backend/app/backup.py``.

Examples:
    python scripts/backup.py backup
    python scripts/backup.py backup --dest D:/kiosk-backups --retention 30
    python scripts/backup.py list
    python scripts/backup.py verify --from backend/backups/20260801-153000Z
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.backup import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
