-- Decision window is an 18-minute server clock (AGENTS.md freeze, game-rules.md).
-- open_round stamps opens_at / closes_at. Organisers may extend while open.
-- Unpublished locks may return to open before town_states exist (runbook).
-- Void recovery is unchanged: predecessor must still be published.

create or replace function public.open_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  comp public.competitions%rowtype;
  stamped_open timestamptz;
  stamped_close timestamptz;
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
  if not public.is_staff(round_row.competition_id, array['organiser'::public.app_role])
     and not exists (
       select 1 from public.competition_staff s
       where s.competition_id = round_row.competition_id
         and s.user_id = _actor
         and s.staff_role = 'organiser'
     ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into comp from public.competitions where id = round_row.competition_id;
  if comp.status = 'paused' then
    raise exception 'paused' using errcode = 'P0001';
  end if;
  if not public.predecessor_published(round_row) then
    raise exception 'predecessor not published' using errcode = 'P0001';
  end if;
  if round_row.status = 'open' then
    return jsonb_build_object(
      'ok', true,
      'status', 'open',
      'idempotent', true,
      'opens_at', round_row.opens_at,
      'closes_at', round_row.closes_at
    );
  end if;
  if round_row.status is distinct from 'scheduled' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;

  stamped_open := now();
  stamped_close := stamped_open + interval '18 minutes';

  update public.rounds
     set status = 'open',
         opens_at = stamped_open,
         closes_at = stamped_close
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'open',
    'idempotent', false,
    'opens_at', stamped_open,
    'closes_at', stamped_close
  );
end;
$$;

create or replace function public.set_round_window(_round_id uuid, _closes_at timestamptz, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
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
  if round_row.status is distinct from 'open' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;
  if _closes_at is null or _closes_at <= now() or _closes_at <= round_row.opens_at then
    raise exception 'closes_at must be after now and opens_at' using errcode = '22023';
  end if;

  update public.rounds
     set closes_at = _closes_at
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'open',
    'opens_at', round_row.opens_at,
    'closes_at', _closes_at
  );
end;
$$;

create or replace function public.reopen_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  town_count integer;
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
  if round_row.status = 'published' then
    raise exception 'cannot reopen published' using errcode = 'P0001';
  end if;
  if round_row.status = 'open' then
    return jsonb_build_object('ok', true, 'status', 'open', 'idempotent', true);
  end if;
  if round_row.status is distinct from 'locked' then
    raise exception 'invalid transition' using errcode = 'P0001';
  end if;

  select count(*)::int into town_count from public.town_states where round_id = _round_id;
  if town_count > 0 then
    raise exception 'cannot reopen after process' using errcode = 'P0001';
  end if;

  delete from public.round_lock_private where round_id = _round_id;

  update public.rounds
     set status = 'open',
         locked_at = null,
         lock_manifest = null,
         process_claim_token = null
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'open',
    'idempotent', false,
    'opens_at', round_row.opens_at,
    'closes_at', round_row.closes_at
  );
end;
$$;

revoke all on function public.open_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_round_window(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.reopen_round(uuid, uuid) from public, anon, authenticated;

grant execute on function public.open_round(uuid, uuid) to service_role;
grant execute on function public.set_round_window(uuid, timestamptz, uuid) to service_role;
grant execute on function public.reopen_round(uuid, uuid) to service_role;
