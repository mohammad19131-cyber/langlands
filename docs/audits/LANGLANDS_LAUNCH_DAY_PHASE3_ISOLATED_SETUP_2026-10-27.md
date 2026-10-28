# Langlands R3 — Phase 3 isolated Supabase setup (operator runbook)

**Date:** 2026-10-27  
**Continues:** Phase 1 and Phase 2 launch-day audits.  
**Mode:** document and validate the isolated procedure only. No project was created. No migration, seed, provision, login, or organiser command was executed.  
**Verdict:** Isolated **PGlite** tests remain the only green 20×6 path. A **new** Supabase project is required for the first real-session rehearsal. The **existing hosted competition is NO-GO**.

This file does not overwrite earlier audits.

---

## STOP conditions (read first)

Do **not** proceed with SQL, CLI, provision, or login if any of these is true:

1. The target project ref equals the existing competition recorded under **Hosted verification (2026-10-17)** in `supabase/SETUP.md`.
2. This checkout’s CLI link (`supabase/.temp/project-ref`) still matches that hosted project. **It does, today.** `supabase db push` from this repo would hit the live event.
3. `apps/web/.env.local` still names the hosted URL (operator compares; this session does not print values).
4. You cannot state the **new** project name, ref, and URL from the dashboard.
5. Anyone asks to “just apply 0009–0011 on the current project.”

**This session will not overwrite `apps/web/.env.local`, unlink the CLI, or run write commands.**

---

## 1. What this phase inspected (no writes)

Supported apply path is **forward-only SQL** in `supabase/migrations/`, files `0001` through `0011`, in filename order. Two supported apply methods:

| Method | Use on a **new empty** project | Use on the existing hosted competition |
| --- | --- | --- |
| Dashboard SQL editor: paste each file, in order | yes | **forbidden** |
| `supabase db push` after `supabase link --project-ref <NEW>` | yes, only after the link is verified | **forbidden** — CLI is currently linked to hosted |

`0005_seed_event.sql` defines `seed_langlands_r3()` and **calls it once** at the end of the file. That seeds slug `langlands-r3`, 20 seats, 6 scheduled rounds (2099 placeholder clocks), 15 catalogue rows. It does **not** create Auth users or scores.

Do **not** run `npm run seed:sql`. That regenerates `0005` in the git tree; it does not talk to a database, but it is out of scope here.

`npm run test:db` uses PGlite only. It does not use `.env.local` or supabase.com. It is the automated 20-team × 6-round rehearsal.

---

## 2. Prerequisites the operator must perform manually

Create a **separate** test project. This agent does not have verified access to create one and must not use existing credentials.

1. In the Supabase dashboard, **New project**. Name it so it cannot be confused with the live event (for example `langlands-r3-rehearsal`).
2. Copy the new **project ref** from Project Settings. It must differ from the hosted ref in `supabase/SETUP.md`.
3. Authentication → Providers: **Email** + password **on**. **Disable** “Allow new users to sign up”. Disable Google.
4. Authentication → URL Configuration: Site URL `http://localhost:3000`. Redirect URLs include `http://localhost:3000/auth/callback`.
5. Confirm the project is empty of Langlands tables before migrating (no `public.rounds` yet).

**Positive verification (operator, out loud / on paper):**

- Dashboard name = rehearsal, not the live event.
- New ref ≠ hosted ref in `SETUP.md`.
- New Project URL host ≠ the host currently in `apps/web/.env.local`.

If any check fails, stop.

---

## 3. Environment variable names

Next.js loads env from **`apps/web/`** (the `dev` / `build` workspace). Names only — never paste values into chat, commits, or this file.

| Name | Where it lives | Browser? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | yes (project URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | yes (publishable / anon). Safe only because RLS is on. |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/web/.env.local` **server only** | **never** |
| `TEAM_PROVISION_SECRET` | `apps/web/.env.local` **server only** | **never** |
| `SUPABASE_DB_URL` | optional, server only, session mode port 5432 | **never** |

**Forbidden:** `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. `createServiceRoleClient` throws if that name is set.

**Do not** put isolated keys only in `.env.development.local`. `npm run organiser:local` reads **`apps/web/.env.local` only** (repo-root cwd). A development override would send `next dev` to the test project and `organiser:local` to hosted.

**Operator env switch (manual, not this agent):**

1. Copy `apps/web/.env.local` → `apps/web/.env.hosted.local` (gitignored via `.env*.local`).
2. Copy `.env.example` → a **new** `apps/web/.env.local`.
3. Fill the four names from the **new** project’s API settings plus a new provision secret.
4. After rehearsal, restore the hosted file yourself if needed.

Current local key names (values not read this phase): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. `TEAM_PROVISION_SECRET` is still absent.

---

## 4. `TEAM_PROVISION_SECRET` (isolated project)

`POST /api/admin/provision-teams` returns **503** unless this name is set and non-empty. Bearer `Authorization: Bearer <secret>` **or** a signed-in organiser session is required; the secret must still exist (fail closed).

Operator generates a high-entropy value **on their machine**, stores it only in the isolated `apps/web/.env.local`, never in git.

Example generators (run locally; **do not paste the output here**):

```bash
openssl rand -hex 32
# or
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

This session did not generate a secret.

---

## 5. Apply migrations 0001–0011 (operator, new project only)

After the STOP checks pass.

### Preferred while CLI is linked to hosted: SQL editor

In the **new** project SQL editor, run each file **in this order**, one at a time, wait for success:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_official_score_deltas.sql
supabase/migrations/0003_profile_on_signup.sql
supabase/migrations/0004_phase2_hardening.sql
supabase/migrations/0005_seed_event.sql
supabase/migrations/0006_round_machine.sql
supabase/migrations/0007_team_credentials.sql
supabase/migrations/0008_reject_disqualified_submit.sql
supabase/migrations/0009_lock_manifest_privilege.sql
supabase/migrations/0010_round_windows.sql
supabase/migrations/0011_restore_voided_round.sql
```

Read-only confirm on the **new** project:

```sql
select slug, status, engine_version, team_count, round_count
  from public.competitions where slug = 'langlands-r3';
select count(*) as seats from public.teams;
select round_index, status, event_code from public.rounds order by round_index;
```

Expect: `ready`, 20 seats, six `scheduled` rounds, Pack A codes on rounds 2–5. Opens/closes still 2099 until **Open** in the control room (migration 0010).

Optional re-seed on a still-empty test DB: `select public.seed_langlands_r3();` — does not reset live round status.

### CLI only after re-link

```bash
# STOP unless <NEW_REF> is confirmed different from SETUP.md hosted ref
# and different from the current supabase/.temp/project-ref
npx supabase login
npx supabase link --project-ref <NEW_REF>
# re-read supabase/.temp/project-ref; it must equal <NEW_REF>
npx supabase db push
```

Do not run those commands in this phase.

---

## 6. Commands that exist — inspect, do not run yet

### Automated 20×6 (safe anytime; no hosted I/O)

```bash
npm run test:db
```

PGlite + stub `auth.uid()`. Phase 2 result: **38/38**. This is **not** 20 browsers and **not** the isolated cloud project.

### Provision 20 dummy teams (unsafe until env + migrations are the new project)

Implementation: `apps/web/app/api/admin/provision-teams/route.ts` → `provisionQualifiedTeams`. Requires service role, secret, seeded 20 seats, **exactly 20 unique digit Team IDs**. Creates GoTrue users, bcrypt hashes, maps list order to seats 1–20. Returns plaintext passwords **once**. Writes Auth users on **whatever project `.env.local` points at**.

```bash
# Only after isolated .env.local + 0001–0011 + `npm run dev`
# ORIGIN is the local app, e.g. http://localhost:3000
# Do not print TEAM_PROVISION_SECRET or the JSON file in chat.
curl -sS -X POST "$ORIGIN/api/admin/provision-teams" \
  -H "Authorization: Bearer $TEAM_PROVISION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"teamIds":["001","002","003","004","005","006","007","008","009","010","011","012","013","014","015","016","017","018","019","020"]}' \
  -o /tmp/langlands-rehearsal-credentials.json
chmod 600 /tmp/langlands-rehearsal-credentials.json
```

Store offline. Do not commit. Delete after the rehearsal if dummy-only.

### Local organiser (unsafe until `.env.local` is the new project)

```bash
npm run organiser:local
```

Creates/rotates Auth user `organiser-local@langlands.dev`, sets `profiles.role` and `competition_staff.staff_role = organiser`, writes gitignored `.organiser-local.json`. Prints the email and file path, not the password. **Uses `apps/web/.env.local` via the service role.** Running it now would mutate hosted Auth.

---

## 7. Auth flows vs production data

| Flow | How it works | Touches hosted if `.env.local` is hosted? |
| --- | --- | --- |
| Team ID + password | `POST /api/auth/login` bcrypt then GoTrue session | **yes** — do not POST |
| Staff email + password | same route; email that is not a Team ID | **yes** if that user exists on hosted |
| `organiser:local` | Admin Auth create/update + staff upsert | **yes** |
| Provision 20 teams | Admin Auth createUser × 20 | **yes** |
| `/play/fixture` | in-memory preview; Save is Preview | **no** |
| `npm run test:db` | PGlite | **no** |
| Unsigned `/sign-in` GET | form only | **no write** |

Player and organiser **real sessions cannot be tested without a database**. They can be tested **without production** only after env, migrations, provision, and organiser creation all target the **new** project.

---

## 8. Browser test plan

Start `npm run dev` only after env points at the isolated project (or use fixture-only with the current env — fixture does not write).

| Route | Auth? | What to check |
| --- | --- | --- |
| `/` | redirects to `/sign-in` | public |
| `/sign-in` | public | Team ID or staff email field. If configured, form; if not, “backend not configured”. **Do not submit** while env is hosted. |
| `/rules` | public | Field Guide; no session |
| `/play/fixture` | **no** | Dev-only HUD. `notFound()` in production builds. Clock ticks. Save stays Preview. Does not persist. |
| `/play`, `/play/decide`, `/play/history`, `/play/results` | **yes** if backend configured | unsigned → `/sign-in`. After dummy Team ID login on the **isolated** project: map, desk, **Save** accepted. |
| `/board` | **yes** if configured | unsigned → `/sign-in`. Standings overlay. |
| `/room` | **yes** + organiser | unsigned → `/sign-in`. Signed-in team → “Not available.” Organiser: Open (confirm ~18 min, not 2099), Add 5 minutes, Lock, Process, Publish, Reopen, Restore, Void. |
| `/room/team/[seat]` | **yes** + organiser | support view; audited |

Unsigned `/play` with **current hosted-configured env** only tests the redirect. It must not be followed by a login POST.

---

## 9. Operator sequence (manual from here)

1. Create the new Supabase project; pass the STOP checks.
2. Back up `apps/web/.env.local`; write a new file with isolated keys + `TEAM_PROVISION_SECRET`.
3. Apply `0001`–`0011` in the **new** SQL editor (avoid `db push` until CLI is re-linked).
4. Run read-only seed counts on the new project.
5. `npm run dev` → confirm `/sign-in` shows the form.
6. Provision 20 dummy IDs; keep the JSON off-repo.
7. `npm run organiser:local`; open `.organiser-local.json` locally, never paste it.
8. Browser: fixture (HUD) → team `/play` Save → organiser `/room` compressed 6-round pass.
9. Leave the hosted competition untouched.

**Hosted competition: not ready. Do not claim it is.**  
**Isolated cloud rehearsal: not started. Waiting on the operator steps above.**

---

## 10. Files changed by this phase

Only this runbook:

- `docs/audits/LANGLANDS_LAUNCH_DAY_PHASE3_ISOLATED_SETUP_2026-10-27.md`

No source, env, migration, or CLI link files were modified. No secrets or personal account information are included.
