#!/usr/bin/env python3
"""Thin CLI wrapper: restore a PBC Guest Kiosk backup snapshot.

STOP the backend (and print agents) before restoring. A pre-restore safety
snapshot of the current state is taken automatically unless --no-safety is
passed, so an overwrite restore is itself reversible.

Runnable from anywhere; adds ``backend/`` to sys.path so the ``app.backup``
core module is importable. All logic lives in ``backend/app/backup.py``.

Examples:
    python scripts/restore.py restore --from backend/backups/20260801-153000Z
    python scripts/restore.py restore --from <dir> --yes
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.backup import main  # noqa: E402

if __name__ == "__main__":
    # Default the sub-command to "restore" when the caller omits it.
    argv = sys.argv[1:]
    if not argv or argv[0].startswith("-"):
        argv = ["restore", *argv]
    raise SystemExit(main(argv))
