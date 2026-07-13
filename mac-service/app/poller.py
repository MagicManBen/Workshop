"""Background worker: consume the Supabase print-job queue and emit heartbeats.

Runs in a daemon thread inside the local service. It only starts when Supabase
is configured (SUPABASE_URL + service-role key present). Design points:

* Atomic claim via the `claim_next_print_job` RPC (FOR UPDATE SKIP LOCKED),
  so the same job is never printed twice even with restarts or two instances.
* On startup, any job left 'processing' by THIS worker (e.g. a crash mid-print)
  is marked failed rather than blindly reprinted — the user can reprint safely.
* A heartbeat is written periodically so the web app can show online/offline.
"""

from __future__ import annotations

import platform
import threading
import time
import uuid
from pathlib import Path

from . import config as config_mod
from . import settings
from . import supabase_client as sb
from .label import save_label_png
from .logging_setup import get_logger
from .paths import DATA_DIR, SPOOL_DIR
from .printing import CupsPrinter, MockPrinter

log = get_logger()

_WORKER_ID_FILE = DATA_DIR / "worker_id"


def _worker_id() -> str:
    """Stable id for this installation (hostname + persisted random suffix)."""
    if _WORKER_ID_FILE.exists():
        suffix = _WORKER_ID_FILE.read_text().strip()
    else:
        suffix = uuid.uuid4().hex[:8]
        _WORKER_ID_FILE.write_text(suffix)
    return f"{platform.node()}-{suffix}"


def _get_printer():
    cfg = config_mod.load_config()
    label_cfg = config_mod.label_config_from(cfg)
    name = cfg.get("printer_name", "")
    media = f"Custom.{label_cfg.width_mm:g}x{label_cfg.height_mm:g}mm"
    if not name or name == "MockPrinter":
        return MockPrinter(), label_cfg
    return CupsPrinter(name, media=media), label_cfg


class PrintQueueWorker:
    def __init__(self) -> None:
        self.worker_id = _worker_id()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_heartbeat = 0.0
        self.last_status = "starting"

    # -- lifecycle ----------------------------------------------------
    def start(self) -> None:
        if not settings.supabase_configured():
            log.info("Supabase not configured; print-queue worker disabled.")
            self.last_status = "disabled"
            return
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name="print-queue-worker")
        self._thread.start()
        log.info("Print-queue worker started as %s", self.worker_id)

    def stop(self) -> None:
        self._stop.set()
        try:
            sb.record_heartbeat(settings.SERVICE_NAME, "offline",
                                {"worker_id": self.worker_id})
        except sb.SupabaseError:
            pass

    # -- main loop ----------------------------------------------------
    def _run(self) -> None:
        self._recover_stale_jobs()
        while not self._stop.is_set():
            try:
                self._heartbeat_if_due()
                job = sb.claim_next_print_job(self.worker_id)
                if job:
                    self._process(job)
                    continue  # drain quickly when busy
            except sb.SupabaseError as exc:
                self.last_status = "supabase-error"
                log.warning("Worker Supabase error: %s", exc)
            self._stop.wait(settings.POLL_INTERVAL_SECONDS)

    def _recover_stale_jobs(self) -> None:
        """Fail any job this worker left mid-flight, to avoid double printing."""
        try:
            # Reuse the RPC contract: we can only complete our own processing
            # jobs. Query them first via PostgREST.
            import httpx
            url = (f"{settings.SUPABASE_URL}/rest/v1/print_jobs"
                   f"?status=eq.processing&claimed_by=eq.{self.worker_id}"
                   f"&select=id")
            headers = {
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "Accept-Profile": settings.SUPABASE_SCHEMA,
            }
            resp = httpx.get(url, headers=headers, timeout=15)
            if resp.status_code < 400:
                for row in resp.json():
                    sb.complete_print_job(row["id"], self.worker_id, False,
                                          "Interrupted by service restart")
                    log.warning("Recovered stale job %s (marked failed)", row["id"])
        except Exception as exc:  # best-effort recovery
            log.warning("Stale-job recovery skipped: %s", exc)

    def _heartbeat_if_due(self) -> None:
        now = time.time()
        if now - self._last_heartbeat < settings.HEARTBEAT_INTERVAL_SECONDS:
            return
        printer, _ = _get_printer()
        st = printer.status()
        sb.record_heartbeat(settings.SERVICE_NAME,
                            "online" if st.available else "degraded",
                            {"worker_id": self.worker_id,
                             "printer": st.name,
                             "printer_available": st.available})
        self._last_heartbeat = now
        self.last_status = "online" if st.available else "degraded"

    def _process(self, job: dict) -> None:
        job_id = job["id"]
        code = job["box_code"]
        log.info("Processing print job %s for %s", job_id, code)
        printer, label_cfg = _get_printer()

        st = printer.status()
        if not st.available:
            sb.complete_print_job(job_id, self.worker_id, False,
                                  f"Printer unavailable: {st.detail}")
            log.warning("Job %s failed: printer unavailable", job_id)
            return

        try:
            out = SPOOL_DIR / f"label_{code}.png"
            save_label_png(code, out, label_cfg)
            result = printer.print_image(str(out))
        except Exception as exc:  # rendering / printing failure
            sb.complete_print_job(job_id, self.worker_id, False, str(exc))
            log.error("Job %s failed: %s", job_id, exc)
            return

        sb.complete_print_job(job_id, self.worker_id, result.ok,
                              None if result.ok else result.detail)
        if result.ok:
            log.info("Job %s printed (cups %s)", job_id, result.job_id)
        else:
            log.error("Job %s print failed: %s", job_id, result.detail)
