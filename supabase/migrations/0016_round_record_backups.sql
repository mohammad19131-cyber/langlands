-- Append-only backups of round records and team scores after each successful publish.
-- Survives organiser play reset (reset deletes live play rows, not these backups).
-- Never stores password_hash, login credentials, or private lock payloads.

create table if not exists public.round_record_backups (
  id bigserial primary key,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  round_id uuid not null,
  round_index smallint not null check (round_index between 1 and 6),
  created_at timestamptz not null default now(),
  process_checksum text,
  engine_version text,
  scores jsonb not null,
  town_states jsonb not null,
  submissions jsonb not null,
  round_meta jsonb not null,
  constraint round_record_backups_scores_is_array check (jsonb_typeof(scores) = 'array'),
  constraint round_record_backups_towns_is_array check (jsonb_typeof(town_states) = 'array'),
  constraint round_record_backups_subs_is_array check (jsonb_typeof(submissions) = 'array'),
  constraint round_record_backups_meta_is_object check (jsonb_typeof(round_meta) = 'object')
);

create index if not exists round_record_backups_competition_round_idx
  on public.round_record_backups (competition_id, round_index, created_at desc);

create index if not exists round_record_backups_round_id_idx
  on public.round_record_backups (round_id, created_at desc);

comment on table public.round_record_backups is
  'Immutable post-publish snapshot of scores and round records. Not rewritten by reset.';

alter table public.round_record_backups enable row level security;
alter table public.round_record_backups force row level security;

revoke all on table public.round_record_backups from public, anon, authenticated;
grant select, insert on table public.round_record_backups to service_role;
grant usage, select on sequence public.round_record_backups_id_seq to service_role;

create or replace function public.backup_round_records(_round_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  new_id bigint;
  score_rows jsonb;
  town_rows jsonb;
  sub_rows jsonb;
  engine text;
begin
  select * into round_row from public.rounds where id = _round_id;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if round_row.status is distinct from 'published' then
    raise exception 'backup requires published round' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(pr) order by pr.team_seat), '[]'::jsonb)
    into score_rows
    from public.published_results pr
   where pr.round_id = _round_id;

  if jsonb_array_length(score_rows) is distinct from 20 then
    raise exception 'backup requires 20 published scores' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teamId', ts.team_id,
        'roundId', ts.round_id,
        'roundIndex', ts.round_index,
        'state', ts.state,
        'scoreBreakdown', ts.score_breakdown,
        'snapshotScore', ts.snapshot_score,
        'finalScore', ts.final_score,
        'engineVersion', ts.engine_version
      )
      order by ts.team_id
    ),
    '[]'::jsonb
  )
    into town_rows
    from public.town_states ts
   where ts.round_id = _round_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'teamId', s.team_id,
        'status', s.status,
        'allocations', s.allocations,
        'projectStarts', to_jsonb(s.project_starts),
        'idempotencyKey', s.idempotency_key,
        'schemaVersion', s.schema_version,
        'acceptedSpend', s.accepted_spend,
        'serverReceivedAt', s.server_received_at
      )
      order by s.team_id, s.server_received_at
    ),
    '[]'::jsonb
  )
    into sub_rows
    from public.submissions s
   where s.round_id = _round_id
     and s.status in ('accepted', 'late');

  select max(ts.engine_version) into engine
    from public.town_states ts
   where ts.round_id = _round_id;

  insert into public.round_record_backups (
    competition_id,
    round_id,
    round_index,
    process_checksum,
    engine_version,
    scores,
    town_states,
    submissions,
    round_meta
  ) values (
    round_row.competition_id,
    round_row.id,
    round_row.round_index,
    round_row.process_checksum,
    engine,
    score_rows,
    town_rows,
    sub_rows,
    jsonb_build_object(
      'id', round_row.id,
      'competitionId', round_row.competition_id,
      'roundIndex', round_row.round_index,
      'status', round_row.status,
      'eventCode', round_row.event_code,
      'opensAt', round_row.opens_at,
      'closesAt', round_row.closes_at,
      'lockedAt', round_row.locked_at,
      'processedAt', round_row.processed_at,
      'publishedAt', round_row.published_at,
      'processChecksum', round_row.process_checksum
    )
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.backup_round_records(uuid) from public, anon, authenticated;
grant execute on function public.backup_round_records(uuid) to service_role;

-- Re-assert publish_round with post-publish backup. Same contract as 0006; adds archival row.
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
  backup_id bigint;
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

  backup_id := public.backup_round_records(_round_id);

  return jsonb_build_object(
    'ok', true,
    'status', 'published',
    'idempotent', false,
    'backupId', backup_id
  );
end;
$$;

revoke all on function public.publish_round(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_round(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;

comment on function public.backup_round_records(uuid) is
  'Organiser/system: append score and round-record backup after publish.';
comment on function public.publish_round(uuid, uuid, uuid, text, jsonb, jsonb) is
  'Organiser: write 20 towns + published_results, then append round_record_backups.';
