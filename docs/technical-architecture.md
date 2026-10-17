# Technical architecture

Status: canonical. Stack is fixed: Next.js App Router, React, strict TypeScript, Tailwind CSS, Supabase Postgres + Auth, Vercel.

## Shape

```
apps/web                 UI only (Opus). Phase 3 APIs live here; no play UI yet
packages/sim             Pure engine (Grok) — no fetch, no React
packages/round-machine   Server processor (Grok) — submit/lock/process/publish
packages/sim-fixtures    Golden vectors from Python labs
supabase/migrations      Schema, RLS, seeds, round machine (`0001`–`0006`)
supabase/tests           PGlite isolation + round-machine suite (`npm run test:db`)
docs/                    This specification set
```

`packages/sim` exists (engine port, no UI). `apps/web` and `supabase/migrations` exist from Phase 0. Do not present unconfigured Supabase as a live board.

## Engine boundary

`packages/sim` exports:

- `createInitialTown()`
- `stepRound(town, submission, roundIndex) → { town, breakdown, applied }`
- `finalScore(snapshots[])`
- `CATALOGUE`, `PACK_A`, `ENGINE_VERSION`

The Vercel server calls `stepRound` inside `packages/round-machine` (`processRound`). The browser may call it **only** in `UnofficialPreview` (Phase 4). Official `town_states` always come from the processor. Clients never POST scores, remaining budget, clocks, or simulation outcomes as truth.

Python remains the design lab (`score_lab.py` physics, `official_score.py` score + pack A). TypeScript must match golden JSON ±0.01 on `final_score`.

## Request paths

| Path | Runtime | Auth |
| --- | --- | --- |
| `POST /api/rounds/:id/submissions` | Node | team session + `Idempotency-Key` |
| `POST /api/rounds/:id/open` | Node | organiser |
| `POST /api/rounds/:id/lock` | Node | organiser |
| `POST /api/rounds/:id/process` | Node | organiser |
| `POST /api/rounds/:id/publish` | Node | organiser; recomputes from `lock_manifest` |
| `POST /api/rounds/:id/void` | Node | organiser; unpublished only |
| `GET /api/rounds/:id/support/:teamId` | Node | organiser; audited read |

No Edge runtime for the processor (need deterministic `Decimal`/number behaviour and advisory locks via Supabase).

## Round state machine

`scheduled → open → locked → processing → published`

`void` is allowed from `open` / `locked` / `processing`, never from `published`. Ops recover a failed process by retrying `claim_process` (no successful run) or by `save_process_run(..., ok=false)` which reverts to `locked`. There is no score-edit transition.

`paused` is a competition-level flag that prevents `scheduled → open`. Round *n* cannot open until *n−1* is `published`.

## Determinism

- Same `engine_version` + catalogue hash + template + submissions → same 20 states.
- Seat order 1–20 for logging only; validity uses pre-round state so order does not change who can start a project.
- No floating clocks inside `stepRound`. Round index and event code are inputs.

## Realtime

Recommendation: **no** Supabase realtime for gameplay. Clients poll round status every 5s while `open` or `processing`. Hall screen polls published states. This is easier to reason about with 80 laptops.

## Hosting

- Vercel production pinned to a git SHA (`ENGINE_VERSION` includes that SHA).
- Supabase PITR on before rehearsal.
- Preview deploys must refuse `NEXT_PUBLIC_DEMO` banners that look like the live board.

## What Opus may add

Visual components, routing shells, Tailwind tokens, isometric SVG tiles **bound to server fields**.

## What Opus may not add

New API routes that write town state, alternative score helpers used as official, extra tables, client-side deadline that bypasses RLS.
