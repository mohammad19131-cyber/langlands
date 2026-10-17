# Phase 2 security audit

Inspected `docs/schema.sql`, `0001`–`0003`, GRANTs, RLS, triggers, and SECURITY DEFINER helpers **before** seeding. Findings below are fixed in `0004_phase2_hardening.sql` unless marked residual.

## Trust boundary (unchanged)

Clients may propose allocations, at most two catalogue codes, and an idempotency key. The server (service role) owns deadlines, remaining credits, simulation, scores, lock/process/publish, and `published_results`.

## Findings

| ID | Severity | Issue | Fix in 0004 |
| --- | --- | --- | --- |
| A1 | High | After `published`, `town_states_read` let any teammate in the competition `SELECT` the full `state` jsonb (owned projects, pending effects, last allocations). Spec: rivals see **TownPublic** pillars/map tiles only. | New `published_results` table with TownPublic columns only. `town_states` readable by **own team + organiser**, never rivals. |
| A2 | High | `submissions_team_read` treated judges as staff, so judges could read live rival submissions. Matrix: organiser only, audited. | Submissions select: own team or **organiser**. Judges use `published_results`. |
| A3 | High | Judges could read unpublished `town_states` (live budgets). Matrix: no live rival budgets. | Judges have no `town_states` policy. |
| A4 | Medium | Column-level INSERT on `submissions` was unrestricted: a member could set `checksum`, `accepted_spend`, `status`. | GRANT INSERT only on client columns. Trigger strips/rejects server fields when `auth.uid()` is set. |
| A5 | Medium | `profiles_self_update` WITH CHECK reads `profiles.role` from the same table (RLS USING/CHECK can see the NEW row). Role lock was not robust. | BEFORE UPDATE trigger: `role` and `id` immutable. GRANT UPDATE (`display_name`) only. |
| A6 | Medium | `handle_new_user` always inserts `member` (good) but `search_path` omitted `pg_temp`. | Recreate with `search_path = public, pg_temp`. Role still hardcoded `member`. |
| A7 | Medium | `is_staff` / `is_team_member` SECURITY DEFINER used `search_path = public` only. | Recreate with `public, pg_temp`. Add `is_organiser`, `is_judge`, `is_competition_participant`. |
| A8 | Medium | `authenticated` GRANT SELECT on `town_states` plus the published-all-rows policy leaked private jsonb. | Policy + table split; REVOKE ALL then GRANT minimum. FORCE ROW LEVEL SECURITY. |
| A9 | Low | `competitions.round_count` allowed 4–8. Live freeze is 6. | CHECK `round_count = 6`; `rounds.round_index BETWEEN 1 AND 6`. |
| A10 | Low | No table GRANT/REVOKE hygiene vs hosted default privileges (`GRANT ALL` to `anon`/`authenticated`). | Explicit REVOKE ALL from `anon`/`public`/`authenticated`, then GRANT the matrix. |
| A11 | Info | `created_by` NOT NULL blocked seeding without a fake `auth.users` row. | `created_by` nullable. Seed does not create users. Captains remain unassigned. |
| A12 | Info | Catalogue had no `event_multipliers` column, so a seed could not store pack A modifiers. | Additive jsonb column. |

## What was already correct

- No INSERT/UPDATE/DELETE policies on `town_states`, rounds, competitions, scores, process runs, or audit for `authenticated`.
- Submission insert requires membership, `status = open`, and database `now()` inside `[opens_at, closes_at)`.
- Unique `(round_id, team_id, idempotency_key)` and one `accepted` row per team/round.
- `handle_new_user` ignores metadata `role`.
- Service role is not a `NEXT_PUBLIC_*` variable.

## Residual risks (not claimed “secure” without tests)

1. **Service role bypasses RLS.** Anyone with `SUPABASE_SERVICE_ROLE_KEY` can read every team. Keep it server-only. Unresolved if that key leaks.
2. **Organiser live access** to submissions and `town_states` is required for the support view. Phase 3 `GET /api/rounds/:id/support/:teamId` writes `audit_logs` (`support_read`) before returning a **reduced** payload (submission id/status/allocations; town snapshot/final scores, not full private jsonb). Direct SQL as service role still bypasses that HTTP audit.
3. **Hosted Auth “allow new users”** is a dashboard switch. Schema cannot stop GoTrue sign-ups; it can only force `profiles.role = member`.
4. **Mutex/prerequisites against pre-round town state** are engine rules. `submit_decision` plus `assertAuthoritativeStarts` (dry-run `stepRound`) reject unknown codes, duplicates, mutex pairs, a third start, and starts the engine would drop (prereq/budget). Sector overspend is still scaled by the engine, not rejected.
5. **These tests run on PGlite with a stub `auth` schema**, not on hosted Supabase. Hosted verification still requires applying `0001`–`0006` and re-running the suite against a real project (see `supabase/SETUP.md`).
