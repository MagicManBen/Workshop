"""SQLite-backed print history so labels can be reprinted later.

Records every label we generate/print with its identifier, timestamp, the
resulting image path and the outcome. This is the source for the reprint
feature and for basic troubleshooting.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .paths import DATA_DIR

DB_PATH = DATA_DIR / "history.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS print_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identifier TEXT NOT NULL,
                image_path TEXT,
                printer TEXT,
                status TEXT NOT NULL,
                detail TEXT,
                cups_job_id TEXT,
                created_at TEXT NOT NULL
            )
            """
        )


def record(identifier: str, image_path: str, printer: str,
           status: str, detail: str = "", cups_job_id: str = "") -> int:
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO print_jobs
               (identifier, image_path, printer, status, detail,
                cups_job_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (identifier, image_path, printer, status, detail,
             cups_job_id, datetime.now(timezone.utc).isoformat()),
        )
        return cur.lastrowid


def recent(limit: int = 50) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM print_jobs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get(job_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM print_jobs WHERE id = ?", (job_id,)
        ).fetchone()
        return dict(row) if row else None
