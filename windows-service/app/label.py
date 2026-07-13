"""Compose a printable label bitmap: QR code + human-readable identifier.

Everything is rendered on a white canvas at the configured DPI so it can be
sent straight to the Brother driver via GDI at 1:1 device pixels.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont

from .config import Config
from .logging_setup import get_logger

log = get_logger("label")

CODE_RE = re.compile(r"^\d{10}$")

# Candidate system fonts to try when none is configured (Windows first).
_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\consolab.ttf",  # Consolas Bold (monospace, crisp)
    r"C:\Windows\Fonts\arialbd.ttf",   # Arial Bold
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "DejaVuSans-Bold.ttf",
    "DejaVuSans.ttf",
]


def validate_code(code: str) -> str:
    """Return the cleaned code if it is exactly 10 digits, else raise."""
    cleaned = (code or "").strip()
    if not CODE_RE.match(cleaned):
        raise ValueError("Code must be exactly 10 digits (0-9).")
    return cleaned


def _format_code(code: str, group: int) -> str:
    if group and group > 0:
        return " ".join(code[i : i + group] for i in range(0, len(code), group))
    return code


def _load_font(cfg: Config, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = max(6, int(size))
    # 1) explicit configured font
    if cfg.text.font:
        p = Path(cfg.text.font)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                log.warning("Configured font failed to load: %s", p)
    # 2) system candidates
    for cand in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(cand, size)
        except OSError:
            continue
    # 3) PIL bitmap fallback (fixed size, not ideal but always works)
    log.warning("No TrueType font found; using PIL default bitmap font.")
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return right - left, bottom - top


def _make_qr_image(cfg: Config, code: str, target_px: int) -> Image.Image:
    """Render the QR for ``code`` sized to fit ``target_px`` (square)."""
    quiet = max(4, int(cfg.qr.quiet_zone))
    # Force a *standard* QR (never a Micro QR): Micro QR codes are not readable
    # by most phones/scanners, including the Tera keyboard-wedge scanner.
    qr = segno.make_qr(code, error=cfg.qr.ecc.lower())

    # Pixels for the full symbol (incl. quiet zone) at scale=1 == module count.
    modules = qr.symbol_size(scale=1, border=quiet)[0]
    scale = max(1, target_px // modules)

    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=scale, border=quiet, dark="black", light="white")
    buf.seek(0)
    img = Image.open(buf).convert("1")  # 1-bit for crisp thermal output
    return img


def compose_label(cfg: Config, code: str) -> Image.Image:
    """Build the full label image for a validated 10-digit ``code``."""
    code = validate_code(code)

    w, h = cfg.width_px, cfg.height_px
    margin = cfg.margin_px
    canvas = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(canvas)

    content_w = max(1, w - 2 * margin)
    content_h = max(1, h - 2 * margin)

    # QR is a square sized to the content height.
    qr_side = content_h
    qr_img = _make_qr_image(cfg, code, qr_side)
    # Centre the (possibly slightly smaller) QR within its square slot.
    qr_slot_x = margin if cfg.qr.position == "left" else w - margin - qr_side
    qr_off_x = qr_slot_x + (qr_side - qr_img.width) // 2
    qr_off_y = margin + (qr_side - qr_img.height) // 2
    canvas.paste(qr_img.convert("RGB"), (qr_off_x, qr_off_y))

    # Text region occupies the remaining width beside the QR.
    gap = max(4, margin)
    if cfg.qr.position == "left":
        text_x0 = qr_slot_x + qr_side + gap
        text_x1 = w - margin
    else:
        text_x0 = margin
        text_x1 = qr_slot_x - gap
    text_area_w = max(1, text_x1 - text_x0)
    text_area_h = content_h

    display = _format_code(code, cfg.text.group_digits)

    # Auto-size font to fill the text area (or use configured size).
    if cfg.text.font_size and cfg.text.font_size > 0:
        font = _load_font(cfg, cfg.text.font_size)
    else:
        font = _autosize_font(cfg, draw, display, text_area_w, text_area_h)

    tw, th = _text_size(draw, display, font)
    tx = text_x0 + max(0, (text_area_w - tw) // 2)
    ty = margin + max(0, (text_area_h - th) // 2)
    draw.text((tx, ty), display, fill="black", font=font)

    return canvas


def _autosize_font(cfg: Config, draw, text: str, max_w: int, max_h: int):
    """Binary-ish search for the largest font that fits the text box."""
    best = _load_font(cfg, 8)
    size = 8
    # Grow while it fits.
    while size < 400:
        candidate = _load_font(cfg, size)
        tw, th = _text_size(draw, text, candidate)
        if tw <= max_w and th <= max_h:
            best = candidate
            size += 2
        else:
            break
    return best


def render_png(cfg: Config, code: str) -> bytes:
    """Compose the label and return PNG bytes (for preview / storage)."""
    img = compose_label(cfg, code)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()
