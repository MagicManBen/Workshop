"""Runtime settings loaded from environment / .env.

Secrets (the Supabase service-role key) live only in the environment or a
local .env file that is never committed. Section 3 uses the service-role key
strictly server-side, inside this always-on service — it is never sent to a
browser.
"""

from __future__ import annotations

import os
from pathlib import Path

from .paths import BASE_DIR


def _load_dotenv() -> None:
    """Minimal .env loader (avoids an extra dependency)."""
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_SCHEMA = os.environ.get("SUPABASE_SCHEMA", "workshop")

SERVICE_NAME = os.environ.get("SERVICE_NAME", "mac-print-service")
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "3"))
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "15"))


def supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
