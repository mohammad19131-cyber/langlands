-- Additive deltas from docs/database-schema.md and docs/security-and-permissions.md.
-- Does not rewrite 0001_schema.sql. Conflicts that were left unchanged are listed
-- in supabase/MIGRATIONS.md.

-- Pack A event codes only (NULL = no named shock).
alter table public.rounds
  add constraint rounds_event_code_pack_a check (
    event_code is null
    or event_code in ('HEATWAVE', 'DROUGHT', 'FLOOD', 'CONTAMINATION')
  );

-- Max two intervention starts per submission (game freeze).
alter table public.submissions
  add constraint submissions_max_starts check (cardinality(project_starts) <= 2);

-- Server-applied allocation checksum (after scaling / dropped starts).
alter table public.submissions
  add column checksum text;

-- Official score_breakdown keys. Values remain numeric in application writes.
alter table public.town_states
  add constraint town_states_score_breakdown_keys check (
    score_breakdown ? 'ecology'
    and score_breakdown ? 'welfare'
    and score_breakdown ? 'economy'
    and score_breakdown ? 'resilience'
    and score_breakdown ? 'efficiency'
    and score_breakdown ? 'penalty'
    and score_breakdown ? 'snapshot'
  );

-- RLS helper functions in 0001 are SECURITY INVOKER. competition_staff has no
-- SELECT policy, and team_members_read calls is_team_member which reads
-- team_members — both would fail or recurse. Recreate as SECURITY DEFINER
-- so the published permission matrix can actually run.
create or replace function public.is_staff(_competition uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = _team and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_staff(uuid, public.app_role[]) from public;
revoke all on function public.is_team_member(uuid) from public;
grant execute on function public.is_staff(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;

-- 0001 defined policies but omitted table GRANTs. Additive so authenticated
-- can exercise those policies; town_states / process / audit remain select-only.
grant usage on schema public to authenticated, anon;

grant select, update on public.profiles to authenticated;
grant select on public.competitions to authenticated;
grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select on public.competition_staff to authenticated;
grant select on public.town_templates to authenticated;
grant select on public.catalogue_projects to authenticated;
grant select on public.rounds to authenticated;
grant select, insert on public.submissions to authenticated;
grant select on public.town_states to authenticated;
grant select on public.round_process_runs to authenticated;
grant select on public.audit_logs to authenticated;
