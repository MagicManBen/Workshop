# Workshop Supabase schema (Section 2)

All workshop objects live in a dedicated **`workshop`** schema and a private
**`workshop-images`** storage bucket, kept completely separate from the other
(unrelated) tables and buckets already in the BensLifeStuff project. No existing
object is modified.

## Migrations

Plain SQL, applied in order. They are idempotent where practical.

| File | Purpose |
|------|---------|
| `migrations/0001_workshop_schema.sql` | Schema, helper functions, all tables, indexes, constraints |
| `migrations/0002_workshop_rls.sql` | Grants, Row Level Security policies, PostgREST schema exposure |
| `migrations/0003_workshop_storage.sql` | Private `workshop-images` bucket + storage policies |
| `migrations/0004_workshop_seed.sql` | Seed categories, subcategories and quantity units |

### Apply

Set a connection string (never commit it) and run each file:

```bash
export PGURI="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require"
for f in supabase/migrations/00*.sql; do
  psql "$PGURI" -P pager=off -v ON_ERROR_STOP=1 -f "$f"
done
```

## Data model (overview)

- **box_types** — reusable box descriptions (dimensions, capacity, notes, active flag).
- **boxes** — physical boxes; unique auto-generated 10-digit `box_code`, status,
  optional location, `label_printed_at` (null until a label prints successfully).
- **categories / subcategories** — editable, stable IDs referenced by the ChatGPT
  JSON workflow. AI must never create or rename these.
- **units** — quantity units (Pieces, Metres, Litres…), manageable as data.
- **items** — inventory item *types*; flexible `specifications` / `attributes` JSONB.
- **images** — metadata for images stored in the bucket; owner is a box type XOR an
  item; at most one primary per owner; `role` and `source` recorded.
- **locations** — hierarchical (parent_id); `location_paths` view gives the full
  human-readable path.
- **item_placements** — where stock lives: in a box XOR at a location, with
  quantity + unit. Unique per (item, box) / (item, location) to avoid duplicates.
- **stock_movements** — history of add/remove/move/adjust.
- **print_jobs** — queue for the printing service (Section 3); statuses
  queued/processing/completed/failed/cancelled, with claim-locking.
- **service_heartbeats** — last-seen status per service, so the app can show online/offline.

## Access model

- `authenticated` — full read/write (single trusted user for now).
- `anon` — no access (system is not publicly writable).
- `service_role` — bypasses RLS; used server-side by the printing service.

Access from client apps uses `supabase-js` with `.schema('workshop')`.

> Note: there are currently **no auth users**. Create one (Supabase Auth) before
> using the web application in Section 4.
