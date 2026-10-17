# Supabase setup (Phase 2–3)

No credentials live in this repository. The Next.js shell stays **not configured** until the public URL and anon key exist in `apps/web/.env.local`.

Docker and the Supabase CLI are **not** required for the local isolation suite (`npm run test:db`, PGlite). They **are** required to apply this schema to a real project.

## Locally verified (this machine)

```
npm run test:db      # PGlite + stub auth.uid(); 14 isolation + 14 round-machine tests
npm run test:sim     # frozen engine, 54 tests
```

These do **not** talk to supabase.com.

## Hosted project (unrun until you do it)

### 1. Project and keys

1. Create a project at https://supabase.com/dashboard.
2. Project Settings → API into `apps/web/.env.local` (names in `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — server only, never `NEXT_PUBLIC_*`

### 2. Auth (invited only)

Authentication → Providers: Email (magic link) and/or Google. **Disable** “Allow new users to sign up”.

URL Configuration: Site URL + `http://localhost:3000/auth/callback` and the production callback.

The signup trigger always inserts `profiles.role = member`. Promote staff with the SQL editor **as postgres / service role**:

```sql
update public.profiles set role = 'organiser' where id = '<user uuid>';
insert into public.competition_staff (competition_id, user_id, staff_role)
values (
  (select id from public.competitions where slug = 'langlands-r3'),
  '<user uuid>',
  'organiser'
);

-- captains, after the user exists
insert into public.team_members (team_id, user_id, member_role)
values (
  (select id from public.teams
    where seat = 1
      and competition_id = (select id from public.competitions where slug = 'langlands-r3')),
  '<user uuid>',
  'captain'
);
```

### 3. Apply migrations

SQL editor, **in order**, or linked CLI:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_official_score_deltas.sql
supabase/migrations/0003_profile_on_signup.sql
supabase/migrations/0004_phase2_hardening.sql
supabase/migrations/0005_seed_event.sql
supabase/migrations/0006_round_machine.sql
```

CLI (after `npm i -g supabase` and `supabase login` / `supabase link --project-ref <ref>`):

```
supabase db push
```

`0005` calls `seed_langlands_r3()` once. Safe to re-run:

```sql
select public.seed_langlands_r3();
```

### 4. Optional: re-run isolation against the linked project

Not automated here (no Docker on the Phase 2 builder). After `db push`, a hosted check is: sign in as two invited members and confirm Team A `select` on Team B `submissions` returns 0 rows in the SQL editor using `set request.jwt.claims`.

### 5. Trust boundary

- Browser: anon key only.
- Official simulation, lock, scores, `town_states`, `published_results`: service role on the server after a session check.
- Submit uses the user JWT against `submit_decision` (`auth.uid()`). Organiser RPCs are not executable as `authenticated`.
- Rivals read `published_results` after `rounds.status = 'published'`, never `town_states`.
