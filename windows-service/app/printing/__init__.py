"""Printer backend selection."""
from __future__ import annotations

import sys

from .base import PrinterBackend, PrinterInfo, PrintResult

__all__ = ["PrinterBackend", "PrinterInfo", "PrintResult", "get_backend"]


def get_backend() -> PrinterBackend:
    """Return the platform-appropriate printer backend.

    On non-Windows dev machines a no-op backend is returned so the rest of the
    app (preview, history, UI) still runs; real printing requires Windows.
    """
    if sys.platform == "win32":
        from .windows import get_backend as _win
        return _win()

    class _NullBackend(PrinterBackend):
        available = False

        def list_printers(self) -> list[PrinterInfo]:
            return []

        def print_image(self, image, printer_name: str, render_dpi: int = 203) -> PrintResult:
            return PrintResult(False, "Printing is only supported on Windows.")

    return _NullBackend()
