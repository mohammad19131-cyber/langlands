# Langlands R3 — Launch-day Phase 2

**Date:** 2026-10-27  
**Continues:** `docs/audits/LANGLANDS_LAUNCH_DAY_PHASE1_2026-10-27.md`  
**Mode:** security review, safe local fixes, isolated-rehearsal instructions. No commit, push, deploy, or hosted writes.  
**Verdict:** Isolated **PGlite** rehearsal remains **GO**. A **clean separate** Supabase project can be prepared by an operator. The **existing hosted competition is NO-GO** and was not touched.

This file does not overwrite Phase 1 or earlier audits.

---

## 1. Working-tree diff (confirmed)

`main` at `d510830`, tracking `origin/main`, nothing staged. The launch path is still entirely uncommitted. Nothing was stashed or reset.

| Present in this tree | Confirmed |
| --- | --- |
| `supabase/migrations/0009_lock_manifest_privilege.sql` | yes (plus Phase 2 backfill + `auth.uid()` bind) |
| `supabase/migrations/0010_round_windows.sql` | yes (plus Phase 2 `auth.uid()` bind) |
| `supabase/migrations/0011_restore_voided_round.sql` | **new this phase** |
| `supabase/tests/rehearsal.test.ts` | yes |
| Isolation + round-machine tests covering 0009–0011 | yes |
| Phase 2 HUD / Ashfen map / fixture | preserved |
| Window + reopen APIs | preserved |

Local env **key names only:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. `TEAM_PROVISION_SECRET` is still absent. Values were not read.

---

## 2. Security review — lock captures

**Intended model after 0009**

- Full allocations / starts / `teamId` live in `round_lock_private` (RLS on, no policies, `REVOKE ALL` from `anon`/`authenticated`, `GRANT ALL` to `service_role`).
- `rounds.lock_manifest` is a 20-seat public summary (`seat`, `teamName`, `disqualified`, `submissionId` only).
- Organiser RPCs are `security definer` + `EXECUTE` revoked from browser roles. Next.js uses the service role after an organiser session check.

**Findings and fixes this phase**

| Issue | Severity | Action |
| --- | --- | --- |
| HTTP `POST /api/rounds/:id/publish` still recomputed from the **public** `rounds.lock_manifest` (no `teamId` / allocations). Control-room publish would checksum-fail or treat every seat as a hold. PGlite tests used `publishWithRecompute` (private table) so this was hidden. | P0 | **Fixed.** Publish reads `round_lock_private.payload` via `asPrivateLockEntries`. |
| Organiser lock HTTP returned the full RPC blob, including allocations, to the organiser browser. | P1 | **Fixed.** Response is the public seat summary only. Process still receives the private payload from `claim_process`. |
| Pre-0009 DBs could still have full JSON in `rounds.lock_manifest`. Column `REVOKE` is the hosted backstop; PGlite does not reliably enforce it. | P0 if 0009 is applied onto old lock rows | **Fixed in migration.** 0009 copies full JSON into `round_lock_private` then strips the public column. Still **do not apply this to the live hosted event from an agent.** |
| `lock_round` / `claim_process` trust `_actor`. If function `EXECUTE` leaked to `authenticated`, a player JWT could pass an organiser UUID and receive the private payload. | P0 if GRANT fails | **Hardened.** When `auth.uid()` is present it must equal `_actor`. Service-role calls keep `auth.uid()` null. Same bind added on window / reopen / void / restore. |

**PGlite evidence (this run):** participant `select payload from round_lock_private` throws; public `lock_manifest` and `select * from rounds` contain no allocations / `teamId`; spoof `lock_round(..., organiser)` from a player JWT throws; service role still sees the private payload.

**Not verified on hosted Postgres:** column `REVOKE`, function `EXECUTE`, or a rival JWT probe. Do not claim hosted RLS from this session.

---

## 3. Migration compatibility (not applied anywhere hosted)

Forward-only. No down migrations.

| File | Safe on a **new empty** project? | Safe on the **existing hosted competition**? |
| --- | --- | --- |
| 0001–0008 | yes, in order | unknown (last dashboard note in `SETUP.md` was 0001–0006 on 2026-10-17) |
| 0009 | yes; backfill is a no-op if `lock_manifest` is null | **Do not apply from this agent.** Would rewrite lock JSON and add a table mid-event. |
| 0010 | yes; `open_round` restamps 18 minutes | **Do not apply from this agent.** Changes live window behaviour. |
| 0011 | yes | **Do not apply from this agent.** |

**Rollback:** delete the unused test project. Do not attempt in-place rollback SQL on a competition that already has published `town_states`.

**Constraints preserved:** 20 teams, 6 rounds, 18-minute window, Pack A events, `predecessor_published` still requires `published` (not `void`).

---

## 4. Void recovery (implemented, rules-preserving)

**Rejected (would change scoring or skip Pack A)**

- Treating `void` as published so n+1 can open.
- Voiding a **published** round (SQL already refuses; that path would delete `town_states`).

**Implemented:** unpublished `void` → `scheduled` (`restore_voided_round` + `POST /api/rounds/:id/restore` + Control room **Restore**).

- Same `round_index` and Pack A event.
- Refused if later rounds are open/locked/processing/published, or if `town_states` / `published_results` remain.
- Void now also deletes `round_lock_private` and clears lock/process columns.
- n+1 still cannot open until n is **published**.

Runbook / plan docs that previously said “void after publish, restore previous states” were **wrong relative to the SQL**. They now match: do not void published rows; restore unpublished voids only.

**Operator action if someone already voided on hosted (unknown today):** do not run restore SQL against hosted from an agent. On a **clean** test DB, use Control room Restore, then Open.

---

## 5. Commands run this phase (actual results)

| Command | Result |
| --- | --- |
| `npm run typecheck` | **pass** |
| `npm run lint` | **pass** |
| `npm run test:sim` | **54/54** |
| `npm run test:web` | **50/50** (was 48; + private-lock tests) |
| `npm run test:db` | **38/38** (isolation 15, round-machine 15 including restore, rehearsal 4, credentials 4) |
| `npm run build` | **pass**; routes include `/api/rounds/[id]/restore` |
| `organiser:local` / `seed:sql` / login / hosted RPCs | **not run** (would use current `.env.local`) |
| Browser seated `/play` or `/room` | **not run** |

Scoring weights, catalogue, and Pack A were not changed. Engine tests still 54/54.

---

## 6. Isolated rehearsal instructions

**STOP.** `apps/web/.env.local` currently has hosted Supabase key **names**. Do not run `organiser:local`, provision, login, or round POSTs until that file (and Vercel, if used) points at a **new** project. This session will not swap env or create accounts.

### A. Create a separate test database (operator)

1. New project at https://supabase.com/dashboard — **not** the existing competition project.
2. Auth: Email + password on; public signup **off**; Google **off**.
3. Copy `.env.example` to a **new** `apps/web/.env.local` for that project only:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`)
   - `TEAM_PROVISION_SECRET` (generate locally; do not commit or paste into chat)
4. Apply **in order** (`supabase db push` after `supabase link --project-ref <new-ref>`, or SQL editor):

```
0001_schema.sql
0002_official_score_deltas.sql
0003_profile_on_signup.sql
0004_phase2_hardening.sql
0005_seed_event.sql
0006_round_machine.sql
0007_team_credentials.sql
0008_reject_disqualified_submit.sql
0009_lock_manifest_privilege.sql
0010_round_windows.sql
0011_restore_voided_round.sql
```

5. Confirm seed: slug `langlands-r3`, 20 seats, 6 scheduled rounds. Safe re-seed: `select public.seed_langlands_r3();` (does not reset a live status).

### B. Provision 20 dummy teams (operator, isolated project only)

Requires `TEAM_PROVISION_SECRET` on the server. Returns plaintext passwords **once**. Store the CSV offline; never commit it; never log it.

```bash
# After env points at the NEW project and `npm run dev` is up:
curl -sS -X POST "$ORIGIN/api/admin/provision-teams" \
  -H "Authorization: Bearer $TEAM_PROVISION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"teamIds":["001","002","003","004","005","006","007","008","009","010","011","012","013","014","015","016","017","018","019","020"]}' \
  -o /tmp/langlands-rehearsal-credentials.json
```

Then create one organiser (isolated project only): `npm run organiser:local`. Credentials write to gitignored `.organiser-local.json`. Do not print that file.

### C. Automated 20×6 (already green on PGlite)

```bash
npm run test:db
```

This is process-local Postgres, **not** 20 browsers and **not** hosted.

### D. Compressed operator rehearsal on the isolated project

1. Sign in as organiser → `/room`.
2. Open round 1 — confirm close is ~18 minutes from now, not 2099.
3. Sign in as a dummy team → `/play` — change sectors, **Save** (not Preview), confirm accepted.
4. Rival team: confirm they cannot see that save; after lock they must not see allocations.
5. Organiser: Add 5 minutes, Lock, Process, Publish. Repeat through round 6 (holds are valid).
6. Optional: Lock then **Reopen** before process; Void then **Restore** on an unpublished round; confirm n+1 still refuses until n is published.

---

## 7. How to test seated save and the organiser room in a browser

| Surface | How | Safe against current `.env.local`? |
| --- | --- | --- |
| Map HUD, desk, ticking clock | `npm run dev` → `/play/fixture` (unsigned; production `notFound()`) | **yes** — fixture does not write hosted data |
| Unsigned gates | `/play`, `/board`, `/room` should redirect to `/sign-in` | read-only; do not submit login |
| Seated save | Isolated project + provisioned Team ID → `/play` → Save | **no** until env is the new project |
| Organiser room | Isolated organiser session → `/room` Open / Extend / Lock / Process / Publish / Reopen / Restore / Void | **no** until env is the new project |

Do not POST `/api/auth/login` or `/api/admin/provision-teams` while `.env.local` still names the hosted project.

---

## 8. Unresolved release blockers

| ID | Sev | Status |
| --- | --- | --- |
| Uncommitted working tree | P0 | Origin is still `d510830`. Operator must commit when ready. |
| Existing hosted DB ≠ this tree | P0 | Unknown 0007–0011 / round statuses / login count. **Do not migrate hosted from an agent.** |
| `TEAM_PROVISION_SECRET` missing locally | P0 | Provision 503s until the operator sets it on the isolated host. |
| Seated `/play` save and `/room` clicks | P1 | Not browser-tested this phase. |
| Pause/resume HTTP | P2 | Still missing; open is blocked if the competition is paused. |
| Dual sector glossary on `/rules` | P2 | Desk uses Habitat / Farming / Resilience. |
| Ranking omits mean event damage | P1 policy | Unchanged. |
| Hosted rival JWT probe | P1 | PGlite only. |

---

## 9. Go / no-go checklist

- [x] Isolated PGlite 20×6 (`test:db` 38/38 this run)
- [x] Engine / web unit tests / typecheck / lint / production build
- [x] Private lock table + publish reads it + lock HTTP stripped
- [x] Unpublished void can return to scheduled without skipping Pack A
- [ ] Operator commit of this tree
- [ ] **New** Supabase project with `0001`–`0011` (not the live event)
- [ ] `TEAM_PROVISION_SECRET` set only on that host
- [ ] 20 dummy Team IDs provisioned; CSV stored offline
- [ ] Browser seated save + organiser room on that project
- [ ] Hosted competition left untouched until a human chooses otherwise

**Today’s hall event on the existing hosted project: NO-GO.**  
**Isolated rehearsal: GO on PGlite; GO on a new project after the operator steps above.**

---

## 10. Files changed by this Phase 2

**New**

- `supabase/migrations/0011_restore_voided_round.sql`
- `apps/web/app/api/rounds/[id]/restore/route.ts`
- `apps/web/lib/private-lock.ts`
- `apps/web/lib/private-lock.test.ts`
- `docs/audits/LANGLANDS_LAUNCH_DAY_PHASE2_2026-10-27.md`

**Edited for this phase**

- `supabase/migrations/0009_lock_manifest_privilege.sql`, `0010_round_windows.sql`
- `supabase/tests/{harness,isolation,round-machine}.ts`
- `packages/round-machine/src/{index,machine}.ts`
- `apps/web/app/api/rounds/[id]/{publish,lock}/route.ts`
- `apps/web/lib/room-ops.ts`, `apps/web/lib/room-ops.test.ts`
- `apps/web/components/room/ControlRoom.tsx`
- `docs/{database-schema,security-and-permissions,technical-architecture,deployment-and-event-runbook,team-provisioning,LANGLANDS-R3-PLAN}.md`
- `supabase/MIGRATIONS.md`, `supabase/SETUP.md`

**Preserved, not rewritten:** Phase 2 HUD, fixture, copy edits, window/reopen APIs, rehearsal tests, scoring/engine.

No secrets, account emails, or project refs beyond the pre-existing `SETUP.md` historical note were added to this report.
