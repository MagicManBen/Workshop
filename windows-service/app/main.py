"""FastAPI app + local control UI for the Workshop Label Service.

Bound to 127.0.0.1 only. Serves a browser control page and a JSON API for
previewing and printing 55x25 mm (configurable) QR labels on a Brother
TD-2120N via the installed Windows driver.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from . import __version__
from . import history, label
from .config import Config, load_config, resource_path, update_config
from .logging_setup import get_logger, setup_logging
from .printing import get_backend

setup_logging()
log = get_logger("main")

TEST_CODE = "1234567890"

app = FastAPI(title="Workshop Label Service", version=__version__)

templates = Jinja2Templates(directory=str(resource_path("templates")))

_static_dir = resource_path("static")
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

backend = get_backend()


@app.on_event("startup")
def _startup() -> None:
    history.init_db()
    cfg = load_config()
    log.info(
        "Service starting v%s | preview_only=%s | label=%.1fx%.1fmm @ %ddpi",
        __version__, cfg.app.preview_only,
        cfg.label.width_mm, cfg.label.height_mm, cfg.label.dpi,
    )


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class PrintRequest(BaseModel):
    code: str = Field(..., description="10-digit box identifier")
    preview_only: bool | None = None


class ReprintRequest(BaseModel):
    id: int


class ConfigPatch(BaseModel):
    # Free-form nested patch: {"label": {...}, "qr": {...}, ...}
    label: dict | None = None
    qr: dict | None = None
    text: dict | None = None
    printer: dict | None = None
    app: dict | None = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _resolve_printer(cfg: Config):
    """Return (PrinterInfo|None, available_bool)."""
    info = backend.find_printer(cfg.printer.name)
    return info, backend.available


def _do_print(cfg: Config, code: str, action: str, preview_only: bool):
    """Shared print pipeline. Returns a dict payload for the API."""
    code = label.validate_code(code)
    img = label.compose_label(cfg, code)

    if preview_only:
        rec_id = history.record(
            code, action, preview_only=True, success=True,
            message="Preview only (no paper used).", printer=cfg.printer.name,
        )
        return {
            "success": True,
            "preview_only": True,
            "message": "Preview only — nothing printed.",
            "id": rec_id,
            "code": code,
        }

    info = backend.find_printer(cfg.printer.name)
    if info is None:
        msg = "No Brother TD-2120N found. Check the driver install / cable."
        rec_id = history.record(
            code, action, success=False, message=msg, printer=cfg.printer.name
        )
        return {"success": False, "message": msg, "id": rec_id, "code": code}

    result = backend.print_image(img, info.name, render_dpi=cfg.label.dpi)
    rec_id = history.record(
        code, action, success=result.success,
        message=result.message, printer=result.printer or info.name,
    )
    return {
        "success": result.success,
        "message": result.message,
        "printer": result.printer or info.name,
        "id": rec_id,
        "code": code,
    }


# --------------------------------------------------------------------------- #
# UI
# --------------------------------------------------------------------------- #
@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    cfg = load_config()
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "version": __version__, "cfg": cfg.to_dict()},
    )


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.get("/api/status")
def api_status():
    cfg = load_config()
    info, available = _resolve_printer(cfg)
    return {
        "version": __version__,
        "backend_available": available,
        "preview_only": cfg.app.preview_only,
        "printer": {
            "configured_name": cfg.printer.name,
            "resolved": (info.name if info else None),
            "available": info is not None,
            "status": (info.status if info else "not found"),
            "is_default": (info.is_default if info else False),
        },
        "label": {
            "width_mm": cfg.label.width_mm,
            "height_mm": cfg.label.height_mm,
            "dpi": cfg.label.dpi,
            "width_px": cfg.width_px,
            "height_px": cfg.height_px,
        },
    }


@app.get("/api/printers")
def api_printers():
    return {
        "backend_available": backend.available,
        "printers": [p.__dict__ for p in backend.list_printers()],
    }


@app.get("/api/config")
def api_get_config():
    return load_config().to_dict()


@app.post("/api/config")
def api_set_config(patch: ConfigPatch):
    try:
        cfg = update_config(patch.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    log.info("Config updated via UI.")
    return cfg.to_dict()


@app.get("/api/preview")
def api_preview(code: str):
    cfg = load_config()
    try:
        png = label.render_png(cfg, code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return Response(content=png, media_type="image/png")


@app.post("/api/print")
def api_print(req: PrintRequest):
    cfg = load_config()
    try:
        code = label.validate_code(req.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    preview_only = cfg.app.preview_only if req.preview_only is None else req.preview_only
    payload = _do_print(cfg, code, "print", preview_only)
    status = 200 if payload["success"] else 502
    return JSONResponse(payload, status_code=status)


@app.post("/api/print-test")
def api_print_test():
    cfg = load_config()
    payload = _do_print(cfg, TEST_CODE, "test", cfg.app.preview_only)
    status = 200 if payload["success"] else 502
    return JSONResponse(payload, status_code=status)


@app.post("/api/reprint")
def api_reprint(req: ReprintRequest):
    cfg = load_config()
    row = history.get(req.id)
    if not row:
        raise HTTPException(status_code=404, detail="History entry not found.")
    payload = _do_print(cfg, row["code"], "reprint", cfg.app.preview_only)
    status = 200 if payload["success"] else 502
    return JSONResponse(payload, status_code=status)


@app.get("/api/history")
def api_history(limit: int = 50):
    return {"items": history.list_recent(limit=limit)}


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def run() -> None:
    import uvicorn

    cfg = load_config()
    host = os.environ.get("WLS_HOST", cfg.app.host)
    port = int(os.environ.get("WLS_PORT", cfg.app.port))
    log.info("Listening on http://%s:%d (localhost only)", host, port)
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    run()
