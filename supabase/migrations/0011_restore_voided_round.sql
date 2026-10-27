-- Unpublished void may return to scheduled so the same round_index (and Pack A
-- event) can be opened again. Does not treat void as published. Does not skip
-- rounds. Does not rewrite published scores. Published rounds remain un-voidable.

create or replace function public.void_round(_round_id uuid, _actor uuid)
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
  if round_row.status = 'published' then
    raise exception 'cannot void published' using errcode = 'P0001';
  end if;
  if round_row.status = 'void' then
    return jsonb_build_object('ok', true, 'status', 'void', 'idempotent', true);
  end if;

  delete from public.town_states where round_id = _round_id;
  delete from public.published_results where round_id = _round_id;
  delete from public.round_lock_private where round_id = _round_id;
  update public.rounds
     set status = 'void',
         lock_manifest = null,
         locked_at = null,
         process_claim_token = null,
         process_checksum = null,
         processed_at = null,
         process_claimed_at = null
   where id = _round_id;
  return jsonb_build_object('ok', true, 'status', 'void', 'idempotent', false);
end;
$$;

create or replace function public.restore_voided_round(_round_id uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_row public.rounds%rowtype;
  later_started integer;
  town_count integer;
  result_count integer;
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
  if round_row.status = 'scheduled' then
    return jsonb_build_object('ok', true, 'status', 'scheduled', 'idempotent', true);
  end if;
  if round_row.status is distinct from 'void' then
    raise exception 'cannot restore' using errcode = 'P0001';
  end if;

  select count(*)::int into later_started
  from public.rounds
  where competition_id = round_row.competition_id
    and round_index > round_row.round_index
    and status in ('open', 'locked', 'processing', 'published');
  if later_started > 0 then
    raise exception 'cannot restore' using errcode = 'P0001';
  end if;

  select count(*)::int into town_count from public.town_states where round_id = _round_id;
  select count(*)::int into result_count from public.published_results where round_id = _round_id;
  if town_count > 0 or result_count > 0 then
    raise exception 'cannot restore' using errcode = 'P0001';
  end if;

  delete from public.round_lock_private where round_id = _round_id;

  update public.rounds
     set status = 'scheduled',
         lock_manifest = null,
         locked_at = null,
         process_claim_token = null,
         process_checksum = null,
         processed_at = null,
         process_claimed_at = null,
         published_at = null
   where id = _round_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'scheduled',
    'idempotent', false,
    'round_index', round_row.round_index
  );
end;
$$;

revoke all on function public.void_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.restore_voided_round(uuid, uuid) from public, anon, authenticated;

grant execute on function public.void_round(uuid, uuid) to service_role;
grant execute on function public.restore_voided_round(uuid, uuid) to service_role;
