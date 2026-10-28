# Langlands R3 — Phase 4 rehearsal (stopped at Stage A)

**Date:** 2026-10-27  
**Continues:** Phase 1–3 launch-day audits.  
**Mode:** verify isolated target without writes. No login, provision, organiser, seed, or migration command was run.  
**Verdict:** **NO-GO.** Stage A failed. Stages B and C were not started. The existing hosted competition remains **untouched**.

This file does not overwrite earlier audits.

---

## Target verification (no secrets)

The operator did **not** supply a rehearsal project name, project ref, or confirmation that `.env.local` was switched. Per Phase 3, rehearsal identity must not be inferred from memory or repo files.

Safe identity check (boolean only; URL and keys not printed):

| Check | Result |
| --- | --- |
| `apps/web/.env.local` exists | yes |
| Key names present | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `TEAM_PROVISION_SECRET` | **absent** |
| `SUPABASE_DB_URL` | absent |
| Forbidden `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | absent (good) |
| URL host is `*.supabase.co` | yes |
| URL project ref equals hosted ref in `supabase/SETUP.md` (2026-10-17) | **yes — still the existing competition** |
| `supabase/.temp/project-ref` equals that hosted ref | **yes** |
| CLI ref equals env URL ref | yes |
| Isolated env backup files (`.env.hosted.local`, `.env.isolated.local`, `.env.development.local`) | none |
| Operator-supplied rehearsal identity | **none in this request** |

Next.js and `organiser:local` both use `apps/web/.env.local`. A root `.env.local` exists and is **not** the Supabase app config.

**Conclusion:** the local app still targets the **existing hosted competition**. That is the Phase 3 STOP condition. Stage A cannot pass.

---

## Migrations verified

**Not verified on any cloud project.** Read-only schema checks against a database were skipped because the only configured target is hosted, and this phase must not connect to it.

Repo still contains `0001`–`0011` as files. That is not evidence they were applied to a rehearsal project.

---

## Provisioning / organiser (inspected, not executed)

| Command | Target | This phase |
| --- | --- | --- |
| `POST /api/admin/provision-teams` | whatever `apps/web/.env.local` names | **not run** — would write Auth users on hosted |
| `npm run organiser:local` | hard-coded `apps/web/.env.local` | **not run** — would upsert staff on hosted |
| Login `POST /api/auth/login` | same env | **not run** |
| `supabase db push` / `supabase link` | CLI still linked to hosted | **not run** |
| `npm run seed:sql` | rewrites `0005` in git | **not run** |

Provision endpoint **does** require `TEAM_PROVISION_SECRET` (503 if missing) and then Bearer or organiser session. The secret is not in the current env, so even a mistaken POST would 503 — but this phase did not POST.

Partial-failure recovery exists in `compensateFailedProvision` (rolls back Auth users and login_id writes from that run). Unused here.

Dummy Team IDs `001`–`020` were **not** provisioned.

---

## Player and organiser browser tests

**Not executed** (would require login against the configured project).

Unsigned HUD `/play/fixture` was not re-opened this phase; it does not prove seated save.

---

## Six-round rehearsal

**Not executed** on a cloud project.

PGlite `npm run test:db` (38/38) remains the Phase 2 local result. That is not this Phase 4 isolated cloud rehearsal.

---

## Security and data isolation

No rival-JWT or seated-save probe was run against any Supabase project. Hosted must not be probed with writes. A read-only hosted probe was not requested and was not done.

---

## Failures and reproduction

**Failure:** Stage A — target is the documented hosted competition; rehearsal project identity missing; `TEAM_PROVISION_SECRET` unset.

**Reproduction:** with the current `apps/web/.env.local`, any of `organiser:local`, provision POST, or login POST would use the hosted project. Do not run them.

---

## What the operator must send before Phase 4 can continue

Non-secret information only (do **not** paste keys, passwords, or full URLs with query strings):

1. Rehearsal **project name** as shown in the dashboard.
2. Rehearsal **project ref** (the subdomain id). It must differ from the hosted ref in `supabase/SETUP.md`.
3. Confirmation that `apps/web/.env.local` was **backed up** and rewritten to that project (this agent will not overwrite the file).
4. Confirmation that `0001`–`0011` were applied in **that** project’s SQL editor (not CLI push from this checkout).
5. Confirmation that `TEAM_PROVISION_SECRET` is now set in that isolated `.env.local` (say “set”, not the value).
6. Confirmation that public signup is off on the rehearsal project.

Until those six items are supplied **and** a new Stage A check shows the env ref **does not** match hosted, Stages B and C stay blocked.

---

## Remaining release blockers

1. No isolated cloud project verified.
2. Local env still names hosted.
3. CLI still linked to hosted — do not `db push`.
4. `TEAM_PROVISION_SECRET` unset.
5. 20 dummy teams not provisioned.
6. Seated `/play` and `/room` not tested on a real isolated session.
7. Working tree still uncommitted (unchanged this phase).

---

## GO / NO-GO

| Surface | Verdict |
| --- | --- |
| Isolated PGlite (prior phase) | still GO for process-local tests |
| Isolated **cloud** rehearsal | **NO-GO — Stage A failed** |
| Existing hosted competition | **NO-GO — do not touch** |
| Hall launch | **NO-GO** |

---

## Files changed by this phase

- `docs/audits/LANGLANDS_LAUNCH_DAY_PHASE4_REHEARSAL_2026-10-27.md`

No source, env, CLI link, or data files were modified. Uncommitted HUD / migrations / APIs / tests are intact.
