-- =====================================================================
-- Workshop Inventory System — Section 3
-- Migration 0005: print-queue RPCs (atomic claim, complete) + heartbeat
--
-- These functions are the safe interface the always-on printing service uses
-- to consume the queue. Atomic claiming with FOR UPDATE SKIP LOCKED prevents
-- two service instances (or a restart mid-job) from printing the same job
-- twice. They run as SECURITY DEFINER but are granted to service_role only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Claim the oldest queued job for a given worker, atomically.
-- Returns the claimed row, or nothing if the queue is empty.
-- ---------------------------------------------------------------------
create or replace function workshop.claim_next_print_job(p_worker_id text)
returns setof workshop.print_jobs
language plpgsql
security definer
set search_path = workshop, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Pick the oldest queued job, skipping rows another worker has locked.
  select id into v_id
  from workshop.print_jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return;  -- nothing to do
  end if;

  return query
  update workshop.print_jobs
  set status     = 'processing',
      claimed_by = p_worker_id,
      claimed_at = now(),
      started_at = coalesce(started_at, now()),
      attempts   = attempts + 1
  where id = v_id
  returning *;
end;
$$;

-- ---------------------------------------------------------------------
-- Mark a claimed job completed or failed. Only the worker that claimed it
-- (and only while it is still 'processing') may finalise it.
-- ---------------------------------------------------------------------
create or replace function workshop.complete_print_job(
  p_job_id    uuid,
  p_worker_id text,
  p_success   boolean,
  p_error     text default null
)
returns workshop.print_jobs
language plpgsql
security definer
set search_path = workshop, pg_temp
as $$
declare
  v_row workshop.print_jobs;
begin
  update workshop.print_jobs
  set status       = case when p_success then 'completed' else 'failed' end,
      error        = case when p_success then null else p_error end,
      completed_at = now()
  where id = p_job_id
    and claimed_by = p_worker_id
    and status = 'processing'
  returning * into v_row;

  if not found then
    raise exception
      'Job % not claimed by % or not in processing state', p_job_id, p_worker_id;
  end if;

  -- When a box label prints successfully, stamp the box so the app can show
  -- which boxes still need a working label.
  if p_success and v_row.box_id is not null then
    update workshop.boxes
    set label_printed_at = now()
    where id = v_row.box_id;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Record a service heartbeat (online/offline + optional detail).
-- ---------------------------------------------------------------------
create or replace function workshop.record_heartbeat(
  p_service_name text,
  p_status       text default 'online',
  p_detail       jsonb default '{}'::jsonb
)
returns workshop.service_heartbeats
language plpgsql
security definer
set search_path = workshop, pg_temp
as $$
declare
  v_row workshop.service_heartbeats;
begin
  insert into workshop.service_heartbeats (service_name, last_seen_at, status, detail)
  values (p_service_name, now(), p_status, p_detail)
  on conflict (service_name) do update
    set last_seen_at = now(),
        status       = excluded.status,
        detail       = excluded.detail
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges: the printing service (service_role) is the only caller.
-- ---------------------------------------------------------------------
revoke all on function workshop.claim_next_print_job(text) from public;
revoke all on function workshop.complete_print_job(uuid, text, boolean, text) from public;
revoke all on function workshop.record_heartbeat(text, text, jsonb) from public;

grant execute on function workshop.claim_next_print_job(text) to service_role;
grant execute on function workshop.complete_print_job(uuid, text, boolean, text) to service_role;
grant execute on function workshop.record_heartbeat(text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
