#!/usr/bin/env bash
# Start the Workshop Label Service.
# Creates/uses a local virtualenv and launches the FastAPI app via uvicorn.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8765}"

# Prefer an existing virtualenv (repo root or local), otherwise create one.
if [ -x "../.venv/bin/uvicorn" ]; then
  VENV="../.venv"
elif [ -x ".venv/bin/uvicorn" ]; then
  VENV=".venv"
else
  echo "Creating virtualenv…"
  python3 -m venv .venv
  ./.venv/bin/pip install --quiet --upgrade pip
  ./.venv/bin/pip install --quiet -r requirements.txt
  VENV=".venv"
fi

echo "Workshop Label Service → http://$HOST:$PORT"
exec "$VENV/bin/uvicorn" app.main:app --host "$HOST" --port "$PORT"
