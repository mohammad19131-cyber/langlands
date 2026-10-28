# Langlands R3 — gameplay validation

**Date:** 2026-10-28  
**Mode:** local only. Hosted Supabase was not opened, seeded, or modified. Unrelated uncommitted work was left in place. Scoring weights, catalogue costs and event formulas were not changed.

**Verdict:** Every published selectable option is implemented in the frozen TypeScript engine and is covered by automated tests against the specifications. The Round 1 `WATER_TREAT` campaign persists through drought and round 5. This is **not** a hosted or in-browser click rehearsal.

---

## Path that was traced

Selectable options are only:

1. Eight sector allocations (`SECTORS` in `packages/sim/src/constants.ts`).
2. Fifteen catalogue starts, at most two per round (`packages/sim/src/catalogue.ts`, `docs/interventions-catalogue.md`).

There is **no** extra crisis-response menu. Pack A events fire on a fixed schedule. Catalogue `eventMult` values are the only named shields.

Code path:

| Stage | Where |
| --- | --- |
| UI selection | `apps/web/components/game/CommandDesk.tsx` lists `projectsForSector` from `CATALOGUE`. Eight sliders in the same desk. Eligibility in `game-logic.ts` is UI-only. |
| Client canonicalize | `apps/web/lib/decision.ts` caps starts at two and drops unknown codes. |
| Validation | `packages/round-machine/src/validate.ts` `parseProposal` + `assertAuthoritativeStarts` (dry-run `stepRound`; dropped starts reject the save). |
| Save | `submitDecision` → SQL `submit_decision`. Does **not** write `town_states` or charge credits. |
| Persist proposal | `submissions.allocations` / `project_starts`. Resave supersedes the previous accepted row (`0013`). |
| Process | `processRound` → `stepRound` (`packages/sim/src/engine.ts`). Charge order: starts, then sectors, remainder to reserve. |
| Town-state update | Written at **publish**, from process output. Next round `loadPreTown` reads the published `state` (`started`, `completed`, `pending`, mix flags, `shock_log`). |
| Later rounds | Same `stepRound` order: drift → pending landings → operating delayed → ongoing → budget → starts → allocations → Pack A → snapshot. |
| Official evaluation | `snapshot` + `finalScore` in the engine (40/25/15/10/10). |

---

## Catalogue of tested options

Status key: **full** = selection, cost, start, persist, specified effects, and (where published) event shield checked on the real engine.

| Code | Name | Cost | Build | Persist | Specified effects | Event shield | Status |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| `WETLAND` | Wetland restoration | 280 | 1 | R1→R6 | T+1 water/bio/soil/buffer; ongoing | Flood ×0.85 | full |
| `REFOREST` | Reforestation | 280 | 2 | R1→R6 | T+1 air; T+2 bio/soil/buffer; ongoing | none (intended) | full |
| `RIVER` | River cleanup | 240 | 0 | R1→R6 | Immediate water_q/pollution; ongoing pollution | none (intended) | full |
| `EMISSIONS` | Industrial emissions control | 260 | 1 | R1→R6 | T+1 pollution/air; ongoing | none (intended) | full |
| `WASTEWATER` | Wastewater upgrade | 300 | 1 | R1→R6 | T+1 water/pollution/health | Contamination ×0.90 | full |
| `WATER_TREAT` | Emergency water treatment | 200 | 0 | R1→R6 | Immediate water_q+6, health+2 | Drought ×0.90 | full |
| `GRID` | Grid repairs | 200 | 0 | R1→R6 | Immediate energy/infra; enables tree | none (intended) | full |
| `COAL` | Emergency thermal restart | 280 | 0 | after GRID | Immediate mix + dirt; mutex vs renewables | none (intended) | full |
| `RENEWABLES` | Wind and solar park | 360 | 2 | after GRID | T+2 energy/pollution/buffer/green_energy | none (intended) | full |
| `REGEN_AG` | Regenerative farming | 260 | 1 | R1→R6 | Immediate mix; T+1 soil/bio/economy; mutex | none (intended) | full |
| `INTENSE_AG` | Intensive yield push | 240 | 0 | R1→R6 | Immediate economy/jobs/soil/water/pollution; ongoing mix | none (intended) | full |
| `FACTORIES` | Repair factories | 240 | 1 | after GRID | T+1 economy/jobs/pollution/intensity | none (intended) | full |
| `GREEN_MFG` | Green manufacturing conversion | 280 | 1 | after EMISSIONS+FACTORIES | T+1 cleanup; ongoing; cannot finish if started R6 | Contamination ×0.90 | full |
| `FLOOD_WALL` | Flood defences | 300 | 1 | R1→R6 | Immediate infra/prep; T+1 buffer | Flood ×0.75 | full |
| `CLINICS` | Clinics and emergency services | 240 | 0 | R1→R6 | Immediate health/prep; ongoing health; same-round shield | Contamination ×0.85 | full |

Sectors (each spent alone in round 1 vs a silent hold; direction taken from `applyAllocations`):

| Sector | Indicator checked | Direction vs hold | Status |
| --- | --- | --- | --- |
| `restoration` | `bio` | up | full (R1 directional) |
| `pollution_control` | `pollution` | down | full (R1 directional) |
| `water` | `water_q` | up | full (R1 directional) |
| `energy` | `energy` | up | full (R1 directional) |
| `agriculture` | `jobs` | up | full (R1 directional) |
| `industry` | `economy` | up | full (R1 directional) |
| `infrastructure` | `infra` | up | full (R1 directional) |
| `public_services` | `health` | up | full (R1 directional) |

Negative / boundary cases also tested: unknown code, duplicate start, third start, already-started, mutex, missing prereq (including same-list `GRID`+`COAL`), budget drop, overspend scaled after starts, process replay hash, PGlite process no-op on retry.

---

## Water-upgrade trace (`WATER_TREAT` from round 1)

Control town: identical silent hold (no starts, no sector spend). Both campaigns use `stepRound` for every intervening round. Figures below are from the same engine (`py-ref-1.1.0`); they are not invented targets.

| Round | What the specs require | What happened |
| ---: | --- | --- |
| 1 | Start, complete immediately, water_q+6, health+2, cost 200, no event | Accepted `WATER_TREAT`. `started`/`completed` = 1. water_q **+6.00** vs control (43.15 vs 37.15). health **+2.00**. Unspent 954.06 vs 1154.06. Maintenance 0. Ecology 32.47 vs 31.27. |
| 2 | Maintenance 10. No heatwave multiplier | Maintenance 10 vs 0. Heatwave damage 44.07 vs 45.27 (water_q only; `eventMult.HEATWAVE` absent). |
| 3 | Drought ×0.90 **after completion**, on the treated town's own formula | Damage 39.59 vs control 45.49. Treated damage matches `droughtFormula(pre-event town) * 0.90` to engine precision. Ratio vs control is **0.87**, not 0.90, because the control town is already drier. |
| 4–5 | Asset still owned. No contamination multiplier (catalogue lists drought only) | Still `started`/`completed` = 1 at round 5. Contamination multiplier **1.0**. Damage 42.71 vs 44.24 via persisted water/health, not a hidden shield. Final water_q still **+7.38** vs control. |
| Score | Published 40/25/15/10/10, not an invented number | `finalScore` 7.19 vs silent-hold golden **6.42**. |

PGlite lifecycle (`supabase/tests/gameplay-validation.test.ts`): captain save → second save supersedes the first accepted row → `town_states` still empty → lock → `processClaimedRound` (retry is a no-op) → publish → rounds 2–5 opened, locked, processed and published from persisted state. Seat 1 drought `shock_log[2]` is below the hold seat. Credits are unchanged until process.

Load-bearing check: temporarily setting `CATALOGUE.WATER_TREAT.eventMult.DROUGHT = 1` inside the test makes round-3 damage match the **un**multiplied formula and miss `×0.90` by more than 0.5. The mutation is restored in `afterEach`; the working tree is unchanged.

`WASTEWATER` (the other water-named project) was traced separately: completes at T+1, **no** drought multiplier, contamination ×0.90 at round 5.

---

## Options that do not work or remain unverified

| Item | Finding |
| --- | --- |
| In-browser click path | Not run. UI wiring is unit-tested (`gameplay-options.test.ts`): all 15 codes render, eight sectors map 1:1, crisis copy matches catalogue multipliers. No Playwright / hosted `/play` session. |
| Hosted competitions | Not touched. Isolation is PGlite + engine only. |
| Combinatorial sector mixes | Each sector is proven to move its primary indicator. Exhaustive 8-sector mix grids were not added; existing strategy/balance suites already score named mixes. |
| `notes` / `clientClaimedAt` | Accepted on save payloads. They are not simulation inputs. |
| UI budget gating | `startEligibility` does not check credits. The server rejects unaffordable starts via `assertAuthoritativeStarts`. That is a UX gap, not a missing engine effect. |

No catalogue project was found that saves but is ignored by `stepRound`. No specified delayed effect was missing. Intended zeros (for example `WATER_TREAT` on contamination, `REFOREST` on drought) are asserted as multiplier **1.0**, not as missing code.

No engine or scoring bug was found that required a formula change.

---

## Spec vs implementation gaps (documentation only)

1. **Charge order.** `docs/interventions-catalogue.md` still says starts attach “after operating allocations”. `docs/simulation-model.md` and `docs/game-rules.md` freeze **starts then sectors**. The engine follows game-rules. Tests charge GRID at 200 then scale sectors.
2. **Contamination shields.** Catalogue and engine apply `WASTEWATER` ×0.90, `GREEN_MFG` ×0.90 and `CLINICS` ×0.85 (stacked). `docs/environmental-events.md` only names `CLINICS`. Tests follow the catalogue/engine, which agree with each other.
3. **Same-round prereqs.** `GRID` then `COAL` in one list is rejected. Completion is recorded in `startProjects`, after `resolveStarts`. Documented in the engine header and covered by tests.

These are doc mismatches, not silent gameplay bugs.

---

## Test coverage and results

New tests:

- `packages/sim/tests/gameplay-validation.test.ts` — 58 tests (catalogue contract, all 15 campaigns, sectors, water-upgrade, mutation, wastewater, flood stack, clinics).
- `supabase/tests/gameplay-validation.test.ts` — 1 PGlite lifecycle test (20 seats, save/resave/process/publish through round 5).
- `apps/web/lib/gameplay-options.test.ts` — 4 UI catalogue/eligibility tests.

### Commands and counts (this session)

```
npm run test:sim
# Test Files  6 passed (6)
# Tests       121 passed (121)

npm run test:web
# Test Files  19 passed (19)
# Tests       107 passed (107)

npm run test:db
# Test Files  7 passed (7)
# Tests       46 passed (46)

python3 -m unittest discover -s docs/simulation -p 'test_*.py'
# Ran 35 tests in 0.022s  OK

npm run typecheck    # pass (sim, round-machine, web)
npm run lint         # pass (no ESLint warnings or errors)
npm run build        # pass (Next.js 15.5.28 production build)
```

Python reference `play_interactive` for the water campaign matches the TypeScript assertions (R1 Δwater_q = +6, drought treated 39.594 vs control 45.485, silent score 6.42).

---

## Conclusion

All **15** catalogue projects and **8** sectors are implemented and tested on the real engine. `WATER_TREAT` started in round 1 is still present at round 5, reduces drought by the published 0.90 multiplier on that town’s own formula, and does not invent a contamination shield. Save does not charge; process does; a second process is a no-op.

Do not read this as 20-browser or hosted-event validation. Those were out of scope and were not run.
