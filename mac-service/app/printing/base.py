"""Printer abstraction.

A minimal interface so the service does not care which platform backend is in
use. macOS uses CUPS (`lp`/`lpstat`). A mock backend is available for
development without a printer. A Windows backend can be added later behind the
same interface without touching the service code.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PrinterStatus:
    name: str
    available: bool
    detail: str = ""


@dataclass
class PrintResult:
    ok: bool
    job_id: str = ""
    detail: str = ""


class Printer:
    """Interface every backend implements."""

    def status(self) -> PrinterStatus:  # pragma: no cover - interface
        raise NotImplementedError

    def print_image(self, image_path: str) -> PrintResult:  # pragma: no cover
        raise NotImplementedError
