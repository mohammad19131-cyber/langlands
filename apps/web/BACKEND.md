# Langlands R3 — backend (Next.js App Router)

There is no separate Node service. The backend is **`apps/web`**: Next.js 15 route handlers under `app/api/`, Auth callbacks under `app/auth/`, and server modules under `lib/server/`. Official simulation lives in workspace packages called from those routes:

| Package | Role |
| --- | --- |
| `@langlands/sim` | Pure town engine (`stepRound`, catalogue, `ENGINE_VERSION`) |
| `@langlands/round-machine` | Submit / lock / process / publish orchestration |
| `supabase/migrations` | Schema, RLS, round-machine RPCs (Postgres is the system of record) |

Runtime for all gameplay and round-machine routes: **`nodejs`** (not Edge). Clients never POST scores, remaining budgets, clocks, or simulation outcomes as truth.

Canonical architecture: `docs/technical-architecture.md`. UI contract: `docs/ui-requirements.md`. Permissions: `docs/security-and-permissions.md`.

---

## Environment

Copy repo `.env.example` to `apps/web/.env.local`. Never commit real keys.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon key (RLS on) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Organiser writes, provision, process |
| `TEAM_PROVISION_SECRET` | server only | Bearer for `POST /api/admin/provision-teams` |
| `EVENT_TICK_SECRET` or `CRON_SECRET` | server only | Bearer for `GET`/`POST /api/event/tick` |
| `ALLOW_HOSTED_PROVISION` | server only | Must be `true` to provision against production ref |
| `LANGLANDS_ALLOWED_PROJECT_REF` | server only | Optional hard lock of provision target |

Production competition ref (do not provision accidentally): `npwgkqfljrqhvuiateqk` (`lib/supabase-target.ts`).

---

## Auth model

| Actor | How |
| --- | --- |
| Captain / member | `POST /api/auth/login` with Team ID + password → Supabase Auth session cookie |
| Organiser | Same login with staff email (or session after invite) → `competition_staff.staff_role = organiser` |
| Cron / tick worker | `Authorization: Bearer <EVENT_TICK_SECRET\|CRON_SECRET>` |
| Provision night-before | Bearer `TEAM_PROVISION_SECRET` **or** organiser session (secret must still be configured) |

Session checks: `lib/server/authz.ts` (`requireUser`, `requireOrganiser`, `requireTeamMember`). Service role client: `lib/supabase/admin.ts`. Cookie client: `lib/supabase/server.ts`.

Middleware (`middleware.ts`) gates page routes; APIs enforce auth inside handlers.

---

## API routes

All paths are relative to the web origin. Unless noted, responses are JSON. Error shape is typically `{ ok: false, error, message? }`.

### Auth

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | public | Team ID + password, or organiser email flow. Establishes session. |
| `GET` | `/api/auth/login` | — | **405** (does not authenticate) |
| `POST` | `/api/auth/logout` | session | Clears session |
| `GET` | `/auth/callback` | Auth redirect | Supabase OAuth/code exchange (if used) |
| `POST` | `/auth/sign-out` | session | Form post sign-out |

### Play (team)

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `GET` | `/api/play/context` | seated team | Own town, clock, catalogue, own published history. **No** 20-town board for captains. |
| `GET` | `/api/play/clock` | seated team | Server clock / round window |
| `GET` | `/api/play/board` | **organiser only** | 20-team published TownPublic board |
| `POST` | `/api/rounds/:id/submissions` | team member of that seat | Save / resave plan. Requires `Idempotency-Key`. Does **not** charge credits. |

### Organiser room

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `GET` | `/api/room` | organiser | Control-room snapshot: rounds, seats, credits, members. No submission bodies. |
| `GET` | `/api/rounds/:id/support/:teamId` | organiser | Audited support read (`support_read`) |

### Round machine

`scheduled → open → locked → processing → published`. `void` from unpublished only; `restore` returns unpublished void → `scheduled`.

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `POST` | `/api/rounds/:id/open` | organiser | Open round (18-minute stamp via RPC) |
| `POST` | `/api/rounds/:id/lock` | organiser | Freeze 20-seat lock manifest |
| `POST` | `/api/rounds/:id/process` | organiser | Official `processRound` (engine twice, checksum) |
| `POST` | `/api/rounds/:id/publish` | organiser | Write 20 `town_states` + `published_results` |
| `POST` | `/api/rounds/:id/void` | organiser | Abandon unpublished round |
| `POST` | `/api/rounds/:id/restore` | organiser | Void → scheduled |
| `POST` | `/api/rounds/:id/reopen` | organiser | Locked → open before towns exist |
| `POST` | `/api/rounds/:id/window` | organiser | Extend close time while open (`{ extendMinutes }`) |

### Event automation

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `POST` | `/api/event/start` | organiser | Mark competition `live`; open round 1 if still `scheduled` (idempotent; does not restamp an open window) |
| `POST` | `/api/event/pause` | organiser | Pause / resume automatic progression (`{ resume?: boolean }`) |
| `POST` | `/api/event/tick` | organiser session **or** Bearer tick secret | One durable step: lock → process → publish → open next |
| `GET` | `/api/event/tick` | **Bearer tick/cron secret only** | Same as POST. Cookie GET is **401** and does not mutate. |

`apps/web/vercel.json` schedules `GET /api/event/tick` every minute. Deploying that with a secret against a `live` competition **starts** auto-progress. Do not enable until authorised.

Tick JSON is sanitized (`noop` / `status` / `checksum` / `idempotent`). No lock payload, towns, or allocations.

### Rate limits

Middleware applies **20 requests / minute / client IP / API route** (sliding window) to every `/api/*` path. Exceeding the limit returns **429** with `Retry-After`. Dynamic segments are normalized (`/api/rounds/:id/lock`). This is best-effort per server instance.

### Admin

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `POST` | `/api/admin/provision-teams` | Bearer provision secret or organiser | Assign 20 Team IDs; one-time CSV of passwords |
| `POST` | `/api/admin/reset-play` | organiser | Body `{ confirm: "RESET PLAY" }`. Calls transactional RPC `reset_competition_play` (migration `0015`). Returns **503** if the RPC is missing. Keeps teams/members/credentials; restores reserve **220**. |
| `GET` | `/api/admin/reset-play` | — | **405** |
| `PATCH` | `/api/admin/teams/:teamId` | organiser | Rename team (`{ name }`) via RPC `organiser_update_team`. Does not change login or password. |
| `GET` | `/api/admin/teams/:teamId` | — | **405** |
| `PATCH` | `/api/admin/teams/:teamId/members/:userId` | organiser | `{ displayName, memberRole? }` via RPC `organiser_update_team_member`. |
| `GET` | `/api/admin/teams/:teamId/members/:userId` | — | **405** |

---

## Server modules (`lib/server/`)

| File | Role |
| --- | --- |
| `authz.ts` | Session / organiser / member gates |
| `game-context.ts` | Captain play payload |
| `room-context.ts` | Organiser room payload (incl. credits, members) |
| `run-process.ts` | Official process entry |
| `event-tick.ts` | Scheduler step |
| `provision-teams.ts` | Night-before IDs + bcrypt |
| `organiser-writes.ts` | Service-role RPC wrappers for reset / team / member edit |
| `published-board.ts` | Organiser board rows |
| `load-town.ts` | Pre-round / published town load |
| `json.ts` | Error helpers |
| `team-credentials.ts` | Login ID / Auth email helpers |

Supporting pure helpers (safe to unit-test): `event-tick-plan.ts`, `event-tick-auth.ts`, `event-start.ts`, `admin-ops.ts`, `room-ops.ts`, `decision.ts`, `ranking.ts`.

---

## Postgres RPCs the API relies on

Applied via `supabase/migrations` (service role after Next.js auth check):

- `submit_decision`, `open_round`, `lock_round`, `claim_process`, `save_process_run`, `publish_round`, `void_round`, `restore_voided_round`, `set_round_window`, `reopen_round`, `audit_append`
- `0015`: `reset_competition_play`, `organiser_update_team`, `organiser_update_team_member` (admin routes call these RPCs)
- `0016`: `backup_round_records` runs inside `publish_round`; appends `round_record_backups` (scores + towns + submissions). Survives play reset. No credentials.

RLS: captains never read rival submissions / `town_states` / private locks. `0014` restricts participant `published_results` to own team (must be applied on hosted before relying on PostgREST privacy).

---

## Local commands

From repo root:

```bash
npm run dev                 # Next.js in apps/web
npm run typecheck
npm run lint
npm run test:web            # vitest for apps/web/lib
npm run test:db             # PGlite + migrations + round machine
npm run test:sim            # packages/sim
```

Do **not** run `supabase db push` while `supabase/.temp/project-ref` is production. Apply migrations in the dashboard of the intended project only.

---

## Hard rules (backend)

1. Official scores and budgets come from the server processor / publish transaction.
2. Save does not charge; process does.
3. Publish writes 20 towns + 20 published rows together or rolls back.
4. Failed process does not publish and does not open the next round.
5. GET handlers that touch competition lifecycle must not mutate (except authorised tick GET with Bearer secret).
6. Never return service-role keys, password hashes, or rival private payloads in responses.
