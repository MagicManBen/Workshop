"""Label rendering for the workshop QR box labels.

Renders a QR code plus a human-readable box identifier onto a white canvas
sized for the loaded label stock. Everything is driven by LabelConfig so the
dimensions, DPI, error-correction level and layout can be adjusted without
touching the printing code.

The QR payload is the raw box identifier (e.g. a 10-digit code) so scanners
return exactly that value with no URL or prefix to strip.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont


# Thermal print head resolution for the Brother TD-2120N.
DEFAULT_DPI = 203
MM_PER_INCH = 25.4


@dataclass
class LabelConfig:
    """Physical + layout parameters for a label.

    Sizes are in millimetres so they map directly to the loaded label stock.
    """

    width_mm: float = 55.0
    height_mm: float = 25.0
    dpi: int = DEFAULT_DPI
    margin_mm: float = 0.5
    # QR error correction: L, M, Q or H. Q gives good damage tolerance while
    # keeping the module count low enough to stay crisp on a 203 dpi head.
    ecc: str = "q"
    # Minimum quiet zone expressed in QR modules (spec minimum is 4).
    quiet_zone_modules: int = 2
    # Point size for the human-readable identifier text.
    font_pt: int = 20
    # Where the QR sits relative to the text: "left" or "top".
    qr_position: str = "top"
    # Overall layout: "single" (one QR) or "fold" (a QR on each half so the
    # label can be folded across its centre with a QR facing out each side).
    layout: str = "fold"
    # Gap in mm reserved either side of the centre fold line.
    fold_gap_mm: float = 1.0

    def px(self, mm: float) -> int:
        return max(1, round(mm / MM_PER_INCH * self.dpi))

    @property
    def width_px(self) -> int:
        return self.px(self.width_mm)

    @property
    def height_px(self) -> int:
        return self.px(self.height_mm)

    @property
    def margin_px(self) -> int:
        return self.px(self.margin_mm)


def _load_font(size_px: int) -> ImageFont.FreeTypeFont:
    """Load a bold, highly legible font, falling back gracefully."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size_px)
            except OSError:
                continue
    return ImageFont.load_default()


def _render_qr(data: str, target_px: int, cfg: LabelConfig) -> Image.Image:
    """Render a crisp QR that exactly fills target_px square.

    We render at a whole-module scale, then upscale with NEAREST so the QR
    fills the panel completely while keeping hard black/white edges.
    """
    qr = segno.make(data, error=cfg.ecc)
    border = cfg.quiet_zone_modules
    modules = qr.symbol_size(scale=1, border=border)[0]
    # Scale so that after NEAREST upscaling each module stays an integer
    # multiple where possible; render generously then resize to exact target.
    base_scale = max(1, (target_px // modules) + 1)
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=base_scale, border=border,
            dark="black", light="white")
    buf.seek(0)
    img = Image.open(buf).convert("L")
    # Upscale to exactly fill the target square; NEAREST keeps edges crisp.
    return img.resize((target_px, target_px), Image.NEAREST)


def _render_panel(identifier: str, width_px: int, height_px: int,
                  cfg: LabelConfig) -> Image.Image:
    """Render a single panel with a QR filling as much space as possible."""
    panel = Image.new("L", (width_px, height_px), color=255)
    margin = cfg.margin_px

    qr_side = max(1, min(width_px - 2 * margin, height_px - 2 * margin))
    qr_img = _render_qr(identifier, qr_side, cfg)

    qr_x = (width_px - qr_img.width) // 2
    qr_y = (height_px - qr_img.height) // 2
    panel.paste(qr_img, (qr_x, qr_y))
    return panel


def render_label(identifier: str, cfg: LabelConfig | None = None) -> Image.Image:
    """Render a full label image for the given identifier."""
    cfg = cfg or LabelConfig()

    if cfg.layout == "fold":
        canvas = Image.new("L", (cfg.width_px, cfg.height_px), color=255)
        gap = cfg.px(cfg.fold_gap_mm)
        half_w = (cfg.width_px - gap) // 2
        left = _render_panel(identifier, half_w, cfg.height_px, cfg)
        right = _render_panel(identifier, half_w, cfg.height_px, cfg)
        # Rotate the right panel 180 so both read upright once tent-folded.
        right = right.rotate(180)
        canvas.paste(left, (0, 0))
        canvas.paste(right, (cfg.width_px - half_w, 0))
        return canvas

    canvas = Image.new("L", (cfg.width_px, cfg.height_px), color=255)
    draw = ImageDraw.Draw(canvas)

    font = _load_font(cfg.px(cfg.font_pt / 72 * MM_PER_INCH))

    inner_w = cfg.width_px - 2 * cfg.margin_px
    inner_h = cfg.height_px - 2 * cfg.margin_px

    if cfg.qr_position == "top":
        qr_side = min(inner_w, inner_h - cfg.px(6))
        qr_img = _render_qr(identifier, qr_side, cfg)
        qr_x = (cfg.width_px - qr_img.width) // 2
        qr_y = cfg.margin_px
        canvas.paste(qr_img, (qr_x, qr_y))
        _draw_centered_text(
            draw, font, identifier,
            box=(cfg.margin_px, qr_y + qr_img.height,
                 cfg.width_px - cfg.margin_px, cfg.height_px - cfg.margin_px),
        )
    else:  # left
        qr_side = min(inner_h, inner_w // 2)
        qr_img = _render_qr(identifier, qr_side, cfg)
        qr_x = cfg.margin_px
        qr_y = (cfg.height_px - qr_img.height) // 2
        canvas.paste(qr_img, (qr_x, qr_y))
        _draw_centered_text(
            draw, font, identifier,
            box=(qr_x + qr_img.width + cfg.margin_px, cfg.margin_px,
                 cfg.width_px - cfg.margin_px, cfg.height_px - cfg.margin_px),
        )

    return canvas


def _draw_centered_text(draw, font, text, box) -> None:
    x0, y0, x1, y1 = box
    # Shrink font if the text is too wide for the available area.
    working = font
    while True:
        bbox = draw.textbbox((0, 0), text, font=working)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw <= (x1 - x0) or working.size <= 8:
            break
        working = ImageFont.truetype(working.path, working.size - 2)
    bbox = draw.textbbox((0, 0), text, font=working)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = x0 + ((x1 - x0) - tw) // 2 - bbox[0]
    ty = y0 + ((y1 - y0) - th) // 2 - bbox[1]
    draw.text((tx, ty), text, fill=0, font=working)


def save_label_png(identifier: str, out_path: str | Path,
                   cfg: LabelConfig | None = None) -> Path:
    cfg = cfg or LabelConfig()
    img = render_label(identifier, cfg)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Store DPI so print pipelines size it correctly.
    img.save(out_path, dpi=(cfg.dpi, cfg.dpi))
    return out_path


if __name__ == "__main__":
    import sys

    code = sys.argv[1] if len(sys.argv) > 1 else "1234567890"
    path = save_label_png(code, f"data/spool/label_{code}.png")
    print(f"Wrote {path}")
