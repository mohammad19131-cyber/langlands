-- Private lock captures must not live on a table participants can SELECT.
-- PGlite does not reliably enforce column REVOKE; a separate table is the
-- backstop. rounds.lock_manifest keeps only the public seat summary.

create table if not exists public.round_lock_private (
  round_id uuid primary key references public.rounds (id) on delete cascade,
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

alter table public.round_lock_private enable row level security;

revoke all on table public.round_lock_private from public, anon, authenticated;
grant all on table public.round_lock_private to service_role;

comment on table public.round_lock_private is
  'Full lock capture including allocations. Service role / organiser RPCs only.';

revoke select (lock_manifest) on table public.rounds from public;
revoke select (lock_manifest) on table public.rounds from anon;
revoke select (lock_manifest) on table public.rounds from authenticated;

comment on column public.rounds.lock_manifest is
  'Public seat summary at lock (no allocations or starts). Private payload is round_lock_private.';

-- Move any pre-0009 full captures off the participant-readable column.
-- No-op on a clean seed (lock_manifest is null until lock_round).
insert into public.round_lock_private (round_id, payload)
select r.id, r.lock_manifest
from public.rounds r
where r.lock_manifest is not null
  and jsonb_typeof(r.lock_manifest) = 'array'
  and jsonb_array_length(r.lock_manifest) = 20
  and exists (
    select 1
    from jsonb_array_elements(r.lock_manifest) e
    where e ? 'teamId'
      and (e ? 'allocations' or e ? 'projectStarts')
  )
on conflict (round_id) do nothing;

update public.rounds r
set lock_manifest = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seat', (elem->>'seat')::int,
        'teamName', elem->>'teamName',
        'disqualified', coalesce((elem->>'disqualified')::boolean, false),
        'submissionId', elem->>'submissionId'
      )
      order by (elem->>'seat')::int
    ),
    r.lock_manifest
  )
  from jsonb_array_elements(r.lock_manifest) elem
)
where r.lock_manifest is not null
  and jsonb_typeof(r.lock_manifest) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.lock_manifest) e
    where e ? 'teamId'
      and (e ? 'allocations' or e ? 'projectStarts')
  );

create or replace function public.lock_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  full_manifest jsonb;
  public_manifest jsonb;
begin
  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from _actor then
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
    select payload into full_manifest from public.round_lock_private where round_id = _round_id;
    return jsonb_build_object(
      'ok', true,
      'status', round_row.status,
      'idempotent', true,
      'lock_manifest', coalesce(full_manifest, round_row.lock_manifest)
    );
  end if;
  if round_row.status is distinct from 'open' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.seat), '[]'::jsonb)
  into full_manifest
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

  if jsonb_array_length(full_manifest) is distinct from 20 then
    raise exception 'exactly 20 teams required' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.seat), '[]'::jsonb)
  into public_manifest
  from (
    select
      (row->>'seat')::int as seat,
      row->>'teamName' as "teamName",
      (row->>'disqualified')::boolean as disqualified,
      row->>'submissionId' as "submissionId"
    from jsonb_array_elements(full_manifest) as row
  ) x;

  insert into public.round_lock_private (round_id, payload)
  values (_round_id, full_manifest)
  on conflict (round_id) do update
    set payload = excluded.payload,
        captured_at = now();

  update public.rounds
     set status = 'locked',
         locked_at = now(),
         lock_manifest = public_manifest
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'locked',
    'idempotent', false,
    'lock_manifest', full_manifest
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
  private_payload jsonb;
begin
  perform pg_advisory_xact_lock(('x' || substr(replace(_round_id::text, '-', ''), 1, 16))::bit(64)::bigint);

  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from _actor then
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

  select payload into private_payload from public.round_lock_private where round_id = _round_id;
  if private_payload is null or jsonb_array_length(private_payload) is distinct from 20 then
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
    'lock_manifest', private_payload,
    'round_index', round_row.round_index,
    'event_code', round_row.event_code,
    'competition_id', round_row.competition_id
  );
end;
$$;
