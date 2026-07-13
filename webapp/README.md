# Workshop Inventory — Web app / PWA (Section 4)

A responsive, installable single-page app for registering boxes, printing QR
labels, cataloguing items (with photos and a manual ChatGPT-JSON workflow),
assigning stock to boxes/locations, and searching the inventory.

It is a **static site** (no build step): plain ES modules + `supabase-js` from a
CDN. It works on Windows, macOS and iPhone browsers and can be installed as a
PWA. It is ready to host on GitHub Pages.

## Security model

- The browser uses the **anon key only** (safe to ship). All access is enforced
  by Supabase **Row Level Security**; a signed-in user gets the `authenticated`
  role. The **service-role key is never used here** — it lives only on the Mac
  print service.
- Images live in the **private** `workshop-images` bucket and are shown via
  short-lived signed URLs.
- Print jobs are created by the authenticated web app and claimed/printed by the
  Mac service. `anon` cannot read or write anything.

## Run locally

```bash
cd webapp
python3 -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080/index.html
```

Sign in with the Supabase Auth user you created.

## Configuration

`js/config.js` holds the project URL, anon key, schema (`workshop`) and image
bucket. These are all public/browser-safe values.

## Features

- **Setup** — manage box types (with images), categories, subcategories, units
  and hierarchical locations; view print-service status; export the active
  category/subcategory list (with IDs) for the ChatGPT project.
- **Add Box** — pick a type, create a physical box (auto 10-digit code), preview
  the QR, submit a print job, follow its status, reprint, and open the record.
  The box exists even if printing fails; the UI shows "label not printed yet".
- **Add Item** — capture multiple photos (primary/overhead/side/additional,
  downscaled before upload); optionally paste ChatGPT JSON which is validated
  (valid JSON, existing + active category/subcategory, subcategory belongs to
  category) and loaded into an editable review form; nothing saves without
  confirmation; manual entry is always available.
- **Assign** — enter a quantity + unit and place stock in a box (scan or type
  the 10-digit code) or at a location; assign again to split across boxes;
  duplicate item+box rows are merged; movements are recorded.
- **Browse & Search** — search by name/brand/model/part number/description/
  markings; quick views for all items, all boxes, labels not printed, recent,
  and locations; item and box detail with images, contents and reprint.

## Deploying to GitHub Pages (later)

The `webapp/` folder is self-contained. Point Pages at it (or copy its contents
to the site root / your domain). No server is required — only the Supabase
project and the always-on Mac print service.

## PWA

`manifest.webmanifest` + `sw.js` cache the app shell for quick loads and offline
launch; data always comes from Supabase over the network.
