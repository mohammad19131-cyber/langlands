-- Phase 3 round machine. Additive. Does not edit 0001–0005.
-- Submit / lock / process / publish RPCs. Official scores are never client-writable.
-- Organiser write RPCs are granted to service_role only (Next.js server after session check).

alter table public.rounds
  add column if not exists lock_manifest jsonb,
  add column if not exists process_claimed_at timestamptz,
  add column if not exists process_claim_token uuid;

alter table public.round_process_runs
  add column if not exists outputs jsonb,
  add column if not exists input_checksum text,
  add column if not exists replay_checksum text,
  add column if not exists engine_version text;

create index if not exists submissions_round_accepted_idx
  on public.submissions (round_id)
  where status = 'accepted';

-- Allow the submit_decision RPC to persist late rows. Direct clients still cannot
-- set status (column GRANT omits it); they default to accepted.
create or replace function public.submissions_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  competition uuid;
  start_code text;
  n_distinct integer;
begin
  select r.competition_id into competition
  from public.rounds r
  where r.id = new.round_id;

  if competition is null then
    raise exception 'unknown round';
  end if;

  if jsonb_typeof(new.allocations) is distinct from 'object' then
    raise exception 'allocations must be an object';
  end if;

  if (
    select count(*) from jsonb_object_keys(new.allocations)
  ) <> 8
    or exists (
      select 1 from jsonb_object_keys(new.allocations) k
      where k not in (
        'restoration',
        'pollution_control',
        'water',
        'energy',
        'agriculture',
        'industry',
        'infrastructure',
        'public_services'
      )
    )
  then
    raise exception 'allocations must include exactly the eight sectors';
  end if;

  if exists (
    select 1
    from jsonb_each(new.allocations) kv
    where jsonb_typeof(kv.value) not in ('number')
      or (kv.value)::text::numeric < 0
  ) then
    raise exception 'allocation values must be non-negative numbers';
  end if;

  select count(distinct x) into n_distinct from unnest(new.project_starts) as x;
  if n_distinct <> cardinality(new.project_starts) then
    raise exception 'duplicate intervention starts are not allowed';
  end if;

  if cardinality(new.project_starts) > 2 then
    raise exception 'at most two intervention starts';
  end if;

  foreach start_code in array new.project_starts
  loop
    if not exists (
      select 1 from public.catalogue_projects p
      where p.competition_id = competition and p.code = start_code
    ) then
      raise exception 'unknown intervention code %', start_code;
    end if;
  end loop;

  if 'COAL' = any (new.project_starts) and 'RENEWABLES' = any (new.project_starts) then
    raise exception 'ENERGY_BASELOAD mutex: COAL and RENEWABLES cannot start together';
  end if;
  if 'REGEN_AG' = any (new.project_starts) and 'INTENSE_AG' = any (new.project_starts) then
    raise exception 'AGRI_PUSH mutex: REGEN_AG and INTENSE_AG cannot start together';
  end if;

  if auth.uid() is not null then
    new.checksum := null;
    new.accepted_spend := null;
    new.rejection_reason := null;
    new.server_received_at := now();
    if new.status not in ('accepted', 'late') then
      raise exception 'clients may only insert accepted or late proposals';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit (authenticated). auth.uid() is the actor. Service role cannot fake a member.
-- ---------------------------------------------------------------------------
create or replace function public.submit_decision(
  _round_id uuid,
  _team_id uuid,
  _allocations jsonb,
  _project_starts text[],
  _idempotency_key text,
  _schema_version text,
  _client_claimed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  round_row public.rounds%rowtype;
  team_row public.teams%rowtype;
  existing public.submissions%rowtype;
  new_row public.submissions%rowtype;
  window_open boolean;
begin
  if actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if _idempotency_key is null or char_length(trim(_idempotency_key)) < 8 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if _schema_version is distinct from 'py-ref-1.1.0' then
    raise exception 'invalid schema_version' using errcode = '22023';
  end if;

  select * into round_row from public.rounds where id = _round_id for share;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;

  select * into team_row from public.teams where id = _team_id;
  if not found or team_row.competition_id is distinct from round_row.competition_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if not public.is_team_member(_team_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into existing
  from public.submissions
  where round_id = _round_id
    and team_id = _team_id
    and idempotency_key = _idempotency_key;

  if found then
    if existing.allocations = _allocations
       and existing.project_starts = _project_starts then
      return jsonb_build_object(
        'ok', true,
        'status', 'duplicate',
        'id', existing.id,
        'submission_status', existing.status
      );
    end if;
    raise exception 'conflict' using errcode = '23505';
  end if;

  window_open :=
    round_row.status = 'open'
    and now() >= round_row.opens_at
    and now() < round_row.closes_at;

  if not window_open then
    insert into public.submissions (
      round_id, team_id, allocations, project_starts, idempotency_key,
      status, schema_version, client_claimed_at
    ) values (
      _round_id, _team_id, _allocations, coalesce(_project_starts, '{}'),
      _idempotency_key, 'late', _schema_version, _client_claimed_at
    )
    returning * into new_row;

    return jsonb_build_object(
      'ok', false,
      'error', 'closed',
      'id', new_row.id,
      'submission_status', 'late'
    );
  end if;

  update public.submissions
     set status = 'superseded'
   where round_id = _round_id
     and team_id = _team_id
     and status = 'accepted';

  insert into public.submissions (
    round_id, team_id, allocations, project_starts, idempotency_key,
    status, schema_version, client_claimed_at
  ) values (
    _round_id, _team_id, _allocations, coalesce(_project_starts, '{}'),
    _idempotency_key, 'accepted', _schema_version, _client_claimed_at
  )
  returning * into new_row;

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'id', new_row.id,
    'submission_status', 'accepted'
  );
end;
$$;

revoke all on function public.submit_decision(uuid, uuid, jsonb, text[], text, text, timestamptz)
  from public, anon;
grant execute on function public.submit_decision(uuid, uuid, jsonb, text[], text, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Organiser transitions (service_role only; Next.js checks the session first)
-- ---------------------------------------------------------------------------
create or replace function public.predecessor_published(_round public.rounds)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when _round.round_index = 1 then true
    else exists (
      select 1 from public.rounds p
      where p.competition_id = _round.competition_id
        and p.round_index = _round.round_index - 1
        and p.status = 'published'
    )
  end;
$$;

create or replace function public.open_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  comp public.competitions%rowtype;
begin
  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into round_row from public.rounds where id = _round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if not public.is_staff(round_row.competition_id, array['organiser'::public.app_role])
     and not exists (
       select 1 from public.competition_staff s
       where s.competition_id = round_row.competition_id
         and s.user_id = _actor
         and s.staff_role = 'organiser'
     ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- When called with service_role, auth.uid() is null; _actor is checked above.
  select * into comp from public.competitions where id = round_row.competition_id;
  if comp.status = 'paused' then
    raise exception 'paused' using errcode = 'P0001';
  end if;
  if not public.predecessor_published(round_row) then
    raise exception 'predecessor not published' using errcode = 'P0001';
  end if;
  if round_row.status = 'open' then
    return jsonb_build_object('ok', true, 'status', 'open', 'idempotent', true);
  end if;
  if round_row.status is distinct from 'scheduled' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;

  update public.rounds set status = 'open' where id = _round_id;
  return jsonb_build_object('ok', true, 'status', 'open', 'idempotent', false);
end;
$$;

create or replace function public.lock_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  manifest jsonb;
begin
  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into round_row from public.rounds where id = _round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = round_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if round_row.status in ('locked', 'processing', 'published') and round_row.lock_manifest is not null then
    return jsonb_build_object(
      'ok', true,
      'status', round_row.status,
      'idempotent', true,
      'lock_manifest', round_row.lock_manifest
    );
  end if;
  if round_row.status is distinct from 'open' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.seat), '[]'::jsonb)
  into manifest
  from (
    select
      t.id as "teamId",
      t.seat,
      t.name as "teamName",
      t.disqualified,
      s.id as "submissionId",
      s.allocations,
      s.project_starts as "projectStarts"
    from public.teams t
    left join public.submissions s
      on s.team_id = t.id
     and s.round_id = round_row.id
     and s.status = 'accepted'
    where t.competition_id = round_row.competition_id
  ) x;

  if jsonb_array_length(manifest) is distinct from 20 then
    raise exception 'exactly 20 teams required' using errcode = 'P0001';
  end if;

  update public.rounds
     set status = 'locked',
         locked_at = now(),
         lock_manifest = manifest
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'locked',
    'idempotent', false,
    'lock_manifest', manifest
  );
end;
$$;

create or replace function public.claim_process(_round_id uuid, _actor uuid, _token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  last_ok public.round_process_runs%rowtype;
begin
  perform pg_advisory_xact_lock(('x' || substr(replace(_round_id::text, '-', ''), 1, 16))::bit(64)::bigint);

  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into round_row from public.rounds where id = _round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = round_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into last_ok
  from public.round_process_runs
  where round_id = _round_id and ok = true
  order by attempt desc
  limit 1;

  if round_row.status = 'published' then
    return jsonb_build_object('ok', true, 'status', 'published', 'noop', true);
  end if;

  if round_row.status = 'processing' and last_ok.id is not null then
    return jsonb_build_object(
      'ok', true,
      'status', 'processing',
      'noop', true,
      'checksum', last_ok.checksum,
      'outputs', last_ok.outputs
    );
  end if;

  if round_row.status not in ('locked', 'processing') then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;
  if round_row.lock_manifest is null or jsonb_array_length(round_row.lock_manifest) is distinct from 20 then
    raise exception 'exactly 20 teams required' using errcode = 'P0001';
  end if;

  update public.rounds
     set status = 'processing',
         process_claimed_at = now(),
         process_claim_token = _token
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'processing',
    'noop', false,
    'lock_manifest', round_row.lock_manifest,
    'round_index', round_row.round_index,
    'event_code', round_row.event_code,
    'competition_id', round_row.competition_id
  );
end;
$$;

create or replace function public.save_process_run(
  _round_id uuid,
  _actor uuid,
  _token uuid,
  _ok boolean,
  _checksum text,
  _input_checksum text,
  _replay_checksum text,
  _engine_version text,
  _outputs jsonb,
  _error text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  attempt_no integer;
  run_id uuid;
begin
  perform pg_advisory_xact_lock(('x' || substr(replace(_round_id::text, '-', ''), 1, 16))::bit(64)::bigint);

  select * into round_row from public.rounds where id = _round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = round_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if round_row.process_claim_token is distinct from _token then
    raise exception 'stale process claim' using errcode = 'P0001';
  end if;

  select coalesce(max(attempt), 0) + 1 into attempt_no
  from public.round_process_runs
  where round_id = _round_id;

  insert into public.round_process_runs (
    round_id, attempt, finished_at, ok, checksum, input_checksum, replay_checksum,
    engine_version, outputs, error
  ) values (
    _round_id, attempt_no, now(), _ok, _checksum, _input_checksum, _replay_checksum,
    _engine_version, _outputs, _error
  )
  returning id into run_id;

  if _ok then
    update public.rounds
       set process_checksum = _checksum,
           processed_at = now()
     where id = _round_id;
  else
    delete from public.town_states where round_id = _round_id;
    delete from public.published_results where round_id = _round_id;
    update public.rounds
       set status = 'locked',
           process_claim_token = null,
           process_claimed_at = null
     where id = _round_id;
  end if;

  return jsonb_build_object('ok', _ok, 'attempt', attempt_no, 'id', run_id);
end;
$$;

create or replace function public.publish_round(
  _round_id uuid,
  _actor uuid,
  _token uuid,
  _checksum text,
  _town_states jsonb,
  _public_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  n_states integer;
  n_public integer;
  last_ok public.round_process_runs%rowtype;
begin
  perform pg_advisory_xact_lock(('x' || substr(replace(_round_id::text, '-', ''), 1, 16))::bit(64)::bigint);

  select * into round_row from public.rounds where id = _round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = round_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if round_row.status = 'published' then
    if round_row.process_checksum is not distinct from _checksum then
      return jsonb_build_object('ok', true, 'status', 'published', 'idempotent', true);
    end if;
    raise exception 'checksum mismatch' using errcode = 'P0001';
  end if;

  if round_row.status is distinct from 'processing' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;
  if round_row.process_claim_token is distinct from _token
     and round_row.process_claim_token is not null then
    -- Allow publish with the token from the successful process run.
    select * into last_ok
    from public.round_process_runs
    where round_id = _round_id and ok = true
    order by attempt desc
    limit 1;
    if last_ok.checksum is distinct from _checksum then
      raise exception 'checksum mismatch' using errcode = 'P0001';
    end if;
  end if;
  if round_row.process_checksum is distinct from _checksum then
    raise exception 'checksum mismatch' using errcode = 'P0001';
  end if;

  n_states := jsonb_array_length(_town_states);
  n_public := jsonb_array_length(_public_rows);
  if n_states is distinct from 20 or n_public is distinct from 20 then
    raise exception 'exactly 20 teams required' using errcode = 'P0001';
  end if;

  delete from public.town_states where round_id = _round_id;
  delete from public.published_results where round_id = _round_id;

  insert into public.town_states (
    team_id, round_id, round_index, state, score_breakdown,
    snapshot_score, final_score, engine_version
  )
  select
    (row->>'teamId')::uuid,
    _round_id,
    (row->>'roundIndex')::smallint,
    row->'state',
    row->'scoreBreakdown',
    (row->>'snapshotScore')::numeric,
    (row->>'finalScore')::numeric,
    row->>'engineVersion'
  from jsonb_array_elements(_town_states) as row;

  insert into public.published_results (
    team_id, round_id, round_index, team_seat, team_name,
    air, water_q, soil, bio, pollution, health, services, jobs, economy, fiscal,
    energy, infra, prep, buffer, reserve, population,
    energy_mix, agriculture, industry,
    score_breakdown, snapshot_score, final_score, engine_version
  )
  select
    (row->>'teamId')::uuid,
    _round_id,
    (row->>'roundIndex')::smallint,
    (row->>'teamSeat')::smallint,
    row->>'teamName',
    (row->>'air')::numeric,
    (row->>'water_q')::numeric,
    (row->>'soil')::numeric,
    (row->>'bio')::numeric,
    (row->>'pollution')::numeric,
    (row->>'health')::numeric,
    (row->>'services')::numeric,
    (row->>'jobs')::numeric,
    (row->>'economy')::numeric,
    (row->>'fiscal')::numeric,
    (row->>'energy')::numeric,
    (row->>'infra')::numeric,
    (row->>'prep')::numeric,
    (row->>'buffer')::numeric,
    (row->>'reserve')::numeric,
    (row->>'population')::numeric,
    row->>'energyMix',
    row->>'agriculture',
    row->>'industry',
    row->'scoreBreakdown',
    (row->>'snapshotScore')::numeric,
    (row->>'finalScore')::numeric,
    row->>'engineVersion'
  from jsonb_array_elements(_public_rows) as row;

  if (select count(*) from public.town_states where round_id = _round_id) <> 20 then
    raise exception 'partial town_states' using errcode = 'P0001';
  end if;
  if (select count(*) from public.published_results where round_id = _round_id) <> 20 then
    raise exception 'partial published_results' using errcode = 'P0001';
  end if;

  update public.rounds
     set status = 'published',
         published_at = now()
   where id = _round_id;

  update public.competitions
     set current_round_index = round_row.round_index
   where id = round_row.competition_id;

  return jsonb_build_object('ok', true, 'status', 'published', 'idempotent', false);
end;
$$;

create or replace function public.void_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
begin
  select * into round_row from public.rounds where id = _round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = round_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if round_row.status = 'published' then
    raise exception 'cannot void published' using errcode = 'P0001';
  end if;
  if round_row.status = 'void' then
    return jsonb_build_object('ok', true, 'status', 'void', 'idempotent', true);
  end if;

  delete from public.town_states where round_id = _round_id;
  delete from public.published_results where round_id = _round_id;
  update public.rounds
     set status = 'void',
         process_claim_token = null
   where id = _round_id;
  return jsonb_build_object('ok', true, 'status', 'void', 'idempotent', false);
end;
$$;

create or replace function public.audit_append(
  _actor uuid,
  _competition uuid,
  _team uuid,
  _action text,
  _payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id bigint;
begin
  insert into public.audit_logs (actor_id, competition_id, team_id, action, payload)
  values (_actor, _competition, _team, _action, coalesce(_payload, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.open_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lock_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_process(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_process_run(uuid, uuid, uuid, boolean, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_round(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.void_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.audit_append(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.open_round(uuid, uuid) to service_role;
grant execute on function public.lock_round(uuid, uuid) to service_role;
grant execute on function public.claim_process(uuid, uuid, uuid) to service_role;
grant execute on function public.save_process_run(uuid, uuid, uuid, boolean, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.publish_round(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.void_round(uuid, uuid) to service_role;
grant execute on function public.audit_append(uuid, uuid, uuid, text, jsonb) to service_role;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
