"""Mock printer backend for development without a physical printer.

Reports itself as available and "prints" by leaving the generated PNG in place,
so the full flow can be exercised offline.
"""

from __future__ import annotations

import itertools

from .base import Printer, PrinterStatus, PrintResult


class MockPrinter(Printer):
    def __init__(self, name: str = "MockPrinter"):
        self.name = name
        self._counter = itertools.count(1)

    def status(self) -> PrinterStatus:
        return PrinterStatus(self.name, True, "Mock printer (no hardware).")

    def print_image(self, image_path: str) -> PrintResult:
        job_id = f"mock-{next(self._counter)}"
        return PrintResult(True, job_id=job_id,
                           detail=f"Pretended to print {image_path}")
