"""Rotating file + console logging.

Logs never contain secrets (there are none in Section 1). We do log the
10-digit box identifiers because they are non-sensitive workshop codes.
"""
from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import data_dir

_configured = False


def setup_logging() -> logging.Logger:
    """Configure the root 'wls' logger once and return it."""
    global _configured
    logger = logging.getLogger("wls")
    if _configured:
        return logger

    level_name = os.environ.get("WLS_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logger.setLevel(level)

    log_dir: Path = data_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Rotating file handler: 1 MB per file, keep 5 backups.
    file_handler = RotatingFileHandler(
        log_dir / "service.log",
        maxBytes=1_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)
    file_handler.setLevel(level)

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    console.setLevel(level)

    logger.addHandler(file_handler)
    logger.addHandler(console)
    logger.propagate = False

    _configured = True
    logger.info("Logging initialised. Log directory: %s", log_dir)
    return logger


def get_logger(name: str = "wls") -> logging.Logger:
    if not _configured:
        setup_logging()
    if name == "wls":
        return logging.getLogger("wls")
    return logging.getLogger("wls").getChild(name)
