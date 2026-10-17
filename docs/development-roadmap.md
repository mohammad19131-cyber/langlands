# Development roadmap

Status: canonical sequence. Planning, frozen engine (`py-ref-1.1.0`), website skeleton, secure seed, and **Phase 3 round machine** are done. Phase 4 play UI is next.

## Frozen recommendations (do not re-ask)

| Topic | Decision |
| --- | --- |
| Teams / rounds | 20 teams, 6 rounds |
| Decision window | 18 minutes |
| Events public? | Yes, full pack A formulas |
| Team join | Organiser-seeded captains, 2–5 members |
| Auth | Qualified Team ID + password (bcrypt on `teams`). No Google, no magic-link, no participant email UI. |
| Catalogue | 15 interventions, max 2 starts per round |
| Map | SVG isometric, not WebGL |
| Score override | Never |
| Realtime | Poll 5s, no gameplay realtime channel |
| Cancel projects | No |

## Phases

### Phase 0 — skeleton (Grok)

Next.js App Router workspace at `apps/web`, strict TypeScript, Tailwind, official `@supabase/ssr` clients, empty authenticated shell, no fake board.

Verified 2026-10-17:

- Root npm workspaces: `apps/web` + `packages/sim` (+ `packages/round-machine` from Phase 3). Browser imports `@langlands/sim/public` (catalogue/constants only). Physics stay off the client.
- `/`, `/rules`, `/sign-in`, `/play` shell. `/rules` renders six rounds, 15 interventions, submission rules, scoring pillars, and format from the specs + frozen catalogue. No invented rules.
- Missing `NEXT_PUBLIC_SUPABASE_*` shows a not-configured state. Sign-in does not fabricate a session.
- Migrations prepared at `supabase/migrations` from `docs/schema.sql` plus documented deltas. **Not applied** until a dashboard project exists. See `supabase/SETUP.md`.
- Commands actually run (repo root, 2026-10-17):
  - `npm install` — workspaces linked
  - `npm run lint` — pass (`next lint` deprecation notice only)
  - `npm run typecheck` — pass (`packages/sim`, `packages/round-machine`, and `apps/web`)
  - `npm run build` — pass (Next 15.5.28). Static: `/`, `/rules`, `/sign-in`, `/play`. Dynamic: `/auth/callback`, `/auth/sign-out`. Warning: `@supabase/supabase-js` uses `process.version` inside Edge middleware (upstream `@supabase/ssr` barrel).
  - `npm run test:sim` — 54/54. Engine, catalogue, and Python goldens were not modified.

Exit: `tsc --noEmit` clean; `/rules` matches the spec; sign-in works **once** env + Auth providers are set; no mock live board.

Remaining blockers (manual):

1. Create the Supabase project and fill `apps/web/.env.local` (names in `.env.example`).
2. Enable Email **password** sign-in (used only as the Auth session backend); disable public sign-up and Google. Apply `0007`. Set `TEAM_PROVISION_SECRET`. Night before: POST the 20 qualified Team IDs to `/api/admin/provision-teams` and download the one-time credential CSV.
3. Apply `0001`–`0006` in the SQL editor (Phase 2 seed is in `0005`; round machine is `0006`).
4. Put `SUPABASE_SERVICE_ROLE_KEY` only on the server.

### Phase 1 — engine (Grok)

Python reference engine with 15 interventions: `docs/simulation/engine.py` (`py-ref-1.1.0`, catalogue **A-CAT-1.1**). Tests and balance lab in `docs/simulation/`.

TypeScript port: `packages/sim` (`@langlands/sim`). Golden contract `docs/simulation/goldens/py_ref_1_1_0.json`. Commands: `cd packages/sim && npm test` (54/54) and `npm run typecheck`. Silent / balanced / GRID-then-COAL hashes match Python exactly. `ENGINE_VERSION` remains `py-ref-1.1.0` for hash parity (see `packages/sim/PARITY.md`).

Exit: operating strategies ±0.01 vs `official_score.py`; pack A fixtures; intervention tests; dominance gate holds **with projects**; TypeScript goldens comparison green. Catalogue freeze for the live event is still **conditional** on the original A11 2–4 point reading — see `balance-report.md`. Website / Supabase are **not** in this phase.

### Phase 2 — data (Grok)

Migrations `0004` (hardening + `published_results`) and `0005` (idempotent seed). Isolation suite in `supabase/tests`.

Verified 2026-10-17 (local):

- `npm run test:db` — 14/14 on PGlite with stub Auth (not hosted Supabase).
- Seed: 20 identical seats, 15 A-CAT-1.1 interventions, pack A rounds, T0 checksum `e0cfd3ee…`, no fake users or scores.
- `npm run test:sim` — 54/54. Engine unchanged.
- `npm run lint`, `npm run typecheck`, `npm run build` — pass.

Exit: rival isolation green. Hosted apply (`0001`–`0006` + invite captains) remains a dashboard step; see `supabase/SETUP.md`.

Remaining blockers:

1. Create/link the Supabase project and push `0001`–`0006`.
2. Disable public sign-ups; invite captains onto seats; promote organiser via service role.
3. Hosted re-test of Team A vs Team B `SELECT` (unrun here: no Docker / no project).
4. Phase 3 HTTP routes exist; they return 503 until hosted env keys are set.

### Phase 3 — round machine (Grok)

Submit API, idempotency, lock/process/publish, audit. Engine `@langlands/sim` / `py-ref-1.1.0` unchanged.

Verified 2026-10-17 (local PGlite, not hosted Supabase):

- Migration `0006_round_machine.sql`: `lock_manifest`, process claim token, submit/open/lock/claim/save/publish/void/audit RPCs. Organiser writes granted to `service_role` only.
- Library `packages/round-machine` calls frozen `stepRound` only. Missing teams = default hold (zero spend, normal drift/events).
- HTTP (Node runtime, no play UI): `POST /api/rounds/:id/submissions|open|lock|process|publish|void`, `GET /api/rounds/:id/support/:teamId`.
- `npm run test:db` — isolation 14/14 + round machine 14/14.
- `npm run test:sim` — 54/54. Catalogue, weights, and Python goldens were not modified.

Exit: 20-team lock, duplicate process no-op, crash reclaim, checksum mismatch blocks publish, silent holds match `play()`. Hosted apply of `0006` remains a dashboard step.

### Phase 4 — play UI without map (Opus, against `ui-requirements.md`)

Dashboard, decision screen, unofficial preview banner, clocks from `serverNow`.

Exit: a team can save and see official results only after publish.

### Phase 5 — map (Opus)

SVG isometric tiles bound to `TownPublic` / `TownPrivate`.

Exit: tiles do not change until publish.

### Phase 6 — room + judge (Opus + Grok)

Control room, 20-seat grid, judge board.

Exit: rehearsal script in the runbook is clickable.

### Phase 7 — harden

Load test, PITR drill, 20 dummy-team rehearsal. Pin SHA.

Exit: runbook T−7d checklist signed.

## Collaboration during build

- Opus works in `apps/web` only.
- Grok reviews any PR that touches `packages/sim`, `supabase/`, or `docs/`.
- Spec changes require editing **every** affected doc in the same PR and re-running `official_score.py` if numbers moved.

## Explicitly later / out of scope for v1

Spectator chat, pack B, mobile-native app, 3D, narrative judging scores mixed into `final_score`.
