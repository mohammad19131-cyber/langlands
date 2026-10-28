-- submit_decision runs as SECURITY DEFINER but keeps auth.uid() as the captain
-- so membership checks work. Autosave then UPDATEs the previous accepted row to
-- superseded. The 0006 trigger treated every non-null auth.uid() write as a
-- direct client insert and rejected superseded.
--
-- Direct clients still cannot UPDATE (no policy / no grant) and still cannot
-- set status on INSERT (column GRANT omits it). This only permits the RPC
-- supersede transition.

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
    -- submit_decision supersedes the prior accepted row while the captain JWT is present.
    if tg_op = 'UPDATE' and old.status = 'accepted' and new.status = 'superseded' then
      return new;
    end if;
    if new.status not in ('accepted', 'late') then
      raise exception 'clients may only insert accepted or late proposals';
    end if;
  end if;

  return new;
end;
$$;
