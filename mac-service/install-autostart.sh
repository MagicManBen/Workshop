#!/usr/bin/env bash
# Install the Workshop Label Service as a macOS launchd user agent so it starts
# automatically at login and restarts if it stops.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SH="$HERE/run.sh"
LOG_DIR="$HERE/data/logs"
PLIST_SRC="$HERE/com.workshop.labelservice.plist"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_DST="$AGENTS_DIR/com.workshop.labelservice.plist"

mkdir -p "$AGENTS_DIR" "$LOG_DIR"
chmod +x "$RUN_SH"

sed -e "s#__RUN_SH__#$RUN_SH#g" \
    -e "s#__LOG_DIR__#$LOG_DIR#g" \
    "$PLIST_SRC" > "$PLIST_DST"

# Reload if already present.
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo "Installed and loaded: $PLIST_DST"
echo "Service will run at login. Control UI: http://127.0.0.1:8765"
echo "To stop:   launchctl unload \"$PLIST_DST\""
