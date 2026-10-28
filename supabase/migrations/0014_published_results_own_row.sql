-- Restrict direct participant reads of published_results to the caller's own team.
-- Organisers and judges of that competition keep TownPublic access after publish.
-- Round status must still be published. Authenticated still cannot INSERT/UPDATE/DELETE.
-- Does not rewrite scores, rows, or publication. Forward-only; do not apply to hosted
-- from an agent session.

drop policy if exists published_results_read on public.published_results;

create policy published_results_read on public.published_results
  for select using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and r.status = 'published'
    )
    and exists (
      select 1 from public.teams t
      where t.id = published_results.team_id
        and (
          public.is_team_member(t.id)
          or public.is_staff(
            t.competition_id,
            array['organiser'::public.app_role, 'judge'::public.app_role]
          )
        )
    )
  );

comment on policy published_results_read on public.published_results is
  'Own team after publish; organiser/judge of that competition. Not a public leaderboard.';
