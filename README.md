# Workshop Inventory System — Section 1: Windows Workshop Printing Service

A standalone, always-on Windows service that prints **QR labels** for workshop
boxes on a **Brother TD-2120N** thermal label printer. It renders its own label
bitmap at 203 dpi (QR + human-readable code) with Pillow and prints through the
installed **Windows Brother driver** via `pywin32` GDI — no Brother b-PAC SDK or
P-touch Editor required.

It runs a small **FastAPI** app bound to **127.0.0.1 only** with a browser
control page: preview labels, print, reprint from history, and edit all label
settings live. Section 1 is fully standalone — **no Supabase, cloud, or web-app
dependencies.**

> This is **Section 1 only** of a larger inventory system. Everything lives
> under [`windows-service/`](windows-service/).

---

## What's included

```
windows-service/
├─ app/
│  ├─ main.py              FastAPI app + JSON API + entry point (run())
│  ├─ config.py            TOML config load/save/validate + path helpers
│  ├─ label.py             QR + text label rendering (Pillow + segno)
│  ├─ history.py           SQLite history of generated/printed labels
│  ├─ logging_setup.py     Rotating log files (1 MB × 5)
│  └─ printing/
│     ├─ base.py           Backend interface + printer auto-detection
│     └─ windows.py        Windows GDI printing via pywin32
├─ templates/index.html    Browser control page
├─ static/                 style.css + app.js
├─ run.py                  Local/dev entry point
├─ requirements.txt
├─ build.ps1               Build single-file .exe with PyInstaller
├─ install-service.ps1     Auto-start at logon via Task Scheduler
├─ config.example.toml     Example config (copied to data/config.toml on first run)
└─ .env.example
```

Runtime data (never committed) is written to `windows-service/data/`:
`config.toml`, `history.db`, and `logs/service.log`.

---

## Key features

- Detects the Brother TD-2120N via `EnumPrinters` and reports availability/status.
- Validates the box identifier is **exactly 10 digits**.
- QR payload = the **raw 10-digit code only** (no URL/prefix), **ECC level Q**,
  **quiet zone ≥ 4 modules**.
- Live **preview** in the browser (PNG) before printing.
- **Print test label**, **print entered code**, **reprint** from SQLite history.
- **Preview-only mode** to test QR generation without wasting labels.
- Fully **configurable** label width/height (mm), dpi, margins, ECC, font,
  digit grouping, QR position and printer name — editable from the UI and
  persisted to `config.toml`. **Nothing is hard-coded.**
- **Rotating logs**; no secrets are logged (there are none in Section 1).
- Bound to **localhost only**; single-file `.exe`; **auto-start at logon**.

---

## 1) Install the Brother TD-2120N driver

The Windows driver must be installed before printing works.

1. Download the **Printer Driver** for the **TD-2120N** from Brother Support:
   <https://support.brother.com/> → search **TD-2120N** → Downloads →
   your Windows version → **Printer Driver / Full Software Package**.
2. Connect the printer (USB is simplest for first setup; network also works).
3. Run the Brother installer and follow the prompts. When asked, pick USB or
   Network to match how you connected it.
4. Confirm it appears in **Settings → Bluetooth & devices → Printers &
   scanners** as **Brother TD-2120N**.
5. **Set the label size in the driver** to match the loaded stock
   (**55 × 25 mm** die-cut): open the printer's **Printing Preferences →
   Paper Size**, choose/create a **55mm × 25mm** size, and set orientation so
   the wide edge is the label width. This keeps the driver from scaling or
   clipping our 1:1 bitmap.
6. (Optional check) In PowerShell, list installed printers:
   ```powershell
   Get-Printer | Format-Table Name, DriverName, PortName
   ```
   You should see the TD-2120N listed. The app will also show it as available
   on the control page.

> If GDI sizing on the thermal printer proves unworkable in real testing, the
> documented fallback is Brother **b-PAC SDK** — but try the render-and-print
> approach here first (it is the intended method).

---

## 2) Run it

### Option A — Run from source (for testing)

From the `windows-service` folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

Then open <http://127.0.0.1:8765>.

### Option B — Build the single-file .exe

```powershell
cd windows-service
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Output: `windows-service/dist/WorkshopLabelService.exe`. Double-click it (or run
it from a terminal) and open <http://127.0.0.1:8765>. No Python install needed
on the target PC.

---

## 3) Auto-start when Windows starts

Default: **Task Scheduler at logon** (no extra software).

```powershell
cd windows-service
powershell -ExecutionPolicy Bypass -File .\install-service.ps1
Start-ScheduledTask -TaskName WorkshopLabelService   # start now without logging off
```

Remove it later with:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-service.ps1 -Uninstall
```

### Alternative — run as a true Windows Service with NSSM

If you prefer a real service (starts before logon), use
[NSSM](https://nssm.cc/):

```powershell
nssm install WorkshopLabelService "C:\path\to\dist\WorkshopLabelService.exe"
nssm set WorkshopLabelService AppDirectory "C:\path\to\dist"
nssm start WorkshopLabelService
```

Note: printing from a service running as `LocalSystem` may not see per-user
printer queues; run the NSSM service under your workshop user account if the
printer isn't found.

---

## 4) Testing — printing and scanning a real label

1. Start the service and open <http://127.0.0.1:8765>.
2. Check the **printer badge** top-right shows the TD-2120N as available
   (green). If red, revisit the driver install / cable.
3. Type a **10-digit** code (e.g. `1234567890`) and press **Enter** to
   **Preview**. Confirm the QR and the readable number look right.
4. Click **Print test label** (or **Print**) to print on the real TD-2120N.
5. **Scan the printed QR**:
   - With the **Tera Bluetooth scanner** (keyboard-wedge): put your cursor in
     any text field (e.g. Notepad or the code box) and scan — it should type
     the exact 10 digits.
   - With your **phone camera / QR app**: it should decode to the exact same
     10-digit code (no URL, no prefix).
6. Try **Reprint** on a row in the **History** table to reprint a previous code.
7. To test QR generation **without using paper**, tick **Preview-only mode**
   (or use the *Preview-only (no paper)* button) — history still records the
   action but nothing is sent to the printer.

---

## Configuration

All settings live in `data/config.toml` (seeded from
[config.example.toml](windows-service/config.example.toml) on first run) and are
editable from the **Configuration** panel in the UI:

| Setting | Meaning |
|---|---|
| `label.width_mm` / `height_mm` | Physical label size (default 55 × 25 mm) |
| `label.dpi` | Printer resolution (203 for TD-2120N) |
| `label.margin_mm` | White border around the label |
| `qr.ecc` | Error-correction level (Section 1 uses **Q**) |
| `qr.quiet_zone` | Quiet zone in modules (**min 4**) |
| `qr.position` | `left` or `right` |
| `text.font` | Path to a .ttf/.otf (blank = auto) |
| `text.font_size` | 0 = auto-size to fit |
| `text.group_digits` | Space every N digits for readability (0 = off) |
| `printer.name` | Blank = auto-detect TD-2120N |
| `app.preview_only` | Never send to the printer |
| `app.host` / `app.port` | UI bind address (localhost) |

Environment overrides (optional, see [.env.example](windows-service/.env.example)):
`WLS_DATA_DIR`, `WLS_HOST`, `WLS_PORT`, `WLS_LOG_LEVEL`.

---

## Secrets

None are required for Section 1. A root `.gitignore` and
`windows-service/.env.example` are provided. **Never commit real secrets or the
`data/` folder.**

---

## Troubleshooting

- **Printer not found:** confirm the driver is installed and the name contains
  "TD-2120N"; check the badge on the control page, or set an explicit name in
  the Configuration panel.
- **Label prints too big/small or clipped:** set the driver **Paper Size** to
  55 × 25 mm (step 5 above). The app renders at the configured dpi and prints
  1:1; the driver's paper size must match the stock.
- **Logs:** see `windows-service/data/logs/service.log` (rotating).
