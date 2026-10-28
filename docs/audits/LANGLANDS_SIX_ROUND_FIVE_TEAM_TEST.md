# Langlands R3 — Six-round, five-team end-to-end test

**Date:** 2026-10-28  
**Git:** `main` at `2727d28` = `origin/main`. Nothing committed, pushed, or deployed.  
**Hosted projects:** rehearsal `fgqitafevklmuhybuwzw` and production `npwgkqfljrqhvuiateqk` were **not written**. Vercel was **not** used.

This is **isolated automated evidence**, not an official competition result.

---

## Environment and isolation

| Item | Choice |
| --- | --- |
| Harness | PGlite + stub `auth.uid()`, migrations `0001`–`0012` via `supabase/tests/harness.ts` |
| Test | `supabase/tests/event-day-dress-rehearsal.test.ts` (extended for Teams A–E, reload, unpublished board, official ranking, checksums, public-row privacy) |
| APIs exercised | Round-machine functions used by organiser/player routes: `open_round`, `submit_decision`, `lock_round`, `claim_process`, `publish_round`, plus `boardForRound` / `playStandingsFrom` |
| Auth model | Five distinct `auth.users` rows, each `team_members.captain` on seats 1–5; organiser is staff only |
| Clock | Real 18-minute `open_round` stamp (`1080000` ms). No production timing rule changed. PGlite does not wait 18 minutes; lock happens while the window is still open (same as an early organiser lock on event day) |
| Why not Vercel / localhost HTTP | `apps/web/.env.local` still names rehearsal `fgqitafevklmuhybuwzw` (published R1–R2). Running `/api` or browsers against it would write that competition |
| Why not a new hosted DB | Creating a disposable Supabase project is an operator dashboard action. `supabase` CLI is not installed |

**Missing capability:** PGlite has no GoTrue cookies, Next.js middleware, or five browser sessions. JWT is `set_config` on **one** connection, so submits are sequential, not parallel HTTP.

---

## Five test identities (no passwords or tokens)

| Label | Seat | Auth user (fixture UUID pattern) | Membership |
| --- | --- | --- | --- |
| Team A | 1 | captain `b0000000-0000-4000-8000-…0001` | own team only |
| Team B | 2 | captain `…0002` | own team only |
| Team C | 3 | captain `…0003` | own team only |
| Team D | 4 | captain `…0004` | own team only |
| Team E | 5 | captain `…0005` | own team only |
| Holds | 6–20 | seated captains, no accepted plan | official default hold at lock |

Organiser is a separate staff user, not a seat.

---

## Distinct strategies

Valid plans generated with `playInteractive` so sector spend and starts fit actual available credits (`reserve + income − maintenance`).

| Team | Mix | Eligible starts |
| --- | --- | --- |
| A | `RESTORE_EARLY` | R1 `RIVER`, R4 `FLOOD_WALL` |
| B | equal eight-sector | R1 `CLINICS`, R3 `WATER_TREAT` |
| C | all operating spend to industry | R1 `INTENSE_AG` |
| D | water-heavy | R1 `WASTEWATER`, R3 `WATER_TREAT` |
| E | `GREEN` | R1 `GRID`, R2 `RENEWABLES` (GRID is the prereq) |

Seats 6–20: empty allocations, no starts (hold). Pack A events were identical for every town.

---

## Six-round results (PGlite)

Every round: organiser open → five authenticated saves → reload own row → unpublished standings refused → lock (5 accepted / 15 holds) → process **once** → duplicate process `noop` → publish 20/20 → `playStandingsFrom` lists only published indexes → next open refused until publish.

| Round | Event | Window | Save | Reload | Lock | Process | Checksum (SHA-256 of 20 town hashes) | Publish | Leaderboard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | none | 18 min | 5 accepted | own allocations/starts persisted | 15 holds | 1 ok run | `2053c74c…ca8087a3` | 20/20 | R1 only |
| 2 | HEATWAVE | 18 min | 5 accepted | persisted | 15 holds | 1 ok run | `c3c51809…5204b8c2` | 20/20 | R1–R2 |
| 3 | DROUGHT | 18 min | 5 accepted | persisted | 15 holds | 1 ok run | `f14da9be…1b3b8bc6` | 20/20 | R1–R3 |
| 4 | FLOOD | 18 min | 5 accepted | persisted | 15 holds | 1 ok run | `7e5967dd…ca2dbfa7` | 20/20 | R1–R4 |
| 5 | CONTAMINATION | 18 min | 5 accepted | persisted | 15 holds | 1 ok run | `078d1c48…2e629a26` | 20/20 | R1–R5 |
| 6 | none | 18 min | 5 accepted | persisted | 15 holds | 1 ok run | `1c9c9aac…7a55db8c` | 20/20 | R1–R6 |

`rounds.process_checksum` matched the process output checksum each time. Engine version on published rows: `py-ref-1.1.0`. Audit counts: `open_round` ×6, `lock_round` ≥6, `publish_round` ×6.

Town hashes matched `playInteractive` replay. Round-6 official scores (path score stored on `published_results` / `town_states`):

| Rank | Team | Seat | Official final |
| --- | --- | --- | --- |
| 1 | A | 1 | 58.98 |
| 2 | D | 4 | 55.79 |
| 3 | B | 2 | 55.00 |
| 4 | E | 5 | 53.85 |
| 5 | C | 3 | 7.98 |
| 6–20 | holds | 6–20 | 6.42 (silent golden) |

`boardForRound` + `compareOfficial` (higher score, then higher ecology, then lower seat) accepted this order. Hold seats share 6.42 and rank by seat. Viewer seat 1 is `isYou`; seat 2 is not.

Team C **7.98** vs full-precision engine **7.99** is the existing process rounding of prior `snapshot_score` into `finalScore` (≤ 0.01). Physics hash still matched.

Weights unchanged: ecology 40, welfare 25, economy 15, resilience 10, efficiency 10.

---

## Validation, concurrency, duplicates, privacy

| Check | Outcome |
| --- | --- |
| Team A submit as Team B | 403 |
| Player `open_round` | 403 |
| Three starts / unknown code / COAL without GRID | `invalid`, previous plan kept |
| Overspend 50 000 industry | accepted; spend scaled to available (rules, not a 400) |
| Same idempotency key | `duplicate` |
| Submit after lock | `closed` / late |
| Duplicate lock | `idempotent` |
| Duplicate process | `noop` |
| Next round open before publish | `invalid_transition` |
| Unpublished `boardForRound` | `{ ok: false, error: "unpublished" }`; 0 `published_results` until publish |
| Public process rows | `publicHasPrivateKeys` empty (no allocations/starts/state) |
| Team A SELECT Team B `submissions` / `town_states` | 0 rows |
| Parallel HTTP five-way submit | **Not run** (single PGlite connection) |

---

## Player UI / hosted browser

**Not claimed.** Isolated PGlite does not serve `/play`, cookies, or Ashfen. Localhost and Vercel talk to the shared rehearsal database, so they were not used for sign-in, save, or organiser buttons in this pass.

Previous read-only observation (earlier audit, not this run): one Team 001 cookie on localhost showed Round 3 scheduled and save disabled. That is **not** five-account UI coverage.

To get real browser/API coverage an operator must: create a disposable Supabase project, apply `0001`–`0012`, provision 20 teams, point a preview deploy at it (not rehearsal, not `npwgkqfljrqhvuiateqk`), then run five browsers.

---

## Regression

| Command | Exit | Counts |
| --- | --- | --- |
| `npm run test:web` | 0 | 16 files / 93 tests |
| `npm run test:sim` | 0 | 4 files / 58 tests |
| `npm run test:db` | 0 | 5 files / 42 tests |
| `npm run typecheck` | 0 | sim, round-machine, web |
| `npm run lint` | 0 | no warnings |
| `NEXT_DIST_DIR=.next-release-check npm run build -w @langlands/web` | 0 | compiled |

Isolated build rewrote `apps/web/next-env.d.ts`; it was restored. Working tree: untracked `docs/audits/` and `supabase/tests/event-day-dress-rehearsal.test.ts` only. Remote unchanged.

---

## Isolated vs hosted

| Layer | This pass |
| --- | --- |
| Schema, RLS, round machine, official engine, five authenticated captains, six Pack A rounds | **Passed (PGlite)** |
| Next.js login cookies, `/play` map, five browsers, Vercel, concurrent HTTP | **Untested (would require a disposable hosted DB)** |
| Shared rehearsal / old production | **Not used for writes** |

---

## Remaining blockers before resetting any event database

1. Confirm Vercel env is **not** rehearsal `fgqitafevklmuhybuwzw` unless that project is deliberately the live event.
2. Never reset or migrate `npwgkqfljrqhvuiateqk` from an agent session.
3. If a clean event DB is required: operator creates it, applies `0001`–`0012`, provisions 20 Team IDs, disables public signup.
4. Hosted five-browser walk (sign-in/out, Ashfen save, clock, unpublished board, organiser room) still outstanding.
5. Do not wipe rehearsal R1–R2 until the operator has chosen whether that project is retired or promoted.

**Passed:** isolated six-round, five-strategy, authenticated round-machine path with official scoring, checksums, privacy, and regressions.  
**Failed:** none in the isolated suite.  
**Untested:** real browser sessions, Vercel, concurrent HTTP, hosted Auth cookies.
