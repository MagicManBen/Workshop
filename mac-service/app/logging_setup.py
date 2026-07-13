"""Rotating file + console logging for the service."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from .paths import LOG_DIR

_CONFIGURED = False


def get_logger() -> logging.Logger:
    global _CONFIGURED
    logger = logging.getLogger("workshop.print")
    if not _CONFIGURED:
        logger.setLevel(logging.INFO)
        fmt = logging.Formatter(
            "%(asctime)s %(levelname)s %(message)s"
        )
        file_handler = RotatingFileHandler(
            LOG_DIR / "service.log", maxBytes=1_000_000, backupCount=5
        )
        file_handler.setFormatter(fmt)
        console = logging.StreamHandler()
        console.setFormatter(fmt)
        logger.addHandler(file_handler)
        logger.addHandler(console)
        _CONFIGURED = True
    return logger
