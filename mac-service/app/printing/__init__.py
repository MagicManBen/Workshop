"""Printer backend selection."""

from __future__ import annotations

from .base import Printer, PrinterStatus, PrintResult
from .cups import CupsPrinter, list_printers
from .mock import MockPrinter

__all__ = [
    "Printer", "PrinterStatus", "PrintResult",
    "CupsPrinter", "MockPrinter", "list_printers",
]
