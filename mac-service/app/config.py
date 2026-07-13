"""Persistent configuration for the workshop label service.

Config is stored as JSON next to the app data directory so it can be edited
from the UI and survives restarts. Label dimensions and printer selection are
intentionally configurable so the loaded stock can change without code edits.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from .label import LabelConfig
from .paths import DATA_DIR

CONFIG_PATH = DATA_DIR / "config.json"

DEFAULTS = {
    "printer_name": "Brother_TD2120N_Test",
    "label": asdict(LabelConfig()),
}


def load_config() -> dict:
    """Load config from disk, merging over defaults."""
    cfg = json.loads(json.dumps(DEFAULTS))  # deep copy
    if CONFIG_PATH.exists():
        try:
            saved = json.loads(CONFIG_PATH.read_text())
        except json.JSONDecodeError:
            saved = {}
        cfg["printer_name"] = saved.get("printer_name", cfg["printer_name"])
        if isinstance(saved.get("label"), dict):
            cfg["label"].update(saved["label"])
    return cfg


def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def label_config_from(cfg: dict) -> LabelConfig:
    """Build a LabelConfig from the stored dict, ignoring unknown keys."""
    valid = {f for f in LabelConfig.__dataclass_fields__}
    data = {k: v for k, v in cfg.get("label", {}).items() if k in valid}
    return LabelConfig(**data)
