# Schema migrations

Forward-only. Do not edit applied files in place.

| File | Role |
| --- | --- |
| `0001_schema.sql` | Verbatim copy of `docs/schema.sql` |
| `0002_official_score_deltas.sql` | Pack A codes, max two starts, checksum, score keys, DEFINER helpers, GRANTs |
| `0003_profile_on_signup.sql` | `auth.users` → `profiles` trigger, role always `member` |
| `0004_phase2_hardening.sql` | Six-round freeze, `published_results`, tighter RLS/GRANTs, FORCE RLS, submission sanitise |
| `0005_seed_event.sql` | Idempotent `seed_langlands_r3()` + first run |
| `0006_round_machine.sql` | Lock manifest, process claim, submit/open/lock/process/publish/void/audit RPCs |
| `0007_team_credentials.sql` | `teams.login_id` + `teams.password_hash` (bcrypt); hash column revoked from anon/authenticated |
| `0008_reject_disqualified_submit.sql` | `submit_decision` rejects `teams.disqualified` |

Apply in that order. Regenerate 0005 only via `npm run seed:sql` so catalogue rows stay aligned with `packages/sim`. Do not edit 0001–0006 in place.

## Phase 2 decisions (were documented conflicts; now explicit)

| Topic | Decision |
| --- | --- |
| Round count | CHECK `round_count = 6` and `round_index BETWEEN 1 AND 6`. Live freeze, not a silent 0001 rewrite. |
| Public vs private town | New `published_results` (TownPublic columns). `town_states` is own team + organiser only. |
| `created_by` | Nullable so the seed does not invent an `auth.users` row. |
| Judges | Published pillars only. No live submissions or unpublished `town_states`. |
| Organiser admin | Next.js session check, then `service_role` RPCs (`0006`). No authenticated UPDATE on rounds, scores, or competitions. No score override RPC. |

## Seed (0005)

- Slug `langlands-r3`, engine `py-ref-1.1.0`, rules `A-CAT-1.1`, pack A.
- 20 seats named `Seat 01`…`Seat 20`. No captains until real accounts are invited.
- 15 catalogue codes from the frozen engine. `catalogue_hash` is SHA-256 of canonical JSON (`supabase/scripts/canonicalCatalogue.ts`).
- Town template = `createInitialTown()`; checksum = T0 hash `e0cfd3ee…`. Reserve 220.
- Six rounds, 2099-06-01 09:00 UTC, 18-minute windows, 20-minute spacing, status `scheduled`.
- No users, no scores, no `town_states`, no `published_results`.

Rerun: `select public.seed_langlands_r3();` does not duplicate seats/rounds/projects. Does not reset a live competition’s status.

## Not claimed on hosted Supabase until applied there

## Phase 3 (`0006`)

- `rounds.lock_manifest` is the immutable 20-team input captured at lock. Missing accepted rows are holds (`submissionId` null).
- `claim_process` uses `pg_advisory_xact_lock` + row lock. A crash after claim leaves `processing` with no successful run; the next claim retakes the token. A failed `save_process_run` deletes any partial rows and reverts to `locked`.
- Publish is one transaction: 20 `town_states` + 20 `published_results` or rollback. Checksum mismatch refuses publish.
- `submit_decision` uses `auth.uid()`, server `now()` vs `closes_at`, and idempotency. `client_claimed_at` is stored and ignored.
- Organiser RPCs: `EXECUTE` revoked from `authenticated` / `anon`.

Isolation and round-machine tests (`npm run test:db`) use PGlite with a stub `auth` schema. They are **locally verified**. Hosted verification is a dashboard step in `SETUP.md`.
