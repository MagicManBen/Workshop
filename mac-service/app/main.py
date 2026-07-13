"""FastAPI control service for the workshop label printer.

Runs locally (bound to 127.0.0.1 by default) and provides a small browser UI
plus a JSON API to:
  - show printer status
  - preview a label (no printing / no wasted stock)
  - print a label for a supplied identifier
  - print a fixed test label
  - reprint a previous label from history
  - view and edit label/printer configuration

Section 1 has no Supabase dependency; this service is fully standalone.
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel

from . import config as config_mod
from . import history
from .label import save_label_png
from .logging_setup import get_logger
from .paths import BASE_DIR, SPOOL_DIR
from .printing import CupsPrinter, MockPrinter, list_printers

log = get_logger()
history.init_db()

app = FastAPI(title="Workshop Label Service", version="1.0")

TEMPLATES = BASE_DIR / "templates"

# 10-digit box identifier. Kept configurable-friendly but validated strictly.
ID_PATTERN = re.compile(r"^\d{10}$")
TEST_CODE = "0000000000"


def _label_media(label_cfg) -> str:
    return f"Custom.{label_cfg.width_mm:g}x{label_cfg.height_mm:g}mm"


def _get_printer():
    cfg = config_mod.load_config()
    label_cfg = config_mod.label_config_from(cfg)
    name = cfg.get("printer_name", "")
    if not name or name == "MockPrinter":
        return MockPrinter(), cfg, label_cfg
    return CupsPrinter(name, media=_label_media(label_cfg)), cfg, label_cfg


def _validate_id(identifier: str) -> str:
    identifier = (identifier or "").strip()
    if not ID_PATTERN.match(identifier):
        raise HTTPException(
            status_code=422,
            detail="Identifier must be exactly 10 digits.",
        )
    return identifier


class PrintRequest(BaseModel):
    identifier: str


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return (TEMPLATES / "index.html").read_text()


@app.get("/api/status")
def api_status() -> dict:
    printer, cfg, label_cfg = _get_printer()
    st = printer.status()
    return {
        "printer": st.name,
        "available": st.available,
        "detail": st.detail,
        "printers": list_printers(),
        "config": cfg,
        "media": _label_media(label_cfg),
    }


@app.get("/api/preview")
def api_preview(code: str) -> FileResponse:
    """Render a label to PNG without printing (safe, wastes no stock)."""
    identifier = _validate_id(code)
    _, _, label_cfg = _get_printer()
    out = SPOOL_DIR / f"preview_{identifier}.png"
    save_label_png(identifier, out, label_cfg)
    return FileResponse(out, media_type="image/png")


@app.post("/api/print")
def api_print(req: PrintRequest) -> JSONResponse:
    identifier = _validate_id(req.identifier)
    return _do_print(identifier)


@app.post("/api/test-print")
def api_test_print() -> JSONResponse:
    return _do_print(TEST_CODE)


@app.post("/api/reprint/{job_id}")
def api_reprint(job_id: int) -> JSONResponse:
    row = history.get(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="History entry not found.")
    return _do_print(row["identifier"])


@app.get("/api/history")
def api_history() -> dict:
    return {"jobs": history.recent(50)}


class ConfigUpdate(BaseModel):
    printer_name: str | None = None
    label: dict | None = None


@app.post("/api/config")
def api_config(update: ConfigUpdate) -> dict:
    cfg = config_mod.load_config()
    if update.printer_name is not None:
        cfg["printer_name"] = update.printer_name
    if update.label:
        cfg["label"].update(update.label)
    config_mod.save_config(cfg)
    log.info("Config updated: printer=%s", cfg.get("printer_name"))
    return cfg


def _do_print(identifier: str) -> JSONResponse:
    printer, cfg, label_cfg = _get_printer()
    out = SPOOL_DIR / f"label_{identifier}.png"
    save_label_png(identifier, out, label_cfg)

    st = printer.status()
    if not st.available:
        history.record(identifier, str(out), st.name, "failed",
                       detail=st.detail)
        log.warning("Print blocked for %s: %s", identifier, st.detail)
        return JSONResponse(
            status_code=503,
            content={"ok": False, "identifier": identifier,
                     "detail": st.detail},
        )

    result = printer.print_image(str(out))
    status = "completed" if result.ok else "failed"
    job_db_id = history.record(identifier, str(out), st.name, status,
                               detail=result.detail, cups_job_id=result.job_id)
    if result.ok:
        log.info("Printed %s (cups job %s)", identifier, result.job_id)
    else:
        log.error("Print failed for %s: %s", identifier, result.detail)
    return JSONResponse(
        status_code=200 if result.ok else 502,
        content={
            "ok": result.ok,
            "identifier": identifier,
            "job_id": result.job_id,
            "history_id": job_db_id,
            "detail": result.detail,
        },
    )
