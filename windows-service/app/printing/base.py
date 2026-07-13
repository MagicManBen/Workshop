"""Printer backend abstraction."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PrinterInfo:
    name: str
    is_default: bool = False
    status: str = ""


@dataclass
class PrintResult:
    success: bool
    message: str
    printer: str = ""


class PrinterBackend:
    """Interface implemented by platform-specific backends."""

    def list_printers(self) -> list[PrinterInfo]:  # pragma: no cover - interface
        raise NotImplementedError

    def find_printer(self, preferred: str = "") -> PrinterInfo | None:
        """Return the configured printer, else the first Brother TD-2120N."""
        printers = self.list_printers()
        if preferred:
            for p in printers:
                if p.name.lower() == preferred.lower():
                    return p
            return None
        # Auto-detect a Brother TD-2120N by name.
        for needle in ("td-2120n", "td2120n", "td-2120", "brother td"):
            for p in printers:
                if needle in p.name.lower():
                    return p
        return None

    def print_image(self, image, printer_name: str) -> PrintResult:  # pragma: no cover
        raise NotImplementedError
