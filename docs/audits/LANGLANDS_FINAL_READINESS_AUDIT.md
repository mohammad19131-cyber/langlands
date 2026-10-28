# Langlands R3 — final gameplay verification and launch readiness

**Date:** 2026-10-28  
**Tree:** local working tree on `main` @ `2727d28` plus uncommitted work. Not deployed.  
**Constraint:** no commit, push, deploy, production writes, scoring-weight changes, catalogue/event changes, or invented hosted results.

Engine: `py-ref-1.1.0` / catalogue **A-CAT-1.1**. Live process uses TypeScript `packages/sim`.

**Verdict: NO-GO for a hosted hall rehearsal. GO for a local / PGlite controlled rehearsal of the game loop.**

---

## 1. Changes made and files affected

Delegate leaderboard removed with **server-side** denial, not just a hidden button. Official ranking now uses the published mean-event-damage tie-break. Scoring weights, catalogue prices, grants, Pack A, and `final_score` were not changed.

| Area | Files |
| --- | --- |
| Organiser-only board access | `apps/web/lib/board-access.ts`, `apps/web/lib/board-access.test.ts`, `apps/web/app/api/play/board/route.ts`, `apps/web/app/board/page.tsx` |
| Strip board from delegate play payload | `apps/web/lib/play-payload.ts`, `apps/web/lib/play-payload.test.ts`, `apps/web/lib/server/game-context.ts` |
| Delegate HUD | `apps/web/components/game/GameHeader.tsx`, `apps/web/components/game/GameScreen.tsx`, `apps/web/components/game/Overlays.tsx`, `apps/web/components/SiteHeader.tsx`, `apps/web/components/SiteFooter.tsx` |
| Official ranking | `apps/web/lib/ranking.ts`, `apps/web/lib/ranking.test.ts`, `packages/round-machine/src/process.ts`, `packages/round-machine/src/types.ts`, `supabase/tests/event-day-dress-rehearsal.test.ts` |
| Contracts | `docs/ui-requirements.md` (`/board` organiser-only), `docs/game-rules.md` (delegates see own published town, not the 20-town board) |
| Regression | `packages/sim/tests/strategy-balance.test.ts` |

Organiser `/room` still links to `/board`. Control-room permissions were not weakened.

`meanDamage` is an extra JSON key on `score_breakdown`. The CHECK still only requires the seven pillar keys. Existing published rows without the extra key skip that tie-break step and then use seat.

---

## 2. Delegates cannot see or retrieve the leaderboard

**Prescribed order after this change**

1. `/play` HUD has no Board / Standings control for seated teams. Results and Scoring remain (own published pillars and weights).
2. Guessing `/board` is cookie-gated, then **server-checked**: non-organisers get an organiser-only page, not the standings overlay.
3. `GET /api/play/board` returns **403** unless `competition_staff.staff_role = organiser`.
4. `GET /api/play/context` via `publicPlayContext` sets `leaderboard: null` and `boardByRound: {}` when `isOrganiser` is false. Rival seats, ranks, and rank-change arrows are not in the player payload.
5. `ResultsPanel` still shows **own** `ownHistory` only.

Tests: `board-access.test.ts` (deny unless organiser), `play-payload.test.ts` (seated player payload has no rival board), ranking tests still build organiser boards.

**Not proven:** a browser session on the hosted rehearsal origin running this exact tree. The code is local and un-deployed.

---

## 3. Official tie-break specification and implementation

**Specification (unchanged):** `docs/scoring-system.md` and `docs/game-rules.md`.

1. Higher official score (`final_score` / stored ranking score).
2. Higher ecology index `E`.
3. Lower mean event damage (shock_log entries `> 0`, Pack A rounds 2–5).
4. Lower seat number.

Python engine tuple is already `(-score, -E, mean_damage, seat)`. The previous public board skipped step 3.

**Now:** `compareOfficial` uses optional `meanDamage`. Process persists `pythonRound(meanEventDamage(town), 2)` on `score_breakdown`. If either side lacks a finite value, that step is skipped (not invented as 0), then seat.

Tests cover: score, ecology, mean damage, seat, exact remaining ties, and missing damage on one or both sides. Dress rehearsal asserts `meanDamage` is present after process and that ranked seats obey `compareOfficial`.

Weights remain 40 / 25 / 15 / 10 / 10.

---

## 4. Credit ledger and reproduced numerical examples

Source: `packages/sim` `incomeFor` / `maintenanceDue` / `stepRound` / `play` / `playInteractive`. Same numbers as `docs/audits/LANGLANDS_GAMEPLAY_CREDIT_AUDIT.md`.

```
income = 180
       + (180 if round == 1 else 0)
       + 8.6×economy + 3.2×jobs + 1.6×fiscal
       − 0.45×pollution − 0.40×(100−health) − 0.30×(100−energy)

available = max(0, opening_reserve + income − maintenance)
STARTING_RESERVE = 220
```

Income is after this round’s drift, delayed landings, and ongoing effects. Starts are charged first, then sector allocations are scaled to what remains. Unspent → next reserve. No borrow. Saving does **not** charge credits; process does.

**Reproduced from this tree**

| Claim | Result |
| --- | --- |
| Round 1 available before spend | **1154.06** (income 934.06 = 180 stipend + 180 grant + operating terms) |
| Silent hold remaining credits | **3815.05** |
| Silent official score | **6.42** |
| Equal-split no projects | **55.92**, closing reserve **0** |

These match the golden file `docs/simulation/goldens/py_ref_1_1_0.json` and the earlier gameplay audit. No discrepancy to force.

Unused credits at the end stay in `reserve` and affect only efficiency `F` (Gaussian around 300). Hoarding 3815 collapses the town.

---

## 5. Strategy comparison and balance findings

Identical T0, Pack A, six rounds, TypeScript engine. **No rebalance was applied.**

| Strategy | Decisions | Score | Eco | Wel | Econ | Res | Eff | Remaining |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 Balanced | Equal 12.5% sectors, no projects | **55.92** | 47.75 | 69.85 | 66.57 | 64.79 | 58.37 | 0 |
| 2 Ecology | Restore-early then restore-late; R1 WETLAND+REFOREST, R2 RIVER | **60.91** | 76.24 | 59.48 | 48.36 | 61.79 | 59.84 | 0 |
| 3 Economy | Grow-early then grow-late; R1 GRID+INTENSE_AG, R2 COAL+FACTORIES | **36.66** | 19.42 | 67.64 | 76.70 | 60.87 | 57.24 | 0 |
| 4 Save then invest | Hold R1–R3; R4 WETLAND+WATER_TREAT; R5 CLINICS; restore-late spend | **43.00** | 44.21 | 48.09 | 40.08 | 52.69 | 61.45 | 0 |
| 5 Early long-term | R1 WETLAND+REFOREST, R2 GRID+FLOOD_WALL, R3 EMISSIONS | **57.27** | 63.07 | 57.41 | 54.86 | 65.13 | 60.34 | 0 |
| 6 Crisis prep | R1 GRID+CLINICS, R2 WATER_TREAT+FLOOD_WALL, R3 WASTEWATER, R4 WETLAND, GREEN mix | **53.62** | 48.60 | 61.20 | 60.20 | 66.16 | 59.71 | 0 |

Silent hold (no spend) remains **6.42** / **3815.05**.

Ecology R1 spends 560 on projects + 594.06 sectors from 1154.06. Economy R1 spends 440 + 714.06. Save-then-invest carries 2488.57 into R4 then dumps it; heatwave/drought damage stays ~45 like the silent town until then.

**Findings (evidence, not changes)**

- One path did **not** max every pillar. Ecology 76 with economy 48; economy-focus 77 economy with ecology 19 and penalty 10.28.
- Ecology-focus **led this set** (60.91) but is not a 15-point runaway over balanced (55.92) or early long-term (57.27).
- Economy-first is a trap under a 40% ecology weight.
- Delayed projects matter: waiting until R4 scored 43.00 vs 60.91 for planting in R1.
- Credits constrain the catalogue (two starts, mutex, maintenance) more than equal operating spend. Spending to zero every round is viable; a vault is not.
- End-of-game leftover cash is not converted into a win.

**Proposed adjustments (for approval only; not done)**

1. If operators want a sharper cash bind on operating spend, shrink the R1 grant or stipend — do not silently change it.
2. If economy-first should be a real alternative rather than a collapse, that is a weight or catalogue question, not a bug.
3. Keep delayed restoration expensive; it is the actual sequencing lesson.

---

## 6. Six-round events and crisis briefings

Pack A in `packages/sim` `PACK_A` and Python `engine.py`:

| Round | Code | `/play` briefing (this round only) |
| ---: | --- | --- |
| 1 | none | Reconstruction year / recovery grant |
| 2 | HEATWAVE | The long heat |
| 3 | DROUGHT | The dry season |
| 4 | FLOOD | The breach |
| 5 | CONTAMINATION | The spill |
| 6 | none | Final accounting |

Verified in `strategy-balance.test.ts`, `engine.test.ts`, Python `EventTests.test_pack_a_order`, and PGlite dress rehearsal timeline (null → HEATWAVE → DROUGHT → FLOOD → CONTAMINATION → null). Silent shock_log is `0, >0, >0, >0, >0, 0`. Events do not leak into R1 or R6.

`EventStrip` / `EventOverlay` expand **this** round. The public schedule remains in `EVENT_SCHEDULE` for `/rules`. Server `event_code` is the badge source. Python and TypeScript goldens still match for silent / balanced / GRID→COAL.

No leaderboard is on the delegate `/play` surfaces listed above.

---

## 7. Game-loop and hosted save/resave

**Local / PGlite (verified this pass)**

Decision → `submit_decision` → second distinct save supersedes (needs 0013 in the isolated schema, which PGlite applies) → lock → `processRound` twice → persist town/credits → publish 20/20 → next round blocked until publish. Dress rehearsal walked all six rounds. `submit-supersede.test.ts` passed (2). Late, invalid, duplicate-key, and hold behaviour remain as in the gameplay audit. Credits are not charged at save. Failed process stores `_ok: false`; publish stays blocked.

**Hosted rehearsal project `fgqitafevklmuhybuwzw`**

| Check | Result |
| --- | --- |
| `apps/web/.env.local` URL ref | **fgqitafevklmuhybuwzw** (rehearsal) |
| `apps/web/.env.hosted.local` URL ref | **npwgkqfljrqhvuiateqk** (production — not used) |
| Supabase CLI `supabase/.temp/project-ref` | **npwgkqfljrqhvuiateqk** — **never `db push`** |
| Live competition slug `langlands-r3` | present, status **ready** |
| Other rows on the project | two **archived** competitions also exist |
| `schema_migrations` via PostgREST | not readable (HTTP error) |
| Migration 0013 | in the repo; **not confirmed applied** on rehearsal |
| Dummy save / resave / reload | **not run** |
| Automatic tick / lock | **not started** |

A first read-only REST call used the **first listed** competition, which is an archive, so those round rows must not be treated as live `langlands-r3`. A corrected live-round query was not completed. Dummy writes were stopped: no designated empty dummy team, 0013 unconfirmed, and CLI still points at production.

**Manual 0013 steps (rehearsal SQL editor only)**

1. In the Supabase dashboard, confirm the project ref is `fgqitafevklmuhybuwzw`.
2. Open migration history. If `0013_submit_supersede_with_auth` is already listed, do nothing.
3. If missing, run the file `supabase/migrations/0013_submit_supersede_with_auth.sql` in that project’s SQL editor.
4. Use a dummy captain on an **open** round that is not a real delegate plan: save, change, save again, reload `/play`. Credits must not move until process.
5. Do not lock, process, or start automatic progression unless the live clock is intentionally in a rehearsal window.

---

## 8. Test results (actual counts)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (sim, round-machine, web) |
| `npm run lint` | pass, 0 warnings |
| `npm run test:sim` | **63** passed / 5 files |
| `npm run test:web` | **103** passed / 18 files |
| `npm run test:db` | **44** passed / 6 files |
| `python3 -m unittest test_engine` | **35** passed |
| `npm run build` | pass (Next.js 15.5.28) |
| `python3 docs/simulation/official_score.py` | not re-run (operating-only lab; would rewrite JSON) |

New / extended coverage: delegate board denial, official tie-break stages including missing damage, Pack A order, R1 1154.06 / silent 6.42 / equal 55.92, PGlite process `meanDamage`, save supersede (isolated).

Hosted browser tests: **none this pass**.

---

## 9. Remaining release blockers

1. Hosted second-save still depends on **0013**, which is unconfirmed on rehearsal.
2. Hosted dummy save/resave/reload was not executed.
3. Live `langlands-r3` round clock was not re-confirmed after the archive/live mix-up. Do not start automatic progression.
4. These UI/API ranking changes are **local and un-deployed**.
5. Already-published `score_breakdown` rows lack `meanDamage` until the next successful process. Ranking then skips to seat. Do not rewrite old official numbers.
6. Save API still rejects illegal starts as a whole plan (`assertAuthoritativeStarts`) — documented earlier, not changed.
7. CLI remains linked to production. Any `supabase db push` is a production incident.

---

## 10. GO / NO-GO

| Scope | Recommendation |
| --- | --- |
| Local / PGlite controlled rehearsal of mechanics | **GO** |
| Hosted rehearsal on `fgqitafevklmuhybuwzw` | **NO-GO** until 0013 is confirmed, a dummy save/resave works, and this tree is what `/play` actually serves |
| Production competition `npwgkqfljrqhvuiateqk` | **Do not touch** |

---

## Plain-English summary

Delegates no longer get a leaderboard on `/play`, in the site chrome, or by calling `/api/play/board` — the API now 403s anyone who is not an organiser. Ranking for organisers now follows the published rule: score, then ecology, then lower mean event damage, then seat. Round 1 still funds 1,154.06 credits; doing nothing still leaves 3,815.05 and scores 6.42; splitting every credit evenly still scores 55.92. Restoration-first beat the other five measured plans; waiting until round 4 and going industry-heavy both lost. Pack A is still grant, heat, drought, flood, contamination, finale. Isolated tests all passed (63 sim, 103 web, 44 database, 35 Python). The rehearsal Supabase project is the one in `apps/web/.env.local`. What was **not** done: apply 0013, dummy hosted save, deploy, or start the live clock. Until those are done, do not run the hall on hosted data.
