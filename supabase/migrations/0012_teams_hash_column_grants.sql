-- 0007 column REVOKE does not remove password_hash from a table-level GRANT SELECT.
-- PostgreSQL still lets authenticated read every column, including the bcrypt hash.
-- Replace table SELECT with column SELECT on public gameplay fields only.
-- Does not alter hashes, RLS, or service_role privileges.

revoke select on table public.teams from public;
revoke select on table public.teams from anon;
revoke select on table public.teams from authenticated;

grant select (
  id,
  competition_id,
  seat,
  name,
  slug,
  disqualified,
  login_id
) on table public.teams to authenticated;
