-- =====================================================================
-- Workshop Inventory System — Section 2
-- Migration 0003: private storage bucket for images + access policies
--
-- Images for box types and inventory items are stored here rather than on
-- the capturing device, so they are available from any authorised device.
-- The bucket is PRIVATE; access is via signed URLs / authenticated requests.
-- =====================================================================

-- Create the bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('workshop-images', 'workshop-images', false)
on conflict (id) do nothing;

-- ---- Storage object policies, scoped to this bucket only ------------
-- These only affect objects whose bucket_id = 'workshop-images'; existing
-- buckets and their policies are untouched.

drop policy if exists workshop_images_select on storage.objects;
create policy workshop_images_select
  on storage.objects for select to authenticated
  using (bucket_id = 'workshop-images');

drop policy if exists workshop_images_insert on storage.objects;
create policy workshop_images_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'workshop-images');

drop policy if exists workshop_images_update on storage.objects;
create policy workshop_images_update
  on storage.objects for update to authenticated
  using (bucket_id = 'workshop-images')
  with check (bucket_id = 'workshop-images');

drop policy if exists workshop_images_delete on storage.objects;
create policy workshop_images_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'workshop-images');
