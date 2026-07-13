"""macOS CUPS printing backend using the system `lp`/`lpstat` tools.

This mirrors the exact commands proven to work on the Brother TD-2120N:
    lp -d <queue> -o media=Custom.<W>x<H>mm <image>
Status is derived from `lpstat -p <queue>` and reachability is confirmed by
whether the queue reports an error locating the device.
"""

from __future__ import annotations

import re
import subprocess

from .base import Printer, PrinterStatus, PrintResult


class CupsPrinter(Printer):
    def __init__(self, queue_name: str, media: str | None = None):
        self.queue_name = queue_name
        self.media = media  # e.g. "Custom.55x25mm"

    def status(self) -> PrinterStatus:
        try:
            out = subprocess.run(
                ["lpstat", "-p", self.queue_name],
                capture_output=True, text=True, timeout=8,
            )
        except (subprocess.SubprocessError, OSError) as exc:
            return PrinterStatus(self.queue_name, False, f"lpstat failed: {exc}")

        text = (out.stdout + out.stderr).strip()
        if out.returncode != 0 or not text:
            return PrinterStatus(self.queue_name, False,
                                 text or "printer not found")

        # A queued/idle printer is fine; an "Unable to locate" line means the
        # network device is asleep/offline even though the queue exists.
        unreachable = "unable to locate" in text.lower()
        disabled = "disabled" in text.lower()
        available = not unreachable and not disabled
        detail = text.splitlines()[0] if text else ""
        if unreachable:
            detail = "Printer unreachable (offline/asleep on network)."
        return PrinterStatus(self.queue_name, available, detail)

    def print_image(self, image_path: str) -> PrintResult:
        cmd = ["lp", "-d", self.queue_name]
        if self.media:
            cmd += ["-o", f"media={self.media}"]
        cmd.append(image_path)
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        except (subprocess.SubprocessError, OSError) as exc:
            return PrintResult(False, detail=f"lp failed: {exc}")

        if out.returncode != 0:
            return PrintResult(False, detail=(out.stderr or out.stdout).strip())

        # Example stdout: "request id is Brother_TD2120N_Test-219 (1 file(s))"
        match = re.search(r"request id is (\S+)", out.stdout)
        job_id = match.group(1) if match else ""
        return PrintResult(True, job_id=job_id, detail=out.stdout.strip())


def list_printers() -> list[str]:
    """Return available CUPS queue names."""
    try:
        out = subprocess.run(["lpstat", "-e"], capture_output=True,
                             text=True, timeout=8)
        return [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
    except (subprocess.SubprocessError, OSError):
        return []
