-- =====================================================================
-- Workshop Inventory System — Section 2
-- Migration 0001: schema, helper functions, core tables
--
-- Everything lives in a dedicated `workshop` schema to keep it fully
-- separate from the unrelated tables already in this project. No existing
-- object is modified by this migration.
-- =====================================================================

create schema if not exists workshop;

comment on schema workshop is
  'Workshop inventory system (boxes, items, locations, print jobs).';

-- Needed for gen_random_uuid(). pgcrypto ships with Supabase; create if absent.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Helper: keep updated_at fresh on any row update.
-- ---------------------------------------------------------------------
create or replace function workshop.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Helper: generate a unique 10-digit box code (kept as text so leading
-- zeros are preserved). Retries on the vanishingly rare collision.
-- ---------------------------------------------------------------------
create or replace function workshop.generate_box_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  tries int := 0;
begin
  loop
    -- 10 random digits, leading zeros allowed.
    candidate := lpad((floor(random() * 1e10))::bigint::text, 10, '0');
    exit when not exists (
      select 1 from workshop.boxes where box_code = candidate
    );
    tries := tries + 1;
    if tries > 50 then
      raise exception 'Could not generate a unique box code after % tries', tries;
    end if;
  end loop;
  return candidate;
end;
$$;

-- =====================================================================
-- Box types — reusable descriptions of a kind of box.
-- =====================================================================
create table workshop.box_types (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  manufacturer        text,
  capacity            text,               -- advertised, e.g. '0.3 L'
  internal_width_mm   numeric(8,2),
  internal_depth_mm   numeric(8,2),
  internal_height_mm  numeric(8,2),
  external_width_mm   numeric(8,2),
  external_depth_mm   numeric(8,2),
  external_height_mm  numeric(8,2),
  notes               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_box_types_updated
  before update on workshop.box_types
  for each row execute function workshop.set_updated_at();

-- =====================================================================
-- Workshop locations — general hierarchy (shelf > rack > row > column…).
-- =====================================================================
create table workshop.locations (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references workshop.locations(id) on delete restrict,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint locations_no_self_parent check (parent_id is null or parent_id <> id)
);

create index idx_locations_parent on workshop.locations(parent_id);

create trigger trg_locations_updated
  before update on workshop.locations
  for each row execute function workshop.set_updated_at();

-- Human-readable full path for each location, e.g. 'Workshop / Back wall / Rack 3'.
create or replace view workshop.location_paths as
  with recursive tree as (
    select id, parent_id, name, name::text as full_path, 1 as depth
    from workshop.locations
    where parent_id is null
    union all
    select l.id, l.parent_id, l.name,
           t.full_path || ' / ' || l.name, t.depth + 1
    from workshop.locations l
    join tree t on l.parent_id = t.id
  )
  select id, parent_id, name, full_path, depth from tree;

-- =====================================================================
-- Physical boxes — one actual container each.
-- =====================================================================
create table workshop.boxes (
  id                uuid primary key default gen_random_uuid(),
  box_type_id       uuid not null references workshop.box_types(id) on delete restrict,
  box_code          text not null unique default workshop.generate_box_code(),
  status            text not null default 'active'
                      check (status in ('active','retired','missing','damaged')),
  location_id       uuid references workshop.locations(id) on delete set null,
  label_printed_at  timestamptz,          -- null = label not yet printed OK
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint boxes_code_10_digits check (box_code ~ '^[0-9]{10}$')
);

create index idx_boxes_type on workshop.boxes(box_type_id);
create index idx_boxes_location on workshop.boxes(location_id);
create index idx_boxes_status on workshop.boxes(status);

create trigger trg_boxes_updated
  before update on workshop.boxes
  for each row execute function workshop.set_updated_at();

-- =====================================================================
-- Categories and subcategories — editable, stable IDs referenced by AI/JSON.
-- =====================================================================
create table workshop.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_categories_updated
  before update on workshop.categories
  for each row execute function workshop.set_updated_at();

create table workshop.subcategories (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references workshop.categories(id) on delete restrict,
  name         text not null,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, name)
);

create index idx_subcategories_category on workshop.subcategories(category_id);

create trigger trg_subcategories_updated
  before update on workshop.subcategories
  for each row execute function workshop.set_updated_at();

-- =====================================================================
-- Quantity units — manageable without code changes.
-- =====================================================================
create table workshop.units (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,       -- e.g. 'Pieces'
  abbreviation  text,                        -- e.g. 'pcs'
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_units_updated
  before update on workshop.units
  for each row execute function workshop.set_updated_at();

-- =====================================================================
-- Inventory items — the type of object/product (placement/qty stored apart).
-- =====================================================================
create table workshop.items (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category_id     uuid references workshop.categories(id) on delete set null,
  subcategory_id  uuid references workshop.subcategories(id) on delete set null,
  brand           text,
  model           text,                      -- make or model
  part_number     text,
  description     text,
  markings        text,                      -- visible markings
  specifications  jsonb not null default '{}'::jsonb,
  attributes      jsonb not null default '{}'::jsonb,  -- flexible extras
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_items_category on workshop.items(category_id);
create index idx_items_subcategory on workshop.items(subcategory_id);
-- Trigram-friendly search is added later; simple lower() index for name now.
create index idx_items_name_lower on workshop.items(lower(name));

create trigger trg_items_updated
  before update on workshop.items
  for each row execute function workshop.set_updated_at();

-- =====================================================================
-- Images — for box types and items. Stored in Supabase Storage; this table
-- holds metadata. Exactly one owner (box type XOR item).
-- =====================================================================
create table workshop.images (
  id           uuid primary key default gen_random_uuid(),
  box_type_id  uuid references workshop.box_types(id) on delete cascade,
  item_id      uuid references workshop.items(id) on delete cascade,
  is_primary   boolean not null default false,
  role         text not null default 'additional'
                 check (role in ('primary','overhead','side','additional')),
  file_path    text not null,               -- path within the storage bucket
  source       text,                         -- 'iphone_upload','manual_upload',
                                             -- 'overhead_camera','side_camera'
  uploaded_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint images_single_owner
    check (num_nonnulls(box_type_id, item_id) = 1)
);

create index idx_images_box_type on workshop.images(box_type_id);
create index idx_images_item on workshop.images(item_id);
-- At most one primary image per owner.
create unique index uq_images_primary_box_type
  on workshop.images(box_type_id) where is_primary and box_type_id is not null;
create unique index uq_images_primary_item
  on workshop.images(item_id) where is_primary and item_id is not null;

-- =====================================================================
-- Item placements — where stock lives. In a box XOR at a location.
-- Supports: many item types per box, one item across many boxes/locations,
-- different quantities each, and avoids duplicate rows for the same pairing.
-- =====================================================================
create table workshop.item_placements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references workshop.items(id) on delete cascade,
  box_id       uuid references workshop.boxes(id) on delete cascade,
  location_id  uuid references workshop.locations(id) on delete cascade,
  quantity     numeric(12,3) not null default 0 check (quantity >= 0),
  unit_id      uuid references workshop.units(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint placement_single_target
    check (num_nonnulls(box_id, location_id) = 1)
);

create index idx_placements_item on workshop.item_placements(item_id);
create index idx_placements_box on workshop.item_placements(box_id);
create index idx_placements_location on workshop.item_placements(location_id);
-- Prevent duplicate content rows for the same item in the same box/location.
create unique index uq_placement_item_box
  on workshop.item_placements(item_id, box_id) where box_id is not null;
create unique index uq_placement_item_location
  on workshop.item_placements(item_id, location_id) where location_id is not null;

create trigger trg_placements_updated
  before update on workshop.item_placements
  for each row execute function workshop.set_updated_at();

-- =====================================================================
-- Stock movements — useful history of quantity/placement changes.
-- =====================================================================
create table workshop.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references workshop.items(id) on delete cascade,
  movement_type     text not null
                      check (movement_type in ('add','remove','move','adjust')),
  quantity          numeric(12,3) not null,
  unit_id           uuid references workshop.units(id) on delete set null,
  from_box_id       uuid references workshop.boxes(id) on delete set null,
  from_location_id  uuid references workshop.locations(id) on delete set null,
  to_box_id         uuid references workshop.boxes(id) on delete set null,
  to_location_id    uuid references workshop.locations(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);

create index idx_movements_item on workshop.stock_movements(item_id);
create index idx_movements_created on workshop.stock_movements(created_at desc);

-- =====================================================================
-- Print jobs — queue consumed by the always-on printing service (Section 3).
-- =====================================================================
create table workshop.print_jobs (
  id            uuid primary key default gen_random_uuid(),
  box_id        uuid references workshop.boxes(id) on delete set null,
  box_code      text not null,
  payload       jsonb not null default '{}'::jsonb,  -- label render info
  status        text not null default 'queued'
                  check (status in ('queued','processing','completed',
                                    'failed','cancelled')),
  attempts      int not null default 0,
  claimed_by    text,                         -- service instance id (locking)
  claimed_at    timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  constraint print_jobs_code_10_digits check (box_code ~ '^[0-9]{10}$')
);

create index idx_print_jobs_status on workshop.print_jobs(status);
create index idx_print_jobs_created on workshop.print_jobs(created_at);
-- Only one job can be actively claimed/processing per box at a time.
create unique index uq_print_jobs_active_box
  on workshop.print_jobs(box_id)
  where status in ('queued','processing') and box_id is not null;

-- =====================================================================
-- Service heartbeats — so the app can show whether a service is online.
-- =====================================================================
create table workshop.service_heartbeats (
  service_name  text primary key,           -- e.g. 'mac-print-service'
  last_seen_at  timestamptz not null default now(),
  status        text not null default 'online',
  detail        jsonb not null default '{}'::jsonb
);
