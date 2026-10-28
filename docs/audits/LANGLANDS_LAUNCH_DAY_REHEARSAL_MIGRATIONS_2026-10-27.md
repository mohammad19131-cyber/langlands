# Langlands R3 — rehearsal migrations (stopped)

**Date:** 2026-10-27  
**Target attempted:** `langlands-rehearsal` / `fgqitafevklmuhybuwzw`  
**Hosted CLI link:** still the competition in `supabase/SETUP.md` — unused  
**Verdict:** **Stopped before any cloud SQL write.** Local env is rehearsal. The rehearsal database still has no Langlands tables. Player/organiser Auth on this project has **0 users**. Six-round cloud rehearsal cannot start.

Secrets are not in this file.

---

## Verified (read-only)

- `apps/web/.env.local` host is `fgqitafevklmuhybuwzw.supabase.co` (not hosted).
- REST `competitions` / `rounds` / `teams` → PostgREST table-not-found (fresh schema).
- Auth admin users on rehearsal: **0**. Local organiser email is **not** present.
- Email provider on; Google off; `disable_signup` still **false** on the public settings endpoint (dashboard signup flag was not changed here).
- CLI project-ref is still hosted. `supabase db push` was not run.

## Why migrations were not applied

No executor uniquely addresses `fgqitafevklmuhybuwzw` without risking hosted:

| Method | Result |
| --- | --- |
| `supabase db push` / linked CLI | would hit hosted — **not used** |
| Management SQL API with project secret | 401 |
| `/pg/query` | 404 |
| `SUPABASE_DB_URL` / `psql` | absent |
| Supabase personal access token | absent |
| Dashboard SQL Editor | requires dashboard sign-in; this session did not enter credentials |

No migration file was executed. No tables were created or dropped.

## Accounts (not created)

You asked to use existing player accounts and not provision duplicates. On **this** project the Admin Users API returned an empty list, so those accounts are not here (they may live on another project). Organiser `organiser-local@langlands.dev` is also missing. No provision and no `organiser:local` were run.

## Local checks (this run)

| Command | Result |
| --- | --- |
| typecheck | pass |
| lint | pass |
| test:sim | 54/54 |
| test:web | 50/50 |
| test:db | 38/38 PGlite |
| production build | pass |

Browser player save / lock / process / publish: **not tested** (no schema, no seated users).

## What you must do next

1. In the dashboard for **langlands-rehearsal** only (`fgqitafevklmuhybuwzw`), SQL Editor, run in order: `0001_schema.sql` … `0011_restore_voided_round.sql` (paths under `supabase/migrations/`).
2. Confirm seed: 20 teams, 6 scheduled rounds, slug `langlands-r3`.
3. Put an organiser on **this** project (`competition_staff.staff_role = organiser`) using an account that already exists here — currently none exist. Do not ask this agent to invent passwords.
4. Say when 0001–0011 have succeeded. Then seated `/play` and `/room` can be tested with **your** existing credentials, typed by you, not pasted into chat.

Hosted competition was not modified. Uncommitted HUD/API/migration work is intact. `.env.local` remains gitignored.
