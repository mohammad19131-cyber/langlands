# Langlands R3 — connect rehearsal project

**Date:** 2026-10-27  
**Rehearsal project:** `langlands-rehearsal` / `fgqitafevklmuhybuwzw`  
**Hosted competition (untouched):** ref in `supabase/SETUP.md` (`npwgkqfljrqhvuiateqk`)  
**Verdict:** Local env now targets the rehearsal project. **Migrations were not applied** (no SQL execution path that can address this ref without using the hosted CLI link). Auth still needs dashboard changes. Dummy provision and organiser login were **not** run. **Not ready for a six-round cloud rehearsal.**

No API keys, passwords, tokens, or `TEAM_PROVISION_SECRET` are in this file.

---

## 1. Target verification

| Check | Result |
| --- | --- |
| New ref ≠ hosted ref | **yes** (`fgqitafevklmuhybuwzw` ≠ `npwgkqfljrqhvuiateqk`) |
| `apps/web/.env.local` host | `fgqitafevklmuhybuwzw.supabase.co` |
| Hosted backup | `apps/web/.env.hosted.local` preserved (gitignored, mode 600) |
| CLI link | still the hosted ref — **not changed**; `supabase db push` **not run** |
| Forbidden `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | absent |
| `TEAM_PROVISION_SECRET` | set in ignored env only (length stored, value not printed) |
| `.env.local` gitignored | yes |

REST against the rehearsal host only: `public.competitions`, `public.rounds`, and `public.teams` return PostgREST “table not found”. The rehearsal database is **fresh**. No Langlands seed is present, so there is no seed conflict yet.

---

## 2. What this session changed

- Wrote gitignored `apps/web/.env.local` for the rehearsal URL, publishable key, server-only service-role name `SUPABASE_SERVICE_ROLE_KEY`, and a generated `TEAM_PROVISION_SECRET`.
- Did **not** overwrite `apps/web/.env.hosted.local`.
- Did **not** modify source, migrations, CLI link, Vercel, or either other Supabase project.

---

## 3. Auth (read-only probe of rehearsal `/auth/v1/settings`)

| Setting | Observed | Required |
| --- | --- | --- |
| Email/password (`external.email`) | true | on |
| Google | false | off |
| Public signup (`disable_signup`) | **false** (signups still allowed) | must be **true** / allow signup **off** |
| Site URL / callback | **not** in this public payload | `http://localhost:3000` and `/auth/callback` |

Dashboard methods from this agent cannot change Auth. **You must:**

1. Open project **langlands-rehearsal** (confirm ref `fgqitafevklmuhybuwzw`).
2. Authentication → Providers → **Email** enabled; **Google** disabled.
3. Authentication → Providers → Email → **Allow new users to sign up** = **disabled**.
4. Authentication → URL Configuration → Site URL = `http://localhost:3000`.
5. Redirect URLs include `http://localhost:3000/auth/callback`.

---

## 4. Migrations — not applied

There is no safe executor that targets `fgqitafevklmuhybuwzw` without a dashboard SQL session or a personal access token. The Management SQL API returned 401 with the project secret (expected). `/pg/query` is not exposed. The CLI is still linked to hosted, so it was not used.

Deletes in `0006`/`0010`/`0011` are inside round-machine functions, not one-shot wipes. `0005` inserts seed on conflict and calls `seed_langlands_r3()` once. Safe on an empty project.

**You apply these in the rehearsal SQL Editor, one file, wait for success, next file:**

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_official_score_deltas.sql`
3. `supabase/migrations/0003_profile_on_signup.sql`
4. `supabase/migrations/0004_phase2_hardening.sql`
5. `supabase/migrations/0005_seed_event.sql`
6. `supabase/migrations/0006_round_machine.sql`
7. `supabase/migrations/0007_team_credentials.sql`
8. `supabase/migrations/0008_reject_disqualified_submit.sql`
9. `supabase/migrations/0009_lock_manifest_privilege.sql`
10. `supabase/migrations/0010_round_windows.sql`
11. `supabase/migrations/0011_restore_voided_round.sql`

Confirm the editor is **langlands-rehearsal** before each run. Then:

```sql
select slug, status, team_count, round_count from public.competitions where slug = 'langlands-r3';
select count(*) from public.teams;
select round_index, status, event_code from public.rounds order by round_index;
```

Expect: `ready`, 20 seats, six `scheduled` rounds.

---

## 5. Tests actually run

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:sim` | **54/54** |
| `npm run test:web` | **50/50** |
| `npm run test:db` | **38/38** (PGlite, not the cloud project) |
| `npm run build` | pass |

Browser (local `next dev`, env = rehearsal):

| Route | Result |
| --- | --- |
| `/play/fixture` | Ashfen map, unofficial preview, **Preview only** (no persist) |
| `/sign-in` GET | Team ID / staff email form (backend configured). **No login POST** |
| `/play`, `/room` unsigned | redirect to `/sign-in` |

**Not run:** provision 20 teams, `organiser:local`, login POST, round RPCs, SQL migrations.

---

## 6. Remaining blockers before a six-round rehearsal

1. Apply `0001`–`0011` in the **rehearsal** SQL Editor.
2. Disable public signup; set localhost site URL + callback.
3. Only then: `npm run organiser:local` and provision dummy IDs `001`–`020` (env already points at rehearsal; CLI must stay unused).
4. Seated `/play` save and `/room` open/lock/process/publish.

Hosted competition: still **NO-GO**, not modified.

---

## 7. Git

`main` dirty with prior uncommitted HUD/migrations/APIs. `.env.local` and `.env.hosted.local` are ignored and do not appear in `git status`. No secrets committed.

Because credentials were supplied in chat, rotate the rehearsal publishable and secret keys after this event if the transcript is retained.

---

## Files changed this session

- `apps/web/.env.local` (gitignored rehearsal env)
- `docs/audits/LANGLANDS_LAUNCH_DAY_REHEARSAL_CONNECT_2026-10-27.md`

Hosted backup left intact. CLI link unchanged.
