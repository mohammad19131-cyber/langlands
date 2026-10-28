-- Organiser rehearsal controls: reset play data, edit team/member names.
-- Does not rewrite scores. Deletes submissions / town_states / published_results
-- and returns rounds to scheduled. Keeps teams, team_members, credentials,
-- staff, catalogue, and the town template. Service-role execute only.

create or replace function public.reset_competition_play(_competition uuid, _actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_n integer;
  member_n integer;
  sub_n integer;
  town_n integer;
  pub_n integer;
  run_n integer;
  lock_n integer;
begin
  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from _actor then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.competitions c where c.id = _competition
  ) then
    raise exception 'unknown competition' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = _competition
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(('x' || substr(replace(_competition::text, '-', ''), 1, 16))::bit(64)::bigint);

  select count(*)::int into team_n from public.teams where competition_id = _competition;
  select count(*)::int into member_n
    from public.team_members m
    join public.teams t on t.id = m.team_id
   where t.competition_id = _competition;

  delete from public.submissions s
   using public.rounds r
   where s.round_id = r.id and r.competition_id = _competition;
  get diagnostics sub_n = row_count;

  delete from public.town_states ts
   using public.rounds r
   where ts.round_id = r.id and r.competition_id = _competition;
  get diagnostics town_n = row_count;

  delete from public.published_results pr
   using public.rounds r
   where pr.round_id = r.id and r.competition_id = _competition;
  get diagnostics pub_n = row_count;

  delete from public.round_process_runs rp
   using public.rounds r
   where rp.round_id = r.id and r.competition_id = _competition;
  get diagnostics run_n = row_count;

  delete from public.round_lock_private lp
   using public.rounds r
   where lp.round_id = r.id and r.competition_id = _competition;
  get diagnostics lock_n = row_count;

  update public.rounds
     set status = 'scheduled',
         locked_at = null,
         processed_at = null,
         published_at = null,
         process_checksum = null,
         process_claim_token = null,
         process_claimed_at = null,
         lock_manifest = null
   where competition_id = _competition;

  update public.competitions
     set status = 'ready',
         current_round_index = 0
   where id = _competition;

  insert into public.audit_logs (actor_id, competition_id, team_id, action, payload)
  values (
    _actor,
    _competition,
    null,
    'reset_competition_play',
    jsonb_build_object(
      'submissions', sub_n,
      'town_states', town_n,
      'published_results', pub_n,
      'process_runs', run_n,
      'lock_private', lock_n
    )
  );

  if (select count(*) from public.teams where competition_id = _competition) is distinct from team_n then
    raise exception 'team rows must be preserved' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.team_members m
    join public.teams t on t.id = m.team_id
    where t.competition_id = _competition
  ) is distinct from member_n then
    raise exception 'team member rows must be preserved' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'teams', team_n,
    'members', member_n,
    'deleted', jsonb_build_object(
      'submissions', sub_n,
      'town_states', town_n,
      'published_results', pub_n,
      'process_runs', run_n,
      'lock_private', lock_n
    )
  );
end;
$$;

create or replace function public.organiser_update_team(_team_id uuid, _actor uuid, _name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_row public.teams%rowtype;
  cleaned text;
begin
  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from _actor then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  cleaned := trim(_name);
  if cleaned is null or char_length(cleaned) < 2 or char_length(cleaned) > 60 then
    raise exception 'invalid team name' using errcode = '22023';
  end if;
  select * into team_row from public.teams where id = _team_id for update;
  if not found then
    raise exception 'unknown team' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = team_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update public.teams set name = cleaned where id = _team_id;

  insert into public.audit_logs (actor_id, competition_id, team_id, action, payload)
  values (
    _actor,
    team_row.competition_id,
    _team_id,
    'organiser_update_team',
    jsonb_build_object('name', cleaned, 'seat', team_row.seat)
  );

  return jsonb_build_object('ok', true, 'teamId', _team_id, 'name', cleaned, 'seat', team_row.seat);
end;
$$;

create or replace function public.organiser_update_team_member(
  _team_id uuid,
  _user_id uuid,
  _actor uuid,
  _display_name text,
  _member_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_row public.teams%rowtype;
  cleaned text;
  role_clean public.app_role;
begin
  if _actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from _actor then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  cleaned := trim(_display_name);
  if cleaned is null or char_length(cleaned) < 2 or char_length(cleaned) > 80 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;
  select * into team_row from public.teams where id = _team_id;
  if not found then
    raise exception 'unknown team' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_staff s
    where s.competition_id = team_row.competition_id
      and s.user_id = _actor
      and s.staff_role = 'organiser'
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.team_members m
    where m.team_id = _team_id and m.user_id = _user_id
  ) then
    raise exception 'unknown member' using errcode = '22023';
  end if;

  if _member_role is not null then
    if _member_role not in ('captain', 'member') then
      raise exception 'invalid member role' using errcode = '22023';
    end if;
    role_clean := _member_role::public.app_role;
    update public.team_members
       set member_role = role_clean
     where team_id = _team_id and user_id = _user_id;
  else
    select member_role into role_clean
      from public.team_members
     where team_id = _team_id and user_id = _user_id;
  end if;

  update public.profiles set display_name = cleaned where id = _user_id;

  insert into public.audit_logs (actor_id, competition_id, team_id, action, payload)
  values (
    _actor,
    team_row.competition_id,
    _team_id,
    'organiser_update_team_member',
    jsonb_build_object('userId', _user_id, 'displayName', cleaned, 'memberRole', role_clean)
  );

  return jsonb_build_object(
    'ok', true,
    'teamId', _team_id,
    'userId', _user_id,
    'displayName', cleaned,
    'memberRole', role_clean
  );
end;
$$;

revoke all on function public.reset_competition_play(uuid, uuid) from public, anon, authenticated;
revoke all on function public.organiser_update_team(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.organiser_update_team_member(uuid, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.reset_competition_play(uuid, uuid) to service_role;
grant execute on function public.organiser_update_team(uuid, uuid, text) to service_role;
grant execute on function public.organiser_update_team_member(uuid, uuid, uuid, text, text) to service_role;

comment on function public.reset_competition_play(uuid, uuid) is
  'Organiser: delete play history, keep teams and members, return to ready/scheduled.';
comment on function public.organiser_update_team(uuid, uuid, text) is
  'Organiser: rename a team. Does not change seat, login_id, or password_hash.';
comment on function public.organiser_update_team_member(uuid, uuid, uuid, text, text) is
  'Organiser: edit a team member display name and optional captain/member role.';
