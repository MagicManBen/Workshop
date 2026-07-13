"""SQLite history of generated / printed labels.

Stores one row per print (or preview-print) action so labels can be reprinted
later. No secrets are stored — only the non-sensitive 10-digit codes.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import data_dir
from .logging_setup import get_logger

log = get_logger("history")


def _db_path() -> Path:
    return data_dir() / "history.db"


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS labels (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                code        TEXT    NOT NULL,
                created_at  TEXT    NOT NULL,
                action      TEXT    NOT NULL,      -- print | preview | test | reprint
                preview_only INTEGER NOT NULL DEFAULT 0,
                success     INTEGER NOT NULL DEFAULT 1,
                message     TEXT,
                printer     TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_labels_code ON labels(code)")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_labels_created ON labels(created_at)"
        )
    log.info("History DB ready at %s", _db_path())


def record(
    code: str,
    action: str,
    *,
    preview_only: bool = False,
    success: bool = True,
    message: str = "",
    printer: str = "",
) -> int:
    """Insert a history row and return its id."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO labels
               (code, created_at, action, preview_only, success, message, printer)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (code, now, action, int(preview_only), int(success), message, printer),
        )
        return int(cur.lastrowid)


def list_recent(limit: int = 50) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM labels ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get(label_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM labels WHERE id = ?", (label_id,)
        ).fetchone()
    return dict(row) if row else None
