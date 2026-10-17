-- Disqualification must be enforced in submit_decision, not only in Next.js login.
-- A DQ'd captain with a live Auth session (or direct GoTrue sign-in) must not submit.

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

  if team_row.disqualified then
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
