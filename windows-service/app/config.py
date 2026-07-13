"""Configuration loading, persistence and path helpers.

The service reads/writes a TOML config file. Reading uses the stdlib
``tomllib`` (Python 3.11+); writing uses ``tomli_w``. All settings are also
editable from the browser UI and persisted back to disk.
"""
from __future__ import annotations

import os
import sys
import tomllib
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import tomli_w

APP_NAME = "WorkshopLabelService"


def is_frozen() -> bool:
    """True when running from a PyInstaller-built executable."""
    return getattr(sys, "frozen", False)


def app_base_dir() -> Path:
    """Directory containing the app/exe. Used for bundled resources."""
    if is_frozen():
        return Path(sys.executable).resolve().parent
    # app/config.py -> app/ -> windows-service/
    return Path(__file__).resolve().parent.parent


def resource_path(*parts: str) -> Path:
    """Resolve a bundled resource (templates/static) for dev and frozen runs."""
    if is_frozen():
        # PyInstaller unpacks data files to sys._MEIPASS
        base = Path(getattr(sys, "_MEIPASS", app_base_dir()))
    else:
        base = app_base_dir()
    return base.joinpath(*parts)


def data_dir() -> Path:
    """Writable directory for config.toml, history.db and logs/.

    Overridable via the ``WLS_DATA_DIR`` environment variable.
    """
    override = os.environ.get("WLS_DATA_DIR")
    if override:
        d = Path(override)
    else:
        d = app_base_dir() / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d


def config_path() -> Path:
    return data_dir() / "config.toml"


def example_config_path() -> Path:
    return resource_path("config.example.toml")


# --------------------------------------------------------------------------- #
# Dataclasses describing the config schema
# --------------------------------------------------------------------------- #
@dataclass
class LabelConfig:
    width_mm: float = 55.0
    height_mm: float = 25.0
    dpi: int = 203
    margin_mm: float = 2.0


@dataclass
class QRConfig:
    ecc: str = "Q"
    quiet_zone: int = 4
    position: str = "left"  # "left" | "right"


@dataclass
class TextConfig:
    font: str = ""
    font_size: int = 0  # 0 = auto
    group_digits: int = 0


@dataclass
class PrinterConfig:
    name: str = ""  # empty = auto-detect Brother TD-2120N


@dataclass
class AppConfig:
    preview_only: bool = False
    host: str = "127.0.0.1"
    port: int = 8765


@dataclass
class Config:
    label: LabelConfig = field(default_factory=LabelConfig)
    qr: QRConfig = field(default_factory=QRConfig)
    text: TextConfig = field(default_factory=TextConfig)
    printer: PrinterConfig = field(default_factory=PrinterConfig)
    app: AppConfig = field(default_factory=AppConfig)

    # -- derived helpers ---------------------------------------------------- #
    @property
    def width_px(self) -> int:
        return max(1, round(self.label.width_mm / 25.4 * self.label.dpi))

    @property
    def height_px(self) -> int:
        return max(1, round(self.label.height_mm / 25.4 * self.label.dpi))

    @property
    def margin_px(self) -> int:
        return max(0, round(self.label.margin_mm / 25.4 * self.label.dpi))

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Valid choices used for validation from the UI.
VALID_ECC = {"L", "M", "Q", "H"}
VALID_POSITION = {"left", "right"}


def _merge_section(section_cls, raw: dict[str, Any] | None):
    """Build a dataclass from raw dict, ignoring unknown keys."""
    obj = section_cls()
    if not raw:
        return obj
    valid = set(vars(obj).keys())
    for k, v in raw.items():
        if k in valid:
            setattr(obj, k, v)
    return obj


def _config_from_raw(raw: dict[str, Any]) -> Config:
    return Config(
        label=_merge_section(LabelConfig, raw.get("label")),
        qr=_merge_section(QRConfig, raw.get("qr")),
        text=_merge_section(TextConfig, raw.get("text")),
        printer=_merge_section(PrinterConfig, raw.get("printer")),
        app=_merge_section(AppConfig, raw.get("app")),
    )


def load_config() -> Config:
    """Load config.toml, seeding it from the example on first run."""
    path = config_path()
    if not path.exists():
        # Seed from bundled example if available, else write defaults.
        example = example_config_path()
        try:
            if example.exists():
                path.write_bytes(example.read_bytes())
            else:
                save_config(Config())
        except OSError:
            save_config(Config())

    try:
        with open(path, "rb") as fh:
            raw = tomllib.load(fh)
    except (OSError, tomllib.TOMLDecodeError):
        # Corrupt/unreadable config -> fall back to defaults (do not crash).
        return Config()
    return _config_from_raw(raw)


def save_config(cfg: Config) -> None:
    """Persist a Config to config.toml."""
    path = config_path()
    with open(path, "wb") as fh:
        tomli_w.dump(cfg.to_dict(), fh)


def update_config(patch: dict[str, Any]) -> Config:
    """Apply a partial update (nested dict) and persist. Returns new Config.

    Raises ValueError on invalid values.
    """
    cfg = load_config()
    data = cfg.to_dict()
    for section, values in patch.items():
        if section not in data or not isinstance(values, dict):
            continue
        for key, val in values.items():
            if key in data[section]:
                data[section][key] = val

    new_cfg = _config_from_raw(data)
    _validate(new_cfg)
    save_config(new_cfg)
    return new_cfg


def _validate(cfg: Config) -> None:
    if cfg.label.width_mm <= 0 or cfg.label.height_mm <= 0:
        raise ValueError("Label width/height must be greater than 0 mm.")
    if cfg.label.dpi <= 0:
        raise ValueError("DPI must be greater than 0.")
    if cfg.label.margin_mm < 0:
        raise ValueError("Margin cannot be negative.")
    ecc = cfg.qr.ecc.upper()
    if ecc not in VALID_ECC:
        raise ValueError(f"ECC must be one of {sorted(VALID_ECC)}.")
    cfg.qr.ecc = ecc
    if cfg.qr.quiet_zone < 4:
        raise ValueError("Quiet zone must be at least 4 modules.")
    if cfg.qr.position not in VALID_POSITION:
        raise ValueError("QR position must be 'left' or 'right'.")
    if cfg.text.font_size < 0:
        raise ValueError("Font size cannot be negative.")
    if cfg.text.group_digits < 0:
        raise ValueError("group_digits cannot be negative.")
    if not (0 < cfg.app.port < 65536):
        raise ValueError("Port must be between 1 and 65535.")
