-- Phase 2 hardening. Additive. Does not edit 0001–0003.
-- Closes audit items in supabase/SECURITY-AUDIT.md.

-- ---------------------------------------------------------------------------
-- 1. Six-round freeze
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'competitions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%round_count%'
  loop
    execute format('alter table public.competitions drop constraint %I', r.conname);
  end loop;
end$$;

alter table public.competitions
  add constraint competitions_round_count_is_six check (round_count = 6);

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'rounds'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%round_index%'
  loop
    execute format('alter table public.rounds drop constraint %I', r.conname);
  end loop;
end$$;

alter table public.rounds
  add constraint rounds_round_index_one_to_six check (round_index between 1 and 6);

alter table public.competitions
  drop constraint if exists competitions_current_round_index_check;

alter table public.competitions
  add constraint competitions_current_round_index_check
  check (current_round_index between 0 and 6);

-- Seed may run before any organiser account exists.
alter table public.competitions
  alter column created_by drop not null;

-- Pack A freeze on the competition row (events still per-round).
alter table public.competitions
  drop constraint if exists competitions_scenario_pack_a;
alter table public.competitions
  add constraint competitions_scenario_pack_a check (scenario_pack = 'A');

-- ---------------------------------------------------------------------------
-- 2. Catalogue event multipliers (engine field not in 0001)
-- ---------------------------------------------------------------------------
alter table public.catalogue_projects
  add column if not exists event_multipliers jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Public results — TownPublic only. No allocations, queued projects, or pending effects.
-- ---------------------------------------------------------------------------
create table public.published_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  round_index smallint not null check (round_index between 1 and 6),
  team_seat smallint not null check (team_seat between 1 and 20),
  team_name text not null,
  air numeric not null,
  water_q numeric not null,
  soil numeric not null,
  bio numeric not null,
  pollution numeric not null,
  health numeric not null,
  services numeric not null,
  jobs numeric not null,
  economy numeric not null,
  fiscal numeric not null,
  energy numeric not null,
  infra numeric not null,
  prep numeric not null,
  buffer numeric not null,
  reserve numeric not null,
  population numeric not null,
  energy_mix text not null check (energy_mix in ('thermal-heavy', 'mixed', 'clean-leaning')),
  agriculture text not null check (agriculture in ('intensive', 'mixed', 'regenerative')),
  industry text not null check (industry in ('light', 'heavy')),
  score_breakdown jsonb not null,
  snapshot_score numeric(5,2) not null,
  final_score numeric(5,2),
  engine_version text not null,
  unique (team_id, round_id),
  constraint published_results_score_breakdown_keys check (
    score_breakdown ? 'ecology'
    and score_breakdown ? 'welfare'
    and score_breakdown ? 'economy'
    and score_breakdown ? 'resilience'
    and score_breakdown ? 'efficiency'
    and score_breakdown ? 'penalty'
    and score_breakdown ? 'snapshot'
  )
);

create index published_results_round_idx on public.published_results (round_id);
create index submissions_team_round_idx on public.submissions (team_id, round_id);
create index town_states_round_idx on public.town_states (round_id);
create index team_members_user_idx on public.team_members (user_id);

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER helpers — fixed search_path, explicit uid checks
-- ---------------------------------------------------------------------------
create or replace function public.is_staff(_competition uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and exists (
      select 1 from public.competition_staff s
      where s.competition_id = _competition
        and s.user_id = auth.uid()
        and s.staff_role = any (_roles)
    );
$$;

create or replace function public.is_organiser(_competition uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_staff(_competition, array['organiser'::public.app_role]);
$$;

create or replace function public.is_judge(_competition uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_staff(_competition, array['judge'::public.app_role]);
$$;

create or replace function public.is_team_member(_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and exists (
      select 1 from public.team_members m
      where m.team_id = _team and m.user_id = auth.uid()
    );
$$;

create or replace function public.is_competition_participant(_competition uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.team_members m
      join public.teams t on t.id = m.team_id
      where t.competition_id = _competition
        and m.user_id = auth.uid()
    );
$$;

revoke all on function public.is_staff(uuid, public.app_role[]) from public, anon;
revoke all on function public.is_organiser(uuid) from public, anon;
revoke all on function public.is_judge(uuid) from public, anon;
revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.is_competition_participant(uuid) from public, anon;

grant execute on function public.is_staff(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_organiser(uuid) to authenticated;
grant execute on function public.is_judge(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_competition_participant(uuid) to authenticated;

-- Signup: always member. Never copy a role out of user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );
  if char_length(chosen_name) < 2 then
    chosen_name := 'Player';
  end if;
  if char_length(chosen_name) > 80 then
    chosen_name := left(chosen_name, 80);
  end if;

  insert into public.profiles (id, display_name, role)
  values (new.id, chosen_name, 'member')
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Role / id cannot change from the browser, even if a WITH CHECK subquery misfires.
create or replace function public.profiles_lock_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable';
  end if;
  -- Browser sessions cannot self-promote. Service role (auth.uid() is null) may
  -- assign organiser/judge when inviting staff.
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'profiles.role cannot be changed by this role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_privileged_columns on public.profiles;
create trigger profiles_lock_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_lock_privileged_columns();

revoke all on function public.profiles_lock_privileged_columns() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Submission sanitise + catalogue / mutex checks (client path)
-- ---------------------------------------------------------------------------
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

  -- Browser path: never accept server-owned fields as truth.
  if auth.uid() is not null then
    new.checksum := null;
    new.accepted_spend := null;
    new.rejection_reason := null;
    new.server_received_at := now();
    if new.status is distinct from 'accepted' then
      raise exception 'clients may only insert accepted proposals';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_before_write on public.submissions;
create trigger submissions_before_write
  before insert or update on public.submissions
  for each row execute function public.submissions_before_write();

revoke all on function public.submissions_before_write() from public, anon, authenticated;

-- Clients cannot update or delete submissions. Supersede is a service-role transaction (Phase 3).
-- No update/delete policies are created.

-- ---------------------------------------------------------------------------
-- 6. RLS policies — drop and recreate with the permission matrix
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists competitions_read on public.competitions;
drop policy if exists teams_read on public.teams;
drop policy if exists team_members_read on public.team_members;
drop policy if exists catalogue_read on public.catalogue_projects;
drop policy if exists template_read on public.town_templates;
drop policy if exists rounds_read on public.rounds;
drop policy if exists submissions_team_read on public.submissions;
drop policy if exists submissions_team_insert on public.submissions;
drop policy if exists town_states_read on public.town_states;
drop policy if exists process_runs_staff_read on public.round_process_runs;
drop policy if exists audit_staff_read on public.audit_logs;

create policy profiles_self_read on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.competition_staff s
      where s.user_id = auth.uid()
        and s.staff_role = 'organiser'
    )
  );

create policy profiles_self_update on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy competitions_read on public.competitions
  for select using (
    public.is_competition_participant(id)
    or public.is_staff(id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

-- Seat/name are not secret; required for the published board. No private state here.
create policy teams_read on public.teams
  for select using (
    public.is_competition_participant(competition_id)
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

create policy team_members_read on public.team_members
  for select using (
    user_id = auth.uid()
    or public.is_team_member(team_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.is_organiser(t.competition_id)
    )
  );

create policy competition_staff_organiser_read on public.competition_staff
  for select using (public.is_organiser(competition_id));

create policy catalogue_read on public.catalogue_projects
  for select using (
    public.is_competition_participant(competition_id)
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

create policy template_read on public.town_templates
  for select using (
    published = true
    and (
      public.is_competition_participant(competition_id)
      or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
    )
  );

create policy rounds_read on public.rounds
  for select using (
    public.is_competition_participant(competition_id)
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

create policy submissions_team_read on public.submissions
  for select using (
    public.is_team_member(team_id)
    or exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_organiser(r.competition_id)
    )
  );

create policy submissions_team_insert on public.submissions
  for insert with check (
    public.is_team_member(team_id)
    and exists (
      select 1
      from public.rounds r
      join public.teams t on t.id = team_id
      where r.id = round_id
        and r.competition_id = t.competition_id
        and r.status = 'open'
        and now() >= r.opens_at
        and now() < r.closes_at
    )
  );

-- Private snapshots: own team, or organiser (support view). Never rivals. Never judges.
create policy town_states_own_or_organiser on public.town_states
  for select using (
    public.is_team_member(team_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.is_organiser(t.competition_id)
    )
  );

create policy published_results_read on public.published_results
  for select using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and r.status = 'published'
    )
    and exists (
      select 1 from public.teams t
      where t.id = team_id
        and (
          public.is_competition_participant(t.competition_id)
          or public.is_staff(
            t.competition_id,
            array['organiser'::public.app_role, 'judge'::public.app_role]
          )
        )
    )
  );

create policy process_runs_staff_read on public.round_process_runs
  for select using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_organiser(r.competition_id)
    )
  );

create policy audit_staff_read on public.audit_logs
  for select using (public.is_organiser(competition_id));

-- ---------------------------------------------------------------------------
-- 7. Privileges — do not rely on RLS alone
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant usage on schema public to authenticated, anon;

grant select, update (display_name) on public.profiles to authenticated;
grant select on public.competitions to authenticated;
grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select on public.competition_staff to authenticated;
grant select on public.town_templates to authenticated;
grant select on public.catalogue_projects to authenticated;
grant select on public.rounds to authenticated;
grant select on public.town_states to authenticated;
grant select on public.published_results to authenticated;
grant select on public.round_process_runs to authenticated;
grant select on public.audit_logs to authenticated;

grant select on public.submissions to authenticated;
grant insert (
  round_id,
  team_id,
  allocations,
  project_starts,
  notes,
  idempotency_key,
  schema_version,
  client_claimed_at
) on public.submissions to authenticated;

-- Re-grant helper execute after the blanket function revoke.
grant execute on function public.is_staff(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_organiser(uuid) to authenticated;
grant execute on function public.is_judge(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_competition_participant(uuid) to authenticated;

alter table public.profiles force row level security;
alter table public.competitions force row level security;
alter table public.teams force row level security;
alter table public.team_members force row level security;
alter table public.competition_staff force row level security;
alter table public.town_templates force row level security;
alter table public.catalogue_projects force row level security;
alter table public.rounds force row level security;
alter table public.submissions force row level security;
alter table public.town_states force row level security;
alter table public.published_results enable row level security;
alter table public.published_results force row level security;
alter table public.round_process_runs force row level security;
alter table public.audit_logs force row level security;

-- Hosted Supabase grants service_role ALL + BYPASSRLS. Mirror that so official
-- writes do not depend on being table owner.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant usage on schema public to service_role;
