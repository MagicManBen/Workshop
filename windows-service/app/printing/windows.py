"""Windows printing backend using the installed driver via GDI (pywin32).

We render our own bitmap at the printer DPI (see ``label.py``) and blit it to
the printer device context 1:1. This does not require the Brother b-PAC SDK or
P-touch Editor — only the installed Windows driver.
"""
from __future__ import annotations

from .base import PrinterBackend, PrinterInfo, PrintResult
from ..logging_setup import get_logger

log = get_logger("printing.windows")

try:
    import win32con
    import win32print
    import win32ui
    from PIL import ImageWin

    _HAVE_WIN32 = True
except Exception as exc:  # pragma: no cover - non-Windows / missing pywin32
    _HAVE_WIN32 = False
    _IMPORT_ERROR = exc


# Human-readable bits of the printer status bitmask.
_STATUS_FLAGS = {
    0x00000001: "paused",
    0x00000002: "error",
    0x00000004: "pending-deletion",
    0x00000008: "paper-jam",
    0x00000010: "paper-out",
    0x00000080: "offline",
    0x00000400: "busy",
    0x00200000: "door-open",
}


def _decode_status(status: int) -> str:
    if status == 0:
        return "ready"
    parts = [name for bit, name in _STATUS_FLAGS.items() if status & bit]
    return ", ".join(parts) if parts else f"code {status}"


class WindowsPrinterBackend(PrinterBackend):
    available = _HAVE_WIN32

    def list_printers(self) -> list[PrinterInfo]:
        if not _HAVE_WIN32:
            log.error("pywin32 not available: %s", _IMPORT_ERROR)
            return []
        try:
            default = win32print.GetDefaultPrinter()
        except Exception:
            default = ""
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        result: list[PrinterInfo] = []
        for p in win32print.EnumPrinters(flags, None, 2):
            name = p["pPrinterName"]
            result.append(
                PrinterInfo(
                    name=name,
                    is_default=(name == default),
                    status=_decode_status(p.get("Status", 0)),
                )
            )
        return result

    def print_image(self, image, printer_name: str, render_dpi: int = 203) -> PrintResult:
        if not _HAVE_WIN32:
            return PrintResult(False, f"pywin32 unavailable: {_IMPORT_ERROR}")
        if not printer_name:
            return PrintResult(False, "No printer selected/available.")

        hprinter = None
        dc = None
        try:
            # Confirm the queue exists / is openable.
            hprinter = win32print.OpenPrinter(printer_name)

            dc = win32ui.CreateDC()
            dc.CreatePrinterDC(printer_name)

            # Preserve physical size even if the device DPI differs from render.
            dev_dpi_x = dc.GetDeviceCaps(win32con.LOGPIXELSX) or render_dpi
            dev_dpi_y = dc.GetDeviceCaps(win32con.LOGPIXELSY) or render_dpi
            draw_w = round(image.width * dev_dpi_x / render_dpi)
            draw_h = round(image.height * dev_dpi_y / render_dpi)

            dc.StartDoc("Workshop Label")
            dc.StartPage()

            dib = ImageWin.Dib(image)
            dib.draw(dc.GetHandleOutput(), (0, 0, draw_w, draw_h))

            dc.EndPage()
            dc.EndDoc()
            log.info(
                "Printed to '%s' (%dx%d px -> %dx%d dots @ %dx%d dpi)",
                printer_name, image.width, image.height, draw_w, draw_h,
                dev_dpi_x, dev_dpi_y,
            )
            return PrintResult(True, "Label sent to printer.", printer_name)
        except Exception as exc:  # noqa: BLE001 - report any driver/GDI failure
            log.exception("Printing failed on '%s'", printer_name)
            return PrintResult(False, f"Print failed: {exc}", printer_name)
        finally:
            try:
                if dc is not None:
                    dc.DeleteDC()
            except Exception:
                pass
            try:
                if hprinter is not None:
                    win32print.ClosePrinter(hprinter)
            except Exception:
                pass


def get_backend() -> PrinterBackend:
    return WindowsPrinterBackend()
