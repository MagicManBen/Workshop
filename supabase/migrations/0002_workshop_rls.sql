-- =====================================================================
-- Workshop Inventory System — Section 2
-- Migration 0002: grants, Row Level Security, PostgREST schema exposure
--
-- Access model (kept simple, single trusted user for now):
--   * authenticated  -> full read/write on all workshop tables
--   * anon           -> no access (system is not publicly writable)
--   * service_role    -> bypasses RLS automatically (used by the print
--                        service on the server side in Section 3)
-- =====================================================================

-- ---- Schema usage + table privileges -------------------------------
grant usage on schema workshop to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema workshop to authenticated;
grant select, insert, update, delete
  on all tables in schema workshop to service_role;

-- Views (location_paths) are read-only.
grant select on workshop.location_paths to authenticated, service_role;

-- Future tables created in this schema inherit the same grants.
alter default privileges in schema workshop
  grant select, insert, update, delete on tables to authenticated, service_role;

-- Allow the roles to execute helper functions.
grant execute on function workshop.generate_box_code() to authenticated, service_role;

-- ---- Enable RLS on every base table --------------------------------
alter table workshop.box_types          enable row level security;
alter table workshop.boxes              enable row level security;
alter table workshop.locations          enable row level security;
alter table workshop.categories         enable row level security;
alter table workshop.subcategories      enable row level security;
alter table workshop.units              enable row level security;
alter table workshop.items              enable row level security;
alter table workshop.images             enable row level security;
alter table workshop.item_placements    enable row level security;
alter table workshop.stock_movements    enable row level security;
alter table workshop.print_jobs         enable row level security;
alter table workshop.service_heartbeats enable row level security;

-- ---- Policies: authenticated may do everything ---------------------
do $$
declare
  t text;
  tables text[] := array[
    'box_types','boxes','locations','categories','subcategories','units',
    'items','images','item_placements','stock_movements','print_jobs',
    'service_heartbeats'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on workshop.%I for all to authenticated '
      || 'using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end;
$$;

-- ---- Expose the workshop schema to PostgREST (additive) -------------
-- The default exposed schemas are public + graphql_public; we append
-- workshop so supabase-js can reach it via .schema('workshop').
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, workshop';

-- Ask PostgREST to reload its configuration/schema cache.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
