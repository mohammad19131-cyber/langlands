-- Team ID + bcrypt credentials for participant login (Wolf-style).
-- Public login identifier is teams.login_id (e.g. 004). Internal id stays UUID.
-- password_hash is never granted to anon/authenticated. Auth sessions still use
-- auth.uid() so submit_decision / RLS stay unchanged.

alter table public.teams
  add column if not exists login_id text,
  add column if not exists password_hash text;

alter table public.teams
  drop constraint if exists teams_login_id_format;

alter table public.teams
  add constraint teams_login_id_format
  check (login_id is null or login_id ~ '^[0-9]{1,6}$');

create unique index if not exists teams_competition_login_id_uidx
  on public.teams (competition_id, login_id)
  where login_id is not null;

comment on column public.teams.login_id is
  'Public Team ID used at login (qualified competition ID). Not the row UUID.';
comment on column public.teams.password_hash is
  'bcrypt password hash only. Readable by service_role; never by browser roles.';

-- Column privilege: browser roles must not read hashes even if they can SELECT teams.
revoke select (password_hash) on table public.teams from public;
revoke select (password_hash) on table public.teams from anon;
revoke select (password_hash) on table public.teams from authenticated;
