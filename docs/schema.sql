-- Langlands R3 proposed schema (specification only; not applied).
-- Postgres 15+ / Supabase. All competition outcomes are server-written.

create extension if not exists "pgcrypto";

create type public.app_role as enum ('organiser', 'judge', 'captain', 'member');
create type public.competition_status as enum ('draft', 'ready', 'live', 'paused', 'closed', 'archived');
create type public.round_status as enum (
  'scheduled', 'open', 'locked', 'processing', 'published', 'void'
);
create type public.submission_status as enum ('accepted', 'superseded', 'rejected', 'late');
create type public.sector as enum (
  'restoration',
  'pollution_control',
  'water',
  'energy',
  'agriculture',
  'industry',
  'infrastructure',
  'public_services'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  status public.competition_status not null default 'draft',
  rules_version text not null,
  scenario_pack text not null default 'A',
  engine_version text not null,
  team_count smallint not null default 20 check (team_count = 20),
  round_count smallint not null default 6 check (round_count between 4 and 8),
  current_round_index smallint not null default 0 check (current_round_index >= 0),
  catalogue_hash text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  seat smallint not null check (seat between 1 and 20),
  name text not null check (char_length(name) between 2 and 60),
  slug text not null,
  disqualified boolean not null default false,
  unique (competition_id, seat),
  unique (competition_id, slug)
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.app_role not null check (member_role in ('captain', 'member')),
  primary key (team_id, user_id)
);

create table public.competition_staff (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  staff_role public.app_role not null check (staff_role in ('organiser', 'judge')),
  primary key (competition_id, user_id)
);

create table public.town_templates (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  initial_state jsonb not null,
  published boolean not null default false,
  checksum text not null
);

create table public.catalogue_projects (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  code text not null,
  name text not null,
  sector public.sector not null,
  cost integer not null check (cost > 0),
  build_rounds smallint not null check (build_rounds between 0 and 3),
  maintenance_per_round integer not null default 0 check (maintenance_per_round >= 0),
  max_copies smallint not null default 1 check (max_copies between 1 and 3),
  mutex_group text,
  prerequisites jsonb not null default '[]'::jsonb,
  min_state jsonb not null default '{}'::jsonb,
  immediate_effects jsonb not null default '{}'::jsonb,
  delayed_effects jsonb not null default '{}'::jsonb,
  ongoing_effects jsonb not null default '{}'::jsonb,
  unique (competition_id, code)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  round_index smallint not null check (round_index >= 1),
  status public.round_status not null default 'scheduled',
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  locked_at timestamptz,
  processed_at timestamptz,
  published_at timestamptz,
  event_code text,
  process_checksum text,
  constraint rounds_time check (closes_at > opens_at),
  unique (competition_id, round_index)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  allocations jsonb not null,
  project_starts text[] not null default '{}',
  notes text check (char_length(notes) <= 500),
  idempotency_key text not null,
  status public.submission_status not null default 'accepted',
  schema_version text not null,
  client_claimed_at timestamptz,
  server_received_at timestamptz not null default now(),
  accepted_spend integer,
  rejection_reason text,
  unique (round_id, team_id, idempotency_key)
);

create unique index submissions_one_accepted
  on public.submissions (round_id, team_id)
  where status = 'accepted';

create table public.town_states (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  round_index smallint not null,
  state jsonb not null,
  score_breakdown jsonb not null,
  snapshot_score numeric(5,2) not null,
  final_score numeric(5,2),
  engine_version text not null,
  unique (team_id, round_id)
);

create table public.round_process_runs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  attempt integer not null check (attempt >= 1),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  checksum text,
  error text,
  unique (round_id, attempt)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  competition_id uuid references public.competitions (id),
  team_id uuid references public.teams (id),
  action text not null,
  ip inet,
  user_agent text,
  payload jsonb not null default '{}'::jsonb
);

create index audit_logs_competition_at on public.audit_logs (competition_id, at desc);

-- Helpers
create or replace function public.is_staff(_competition uuid, _roles public.app_role[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.competition_staff s
    where s.competition_id = _competition
      and s.user_id = auth.uid()
      and s.staff_role = any (_roles)
  );
$$;

create or replace function public.is_team_member(_team uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = _team and m.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.competition_staff enable row level security;
alter table public.town_templates enable row level security;
alter table public.catalogue_projects enable row level security;
alter table public.rounds enable row level security;
alter table public.submissions enable row level security;
alter table public.town_states enable row level security;
alter table public.round_process_runs enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: self read/update display name; organisers read all.
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or exists (
    select 1 from public.competition_staff where user_id = auth.uid()
  ));
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));

-- Competitions: authenticated participants can read live/closed; staff read all.
create policy competitions_read on public.competitions
  for select using (
    status in ('ready', 'live', 'paused', 'closed')
    or public.is_staff(id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

-- Teams: members see own team; staff see all in their competition.
create policy teams_read on public.teams
  for select using (
    public.is_team_member(id)
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

create policy team_members_read on public.team_members
  for select using (
    user_id = auth.uid()
    or public.is_team_member(team_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.is_staff(t.competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
    )
  );

-- Catalogue and templates are public to participants once published.
create policy catalogue_read on public.catalogue_projects
  for select using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_id and c.status in ('ready', 'live', 'paused', 'closed')
    )
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

create policy template_read on public.town_templates
  for select using (
    published = true
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

create policy rounds_read on public.rounds
  for select using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_id and c.status in ('ready', 'live', 'paused', 'closed')
    )
    or public.is_staff(competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
  );

-- Submissions: team can insert/select own rows only while round is open.
-- Updates are not used; a new accepted row supersedes the previous in a transaction.
create policy submissions_team_read on public.submissions
  for select using (
    public.is_team_member(team_id)
    or exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_staff(r.competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
    )
  );

create policy submissions_team_insert on public.submissions
  for insert with check (
    public.is_team_member(team_id)
    and exists (
      select 1 from public.rounds r
      join public.teams t on t.id = team_id
      where r.id = round_id
        and r.competition_id = t.competition_id
        and r.status = 'open'
        and now() < r.closes_at
        and now() >= r.opens_at
    )
  );

-- Town states: own team always; other teams only after the round is published;
-- judges and organisers always. Scores are never client-writable.
create policy town_states_read on public.town_states
  for select using (
    public.is_team_member(team_id)
    or (
      exists (select 1 from public.rounds r where r.id = round_id and r.status = 'published')
      and exists (
        select 1 from public.teams t
        join public.team_members m on m.team_id = t.id
        where t.competition_id = (select competition_id from public.teams x where x.id = town_states.team_id)
          and m.user_id = auth.uid()
      )
    )
    or exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.is_staff(t.competition_id, array['organiser'::public.app_role, 'judge'::public.app_role])
    )
  );

create policy process_runs_staff_read on public.round_process_runs
  for select using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_staff(r.competition_id, array['organiser'::public.app_role])
    )
  );

create policy audit_staff_read on public.audit_logs
  for select using (
    public.is_staff(competition_id, array['organiser'::public.app_role])
  );

-- No insert/update/delete policies on town_states, rounds, scores, audit, or
-- process runs for authenticated users. The Next.js service role writes those.

revoke all on public.town_states from anon, authenticated;
grant select on public.town_states to authenticated;
revoke insert, update, delete on public.town_states from authenticated;

revoke all on public.round_process_runs from anon, authenticated;
grant select on public.round_process_runs to authenticated;

revoke insert, update, delete on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
