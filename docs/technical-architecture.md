# Technical architecture

Status: canonical. Stack is fixed: Next.js App Router, React, strict TypeScript, Tailwind CSS, Supabase Postgres + Auth, Vercel.

## Shape

```
apps/web                 Next.js play UI, organiser room, and Node APIs
packages/sim             Pure engine (Grok) — no fetch, no React
packages/round-machine   Server processor (Grok) — submit/lock/process/publish
docs/simulation/goldens  Frozen Python/TS parity JSON (`py_ref_1_1_0.json`)
supabase/migrations      Schema, RLS, seeds, round machine (`0001`–`0014`)
supabase/tests           PGlite isolation + round-machine suite (`npm run test:db`)
docs/                    This specification set
```

There is no `packages/sim-fixtures` package. Do not present unconfigured Supabase as a live board.

## Engine boundary

`packages/sim` exports:

- `createInitialTown()`
- `stepRound(town, submission, roundIndex) → { town, breakdown, applied }`
- `finalScore(snapshots[])`
- `CATALOGUE`, `PACK_A`, `ENGINE_VERSION`

The Vercel server calls `stepRound` inside `packages/round-machine` (`processRound`). Official `town_states` always come from the processor. Clients never POST scores, remaining budget, clocks, or simulation outcomes as truth. `/play/fixture` is a non-production HUD fixture (`notFound()` in production). Save dry-runs run on the server.

Python remains the design lab (`score_lab.py` physics, `official_score.py` score + pack A). TypeScript must match golden JSON ±0.01 on `final_score`.

## Request paths

| Path | Runtime | Auth |
| --- | --- | --- |
| `POST /api/auth/login` | Node | Team ID + password, or organiser email |
| `POST /api/rounds/:id/submissions` | Node | team session + `Idempotency-Key` |
| `GET /api/play/context` | Node | session; captains get own town, not the 20-town board |
| `GET /api/play/clock` | Node | seated team session |
| `GET /api/play/board` | Node | organiser only |
| `POST /api/rounds/:id/open` | Node | organiser |
| `POST /api/rounds/:id/lock` | Node | organiser |
| `POST /api/rounds/:id/process` | Node | organiser |
| `POST /api/rounds/:id/publish` | Node | organiser; recomputes from `round_lock_private` |
| `POST /api/rounds/:id/void` | Node | organiser; unpublished only |
| `POST /api/rounds/:id/restore` | Node | organiser; unpublished `void` → `scheduled` |
| `POST /api/rounds/:id/window` | Node | organiser; while `open` |
| `POST /api/rounds/:id/reopen` | Node | organiser; unpublished `locked` |
| `GET /api/rounds/:id/support/:teamId` | Node | organiser; audited read |
| `POST /api/event/start` | Node | organiser; slug `langlands-r3` |
| `POST /api/event/pause` | Node | organiser |
| `POST /api/event/tick` | Node | organiser session, or Bearer tick/cron secret |
| `GET /api/event/tick` | Node | Bearer tick/cron secret only (not a cookie session) |
| `POST /api/admin/provision-teams` | Node | `TEAM_PROVISION_SECRET` or organiser session |
| All `/api/*` | Middleware | 20 req/min/client/route; 429 when exceeded |
| `publish_round` + `0016` | Postgres | Appends `round_record_backups` (scores + records) after publish |
| `POST /api/admin/reset-play` | Node | organiser; body `{ confirm: "RESET PLAY" }`; RPC `reset_competition_play`; GET is 405 |
| `PATCH /api/admin/teams/:teamId` | Node | organiser; rename team |
| `PATCH /api/admin/teams/:teamId/members/:userId` | Node | organiser; member display name / role |

No Edge runtime for the processor (need deterministic `Decimal`/number behaviour and advisory locks via Supabase).

## Round state machine

`scheduled → open → locked → processing → published`

`void` is allowed from `open` / `locked` / `processing`, never from `published`. An unpublished void may be restored to `scheduled` (`restore_voided_round`) so the same round index and Pack A event can be opened again. Restore is refused if later rounds have already started or if `town_states` / `published_results` exist. Void does not count as published and does not skip a year. Ops recover a failed process by retrying `claim_process` (no successful run) or by `save_process_run(..., ok=false)` which reverts to `locked`. There is no score-edit transition.

`paused` is a competition-level flag that prevents `scheduled → open`. Round *n* cannot open until *n−1* is `published`.

## Determinism

- Same `engine_version` + catalogue hash + template + submissions → same 20 states.
- Seat order 1–20 for logging only; validity uses pre-round state so order does not change who can start a project.
- No floating clocks inside `stepRound`. Round index and event code are inputs.

## Realtime

Recommendation: **no** Supabase realtime for gameplay. Clients poll round status every 5s while `open` or `processing`. Organisers poll `/api/play/board` after publish. Captains poll `/api/play/context` for their own town. This is easier to reason about with 80 laptops.

## Hosting

- Vercel production should be pinned to a git SHA. `ENGINE_VERSION` is the frozen engine string `py-ref-1.1.0`, not the git SHA.
- Supabase PITR on before rehearsal.
- Preview deploys must refuse `NEXT_PUBLIC_DEMO` banners that look like the live board.

## What Opus may add

Visual components, routing shells, Tailwind tokens, isometric SVG tiles **bound to server fields**.

## What Opus may not add

New API routes that write town state, alternative score helpers used as official, extra tables, client-side deadline that bypasses RLS.
