"""Shared filesystem paths for the label service.

Everything the service writes (config, logs, sqlite history, generated label
images) lives under a single data directory so it is easy to find, back up
and clean up. Located next to the package by default.
"""

from __future__ import annotations

from pathlib import Path

# app/ -> mac-service/
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SPOOL_DIR = DATA_DIR / "spool"
LOG_DIR = DATA_DIR / "logs"

for _d in (DATA_DIR, SPOOL_DIR, LOG_DIR):
    _d.mkdir(parents=True, exist_ok=True)
