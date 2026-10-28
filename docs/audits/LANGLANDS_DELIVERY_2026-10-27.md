# Langlands R3 — 2026-10-27 delivery

**Verdict:** **READY FOR REHEARSAL** on an isolated PGlite database. **NOT READY FOR COMPETITION.**  
**Git:** `main` at `d510830` plus a dirty working tree. Nothing committed, pushed, or deployed. Hosted competition was not mutated.

---

## What works now

- Frozen engine `py-ref-1.1.0` (54/54 sim tests).
- Player HUD (uncommitted Phase 2 + clock fix): team, round, open state, available credits, map-first Ashfen, desk, preview save disabled on `/play/fixture`.
- Countdown ticks locally from the server sample (fixture: `17:51 left` then `17:41 left`).
- Isolated round machine: open stamps an 18-minute window; organiser can extend while open; unpublished lock can reopen before process; lock/process/publish 20/20.
- Isolated 20-team × 6-round rehearsal passed on PGlite (`supabase/tests/rehearsal.test.ts`).
- Private lock allocations are no longer stored on a participant-readable `rounds` column.

## What was repaired

1. **Phase 2 HUD** — preserved existing dirty tree; clock algebra now subtracts local elapsed time; overflow control is `···` not the letter `T`; Void confirm is red vs Publish green.
2. **P0 lock leak** — `round_lock_private` holds allocations; `rounds.lock_manifest` is a public seat summary; claim/process/publish read the private table.
3. **Round windows** — `open_round` writes `now()` → `now() + 18 minutes`. `set_round_window` while open. `reopen_round` for unpublished `locked` with no `town_states`.
4. **Control room** — Open copy, Add 5 minutes, Reopen, distinct Void styling.
5. **Void policy** — not invented. Predecessor must still be `published`.

## Files changed

New: `0009_lock_manifest_privilege.sql`, `0010_round_windows.sql`, `/api/rounds/[id]/window`, `/api/rounds/[id]/reopen`, `supabase/tests/rehearsal.test.ts`, fixture page/helpers, this folder of audits.

Modified: clock + HUD + ControlRoom, round-machine TS, PGlite harness/isolation/round-machine tests, `docs/security-and-permissions.md`, `docs/database-schema.md`. Pre-existing Phase 2 HUD and copy edits were left in place.

## Tests executed (this delivery)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run test:sim` | 54/54 |
| `npm run test:web` | 48/48 |
| `npm run test:db` | 37/37 (isolation 15, round-machine 14, rehearsal 4, credentials 4) |

Skipped (unsafe or write): `official_score.py`, `organiser:local`, `seed:sql`, login POST, hosted round RPCs, `next build`.

## Browser workflows verified

Local `next dev` only. No login.

- `/play/fixture` — map HUD, Desk, Preview only, overflow `More pages`, countdown ticked.
- Unsigned `/play` `/room` still redirect (not re-clicked this pass; unchanged).

Not opened: seated live `/play`, organiser `/room` against hosted.

## 20-team six-round rehearsal

**Passed in PGlite, not hosted.** Round 1: 18-minute stamp, +5 minute extend, reopen after lock, two real submits, process/publish 20. Rounds 2–6: open/lock/process/publish 20/20, engine `py-ref-1.1.0`. Hold seats match silent `play()`; spending seats do not. Player cannot set the window. Cannot reopen after process.

This is not 20 simultaneous browsers.

## Remaining P0/P1

| ID | Sev | Status |
| --- | --- | --- |
| Hosted DB / 2099 windows / voided R4 / 1 of 20 logins | P0 | Unverified today; do not migrate hosted from this session |
| `0009`/`0010` not on hosted | P0 | Isolated only |
| Void still blocks n+1 | P1 | Policy: not invented |
| Ranking omits mean event damage | P1 | Policy: not changed |
| Dual sector glossary on Field Guide | P2 | Desk uses Habitat/Farming; `/rules` still Restoration/Agriculture |
| Live save / room UI on a real session | P1 | Not browser-tested |
| Working tree uncommitted | process | Do not lose it |

## Policy still needing approval

- Void recovery for n+1.
- HTTP 400 vs documented drop of invalid starts.
- Whether mean event damage is public.
- Whether `/judge` exists.
- When to commit this tree and apply migrations to a **new** or staging database.

## Readiness

- **Isolated rehearsal:** yes (PGlite, this tree).
- **Hosted / hall rehearsal:** no — apply `0009`/`0010` only to a clean isolated project, provision 20 dummy teams, then run the runbook. Do not touch the existing hosted competition from an agent.
- **Real competition:** no.
