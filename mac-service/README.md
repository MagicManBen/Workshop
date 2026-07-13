# Workshop Label Service (Section 1)

A small, standalone macOS service that turns a **10-digit box code** into a
scannable **QR label** on the Brother **TD-2120N**. It runs locally, provides a
simple browser control panel, and has **no Supabase or web-app dependency yet**
(that arrives in later sections).

The label uses a **fold design**: two large QR codes, one on each half of the
55 × 25 mm label, with the right half rotated 180°. Folded across the centre,
a QR faces out on each side.

---

## What it does

- Detects the printer and shows whether it is **available**.
- Accepts a **10-digit** identifier (validated).
- Generates a QR label and **previews** it in the browser (no stock wasted).
- **Prints** a label, a **test label**, and **reprints** from history.
- Keeps a **SQLite history** and **rotating logs** for troubleshooting.
- Fully **configurable** label size / DPI / margins / printer via the UI.
- Can **auto-start at login** (launchd) and keeps running independently.

---

## Requirements

- macOS with the Brother TD-2120N added in **System Settings → Printers**
  (this project was verified against a queue named `Brother_TD2120N_Test`).
- Python 3.11+.

Find your printer's CUPS queue name with:

```bash
lpstat -e
```

Set it in the UI's **Configuration** section (or `data/config.json`).

---

## Run it

```bash
cd mac-service
./run.sh
```

The first run creates a virtualenv and installs dependencies. Then open:

```
http://127.0.0.1:8765
```

To bind a different host/port, copy `.env.example` to `.env` and set `HOST`/`PORT`
(or export them before running).

---

## Auto-start at login (optional)

```bash
cd mac-service
./install-autostart.sh
```

This installs a launchd user agent that starts the service at login and restarts
it if it stops. To remove it:

```bash
launchctl unload ~/Library/LaunchAgents/com.workshop.labelservice.plist
```

---

## Testing

1. **Status** — the dot turns green and the printer shows *available*.
   If it shows *unreachable*, the TD-2120N is asleep/offline on the network;
   wake it and press **Refresh status**.
2. **Preview** — enter a 10-digit code (e.g. `1234567890`) and click **Preview**.
   The label renders on screen; nothing prints.
3. **Print test label** — prints the fixed test code `0000000000`.
4. **Print** — enter a code and click **Print**. A label prints; scan each QR
   with a phone or the Tera scanner — both must decode to the exact code.
5. **Reprint** — click **Reprint** on any history row.
6. **Config** — change label size/printer and **Save**; preview again to confirm.

Generate a label from the command line (no printing):

```bash
./.venv/bin/python -m app.label 1234567890   # writes spool/label_1234567890.png
```

---

## Configuration

Editable in the UI or `data/config.json` (see `config.example.json`):

| Field                | Meaning                                   |
|----------------------|-------------------------------------------|
| `printer_name`       | CUPS queue name (or `MockPrinter`)        |
| `label.width_mm`     | Label width (loaded stock is 55 mm)       |
| `label.height_mm`    | Label height (loaded stock is 25 mm)      |
| `label.dpi`          | Print resolution (TD-2120N = 203)         |
| `label.margin_mm`    | White margin around each QR               |
| `label.layout`       | `fold` (two QRs) or `single`              |
| `label.ecc`          | QR error correction: `l`/`m`/`q`/`h`      |
| `label.fold_gap_mm`  | Gap either side of the fold line          |

Selecting `MockPrinter` lets you exercise the whole flow without hardware.

---

## Supabase print queue (Section 3)

When Supabase is configured, the service also runs a background worker that
consumes the `workshop.print_jobs` queue, so a job created from any device
(e.g. the future web app) is printed by this always-on Mac.

### Enable

Copy `.env.example` to `.env` and set the Supabase values:

```bash
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-side only, never in a browser
SUPABASE_SCHEMA=workshop
```

Restart the service. The **Supabase queue worker** indicator on the control
page shows online/offline; a heartbeat is written to
`workshop.service_heartbeats` every ~15s.

### How it works

* The worker claims jobs atomically via the `claim_next_print_job` RPC
  (`FOR UPDATE SKIP LOCKED`), so a job is never printed twice — even with two
  instances or a mid-print restart.
* On a successful print the job is marked `completed` and the box's
  `label_printed_at` is stamped.
* On startup, any job this worker left `processing` (e.g. a crash) is marked
  `failed` so it can be safely reprinted rather than silently double-printed.
* The RPCs are granted to `service_role` only; `anon`/`authenticated` cannot
  claim jobs, and the queue is not publicly writable.

### Test the full loop

With the service running and Supabase configured:

```bash
curl -X POST http://127.0.0.1:8765/api/supabase/enqueue \
  -H 'Content-Type: application/json' -d '{"identifier":"1234567890"}'
```

Within a few seconds the worker prints the label and the job's status becomes
`completed` in Supabase.

---

## Project layout

```
mac-service/
  app/
    label.py            QR + label rendering (configurable)
    config.py           JSON config load/save
    history.py          SQLite reprint history
    logging_setup.py    rotating logs
    paths.py            data directory paths
    main.py             FastAPI service + routes
    printing/
      base.py           Printer interface
      cups.py           macOS CUPS backend (lp/lpstat)
      mock.py           no-hardware backend
  templates/index.html  control UI
  data/                 config, logs, sqlite, generated labels (gitignored)
  run.sh                start script
  install-autostart.sh  launchd auto-start installer
  requirements.txt
  config.example.json
  .env.example
```

---

## Notes / known points

- The TD-2120N's mDNS name can fail to resolve when the printer sleeps; the
  status panel reports this clearly and jobs print once it reconnects. For
  maximum reliability, give the printer a DHCP reservation / fixed IP.
- Windows is not targeted in this build (printing happens from the Mac that also
  hosts the future web app). A Windows CUPS-equivalent backend can be added
  behind the same `Printer` interface later if needed.
