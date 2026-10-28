# Langlands R3 — rehearsal database setup

**Date:** 2026-10-27  
**Target:** `langlands-rehearsal` / `fgqitafevklmuhybuwzw`  
**Hosted CLI link:** still `npwgkqfljrqhvuiateqk` — unused  
**Vercel:** not deployed  
**Accounts:** none created  
**Verdict:** Schema `0001`–`0011` is present on the rehearsal database. Event `langlands-r3` exists with 20 teams and 6 scheduled rounds. Local tests pass. Rehearsal play still needs authorised Auth accounts and signup disabled.

Secrets are not in this file.

---

## Target verification (before any write)

Independent checks, not the variable name:

| Check | Result |
| --- | --- |
| Tenant user contains `fgqitafevklmuhybuwzw` | yes |
| Hosted ref `npwgkqfljrqhvuiateqk` absent from session | yes |
| Server address matches AAAA of `db.fgqitafevklmuhybuwzw.supabase.co` | yes |
| Database name | `postgres` |
| Competitions before seed | empty (hosted already had `langlands-r3` from 2026-10-17) |
| CLI `supabase/.temp/project-ref` | still hosted; `db push` / `db reset` not run |

Direct port 5432 to `db.fgqitafevklmuhybuwzw.supabase.co` has no A record (IPv6 only). This machine has no IPv6 route (`No route to host`). Writes used the session pooler for **the same rehearsal tenant** in `ap-southeast-2`, then re-checked the server address before every file.

---

## Migration status

No `supabase_migrations.schema_migrations` table (dashboard + direct SQL, not CLI). Status is from live objects vs each file.

| File | Status | Evidence |
| --- | --- | --- |
| `0001_schema.sql` | **Already applied** (not rerun) | Types including `app_role`; 12 core tables; 0001 RLS policies. Matches the SQL Editor success and later `42710 type "app_role" already exists`. |
| `0002_official_score_deltas.sql` | **Already applied** (not rerun) | `rounds_event_code_pack_a`, `submissions_max_starts`, `submissions.checksum`, `town_states_score_breakdown_keys`, `is_staff` / `is_team_member` `SECURITY DEFINER`. Re-run would fail on `ADD CONSTRAINT` / `ADD COLUMN`. |
| `0003_profile_on_signup.sql` | **Newly applied** | `handle_new_user` + `on_auth_user_created` on `auth.users` |
| `0004_phase2_hardening.sql` | **Newly applied** | `published_results`; `created_by` nullable; `round_count = 6`; FORCE RLS; `event_multipliers` |
| `0005_seed_event.sql` | **Newly applied** | No slug conflict before run |
| `0006_round_machine.sql` | **Newly applied** | `open_round`, `lock_round`, `submit_decision`, `rounds.lock_manifest` |
| `0007_team_credentials.sql` | **Newly applied** | `teams.login_id`, `teams.password_hash` |
| `0008_reject_disqualified_submit.sql` | **Newly applied** | `submit_decision` body contains disqualified check |
| `0009_lock_manifest_privilege.sql` | **Newly applied** | `round_lock_private`; no SELECT for `anon` / `authenticated` |
| `0010_round_windows.sql` | **Newly applied** | `set_round_window(uuid, timestamptz, uuid)`, `reopen_round`, `open_round` stamps 18 minutes |
| `0011_restore_voided_round.sql` | **Newly applied** | `restore_voided_round`; `void_round` clears `round_lock_private` |

**Partially applied:** none remaining. `0001`/`0002` were already complete when this session connected. A post-check on `0010` used the wrong `set_round_window` arity; the file itself applied cleanly and was not retried.

---

## Seed (live rehearsal database)

| Object | Count / value |
| --- | --- |
| Event | `langlands-r3`, status `ready`, pack `A`, engine `py-ref-1.1.0`, rules `A-CAT-1.1` |
| Teams | **20** |
| Rounds | **6**, all `scheduled`, windows 1080s (18 min), 2099 placeholder clock |
| Pack A | R2 `HEATWAVE`, R3 `DROUGHT`, R4 `FLOOD`, R5 `CONTAMINATION`; R1/R6 none |
| Catalogue | 15 |
| Profiles / Auth users | **0** / **0** |
| Submissions / town_states / private locks | 0 / 0 / 0 |

---

## RLS, grants, lock protection

- FORCE RLS is on for the 0004 public tables. `round_lock_private` has RLS enabled, not FORCE; `anon` and `authenticated` have **no table privilege**.
- Organiser RPCs (`open_round`, `lock_round`, `publish_round`, `void_round`, `set_round_window`, `reopen_round`, `restore_voided_round`, `claim_process`, `seed_langlands_r3`) are **not** executable by `authenticated` or `anon`. `submit_decision` is executable by `authenticated` only.
- `authenticated` table grants are SELECT (plus column INSERT on submissions and `display_name` UPDATE on profiles). `anon` has no public table grants. `profiles.role` is not updatable by `authenticated`.
- `round_lock_private` is the allocation backstop. `authenticated` still has table-level SELECT on `rounds.lock_manifest` (0009 leaves a public seat summary there).
- Known 0007 limitation, unchanged: PostgreSQL table-level `GRANT SELECT` on `teams` still allows `authenticated` to read `password_hash`. Column `REVOKE` does not punch a hole in a table grant. Not repaired here (would need a new migration / grant rewrite).

---

## Local tests (PGlite / app; not the cloud database)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 warnings / 0 errors) |
| `npm run test:sim` | **54 / 54** pass |
| `npm run test:web` | **50 / 50** pass |
| `npm run test:db` | **38 / 38** pass |
| `npm run build` | pass (Next.js 15.5.28; `.env.local` = rehearsal host) |

Uncommitted working-tree files were left in place. No commit, push, or Vercel deploy.

---

## Remaining blockers for rehearsal play

1. **No Auth users** on this project (0). Do not provision until you name the accounts.
2. **`disable_signup` is still false.** Email on, Google off. Dashboard: disable public signup before invitations.
3. CLI remains linked to **hosted**. Never `supabase db push` / `db reset` from this repo until relinked to `fgqitafevklmuhybuwzw` and history is baselined.
4. No `schema_migrations` history on rehearsal. A future CLI link must baseline, not replay `0001`.
5. Direct IPv6 from this operator machine does not route; use the dashboard, IPv4 add-on, or the rehearsal pooler tenant — never the hosted CLI.
6. `password_hash` remains selectable by `authenticated` under the 0007 table GRANT (see above).
7. App is not on Vercel. Local `.env.local` already points at rehearsal.

---

## Safety confirmations

- Neither live hosted project was connected to or modified.
- No `supabase db push`, `db reset`, DROP TABLE, or data delete.
- No connection string, database password, or API keys printed, logged, or committed.
- No player or organiser accounts created.
- No Vercel deploy.
