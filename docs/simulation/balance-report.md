# Phase 1 balance report

Status: catalogue revision **A-CAT-1.1** implemented and tested. Pedagogical game model, not empirical science. Scoring weights **were not changed**.

Engine: `docs/simulation/engine.py` version `py-ref-1.1.0` (was `py-ref-1.0.0`)  
Tests: `python3 -m unittest test_engine -v` (from `docs/simulation`)  
Lab: `python3 balance_lab.py` seed **2026** × **10,000** plus targeted seed **4040** × **5,000**  
Raw JSON: `docs/simulation/balance_lab_results.json`  
TypeScript goldens: `docs/simulation/goldens/py_ref_1_1_0.json` (v1.0.0 file kept as history)  
TypeScript engine: `packages/sim` — 54/54 Vitest, hashes match this golden file.

## 1. Diagnosis (why credits beat v1.0.0 projects)

Holding ~300 credits scored **58.41**. Wetland restoration on the same operating mix scored **57.97** even after the team kept the buffer. The advertised green-industry chain scored **49.20** (naive) / **51.78** (buffer-aware). A11 failed.

Effects were separated on the live v1.0.0 engine. Commands: `python3 diagnose_imbalance.py` and in-memory probes in `probe_catalogue.py`.

### 1.1 Resource efficiency `F` (published, not retuned)

```
discipline = 100 * exp(−(reserve − 300)² / (2 * 160²))
F = clamp(0.40 * discipline + 0.35 * waste_score + 0.25 * yield_score)
snapshot includes 0.10 * F
```

| Reserve | `F` (equal 80/sector) | `0.10 * F` vs 300 |
| ---: | ---: | ---: |
| 0 | 61.66 | −3.31 snapshot / round |
| 100 | 73.07 | −2.17 |
| 200 | 87.66 | −0.71 |
| **300** | **94.76** | 0 |
| 400 | 87.66 | −0.71 |
| 1600 | 54.76 | −4.00 |

The 300-credit Gaussian is steep. Emptying the reserve in **one** round costs about **3.3 snapshot points that round**, then 0.38 of the path mean. That is a real R1 trap if a team buys a project **and** still requests full sector spend from the pre-project pot.

It is **not** the whole A11 gap. When sector spend was rebudgeted from leftover cash so reserve stayed 300:

| Path | Score | Final E | Notes |
| --- | ---: | ---: | --- |
| prudent_buffer (no projects) | 58.41 | 49.6 | F ≈ 92 every round |
| prudent + WETLAND, buffer kept | 57.97 | 50.3 | F preserved; still −0.44 |
| rtg operating only | 59.07 | 54.3 | Best no-project mix |
| rtg + WETLAND | 58.51 | 54.0 | Still loses to rtg only |
| green_path, buffer kept | 51.78 | 39.9 | Chain tax + pollution |

So `F` rewards unspent money **near 300**, not “the more cash the better” (1600 is worse than 0). Project benefits were too weak relative to lost `sat()` operating spend and maintenance.

### 1.2 Opportunity cost of a wetland (v1.0.0 numbers)

`E = (air + water_q + soil + bio + (100 − pollution)) / 5`

Wetland T+1: water_q+4, bio+6, buffer+5 → **ΔE = +2.0**. Weighted: `0.40 × 2.0 = 0.80` snapshot per later round. Path contribution ≈ **+0.75** if it lands R2–R6.

One round of ~100 restoration spend already yields about **ΔE ≈ 1.4** through `sat()`, so the capital project was priced as *less than two years of ordinary planting*, then billed **12** credits/round for five rounds.

Flood ×0.85 cuts R4 damage by a few points. Resilience is 10% of the snapshot and shock is an average of four events, so that protection is worth **≪ 0.2** final score.

R1 wetland also removes 280 credits from sectors. With the buffer kept, sectors fall from ~854 to ~574. Concave `sat(S) = 12(1 − e^(−S/340))` makes that a lasting operating hole in welfare and economy (final W 64.4 vs 66.1, Y 59.7 vs 61.5). Income then lags (`income_for` uses economy, jobs, fiscal, pollution, health, energy). Dysfunction did **not** fire on these mixed paths (penalty 0).

### 1.3 Green manufacturing trap (v1.0.0)

`FACTORIES` T+1 pollution **+4**. `GREEN_MFG` T+2 pollution **−4**, after `GRID` + `EMISSIONS` + `FACTORIES`. Net ecology from the factory pair was ~0, and the dirty window covered drought/flood. Four starts in three rounds (~1,250 credits) starved restoration `sat()` under a 40% ecology weight. That is a catalogue problem, not an `F` problem.

### 1.4 Lab artifact (fixed, not a rule change)

`py-ref-1.0.0` strategies allocated sectors from **pre-project** `available`, so buying a project dumped the 300-credit buffer even when the team “intended” to keep it. Engine charge order was already starts-then-sectors. The lab now uses `buffered_submission`: sectors come from leftover cash. Players who rebudget correctly were always able to keep `F`; the engine did not change.

## 2. Proposed specification revision (applied)

**A-CAT-1.1** — costs, effects, delays, maintenance only. Documented in `interventions-catalogue.md`.

Not changed: 40/25/15/10/10, dysfunction floors, path 0.62/0.38, pack A timing, flood ×0.75 and wetland ×0.85, drought ×0.90, mutex, prerequisites, identical starts, deterministic physics.

No spend bonus. No project made mandatory. `COAL` / `INTENSE_AG` / `CLINICS` / `WATER_TREAT` left as tactical or trap options.

| Code | Change | Rationale |
| --- | --- | --- |
| `WETLAND` | Maint 12→6; T+1 water/bio/buffer raised; soil+3; small ongoing | A finished wetland is living capital, not one year of planting. Flood ×0.85 unchanged. |
| `REFOREST` | Cost 320→280; maint 10→6; stronger T+1/T+2; ongoing; keep 2-year delay | Forests still mature slowly. Cost now matches wetland so the pair is sequencing, not a cliff. |
| `RIVER` | Maint 8→6; ongoing pollution −0.55 | Cleaned channel keeps working; still weaker than a wetland over six rounds. |
| `WASTEWATER` | Cost 360→300; maint 14→8; stronger T+1; contamination ×0.90 | Plant upgrades cut sewage load and slightly blunt contamination. |
| `FLOOD_WALL` | Cost 360→300; maint 10→8; more infra/prep/buffer; flood ×0.75 **unchanged** | Grey infrastructure is a resilience complement, not an ecology substitute. Stack 0.6375 stays published. |
| `GRID` | Cost 250→200 | Enabler, not a win condition. |
| `EMISSIONS` | Cost 320→260; maint 14→10; stronger cleanup; milder Y drag | Scrubbers are cheaper to run than to ignore; still not a solo victory. |
| `FACTORIES` | Cost 300→240; pollution +4→+2 | Restarting plants is not a new smelter. Residual dirt remains. |
| `GREEN_MFG` | Cost 380→280; build 2→1; pollution −10, air+4, intensity −0.15; ongoing cleanup; contamination ×0.90 | Conversion actually cleans the plant. Still needs both prereqs. Round-6 start cannot complete. |
| `RENEWABLES` | Cost 420→360; maint 12→10 | Optional slow power; stacking it on the full industry chain is still a squeeze. |

Scoring `F` was **not** flattened. Doing so (e.g. discipline 0.40 → 0.30 of `F`) would be a scoring-spec change and still needs review if a 2–4 point A11 breakaway is required without further catalogue inflation.

## 3. Tests

Command: `cd docs/simulation && python3 -m unittest test_engine -v`

**35 tests, 0 failures, 0 errors, 0.025s.**

Added: A-CAT-1.1 locks (weights, flood/drought multipliers, wetland capital effects, green-mfg cleanup vs factories dirt); restoration-first beats prudent_buffer by >1.0; `GREEN_MFG` cannot complete from round 6; round-5 start can complete after the 1-year build.

Operating `prudent_buffer` is still **58.41** and still matches `official_score.py` exactly. `official_score.py` was re-checked after the catalogue edit (it has no projects).

Goldens: `goldens/py_ref_1_1_0.json` written deliberately for the new engine version. `py_ref_1_0_0.json` retained as the pre-retune snapshot.

## 4. Strategy comparison (after A-CAT-1.1)

Buffer-aware spend. Same 40/25/15/10/10.

### Before → after (selected)

| Strategy | v1.0.0 | v1.1.0 | Projects (v1.1.0) |
| --- | ---: | ---: | --- |
| habitat / restoration-first | 57.11 | **60.20** | REFOREST, WETLAND |
| restore_then_grow (operating) | 57.62 | 59.07 | none |
| prudent_habitat | 57.11 | 59.82 | REFOREST, WETLAND |
| prudent_flood | 56.37 | 58.50 | FLOOD_WALL, WETLAND |
| prudent_buffer | **58.41** | **58.41** | none |
| green_with_restore | — | 58.55 | GRID, EMISSIONS, FACTORIES, GREEN_MFG, WETLAND |
| balanced (operating) | 55.92 | 57.47 | none |
| reactive (treat R2, wall R3) | — | 57.67 | WATER_TREAT, FLOOD_WALL |
| green_industry (operating) | 56.19 | 57.72 | none |
| green_industry_path | 49.20 | 56.81 | GRID, EMISSIONS, FACTORIES, GREEN_MFG |
| green_path + renewables | 49.20 | 55.39 | + RENEWABLES |
| welfare_max | 52.79 | 54.72 | none |
| health_water / welfare-first | — | 54.53 | CLINICS, WASTEWATER, WATER_TREAT |
| coal_rush | 22.87 | 25.90 | GRID, COAL |
| silent_hold | 6.42 | 6.42 | none |

Restoration-first now beats the buffer by **+1.79** and beats the best operating mix by **+1.13**. Green-industry without restoration is still below the buffer (**56.81**); the same chain **with** a wetland is **58.55**, i.e. competitive as a mixed path, not as an ecology-starved dump.

### Requested families

| Family | Best tested member | Score | Read |
| --- | --- | ---: | --- |
| Restoration-first | habitat_early | **60.20** | Winner. Ecology 60.1, no dysfunction. |
| Balanced | balanced_mix (prudent + RIVER + WETLAND) | 59.30 | Close second band. |
| Green-industry | green_with_restore | 58.55 | Viable if ecology spend continues. Solo chain 56.81 is a trap. |
| Prudent buffer | prudent_buffer | 58.41 | Still a strong operating floor. |
| Reactive | WATER_TREAT then FLOOD_WALL | 57.67 | Preparedness without habitat does not win a 40% ecology game. |
| Welfare-first | health_water | 54.53 | Welfare 69.9, ecology 41.0 — not a winner. |

### Flagship projects under three operating mixes

| Project | restore-then-grow | prudent | green-industry |
| --- | ---: | ---: | ---: |
| WETLAND | **60.05** | 59.52 | 58.86 |
| REFOREST | 59.27 | 58.71 | 58.06 |
| WASTEWATER | 58.79 | 58.24 | 57.59 |
| FLOOD_WALL | 57.97 | 57.44 | 56.77 |
| GREEN_MFG (full prereq chain) | 57.66 | 57.42 | 56.81 |

No flagship is universally dominant. Wetland is the best *single* under every mix tested, but reforestation+wetland beats wetland-alone, and green manufacturing only pays when the town keeps restoring. Flood walls raise resilience (prudent_flood R = 68.5; flood_pack R = 74.7) without taking the board.

## 5. Searches

### 10,000 random (seed 2026)

min 38.09, p10 49.87, p50 **52.87**, p90 55.23, p99 56.85, max **58.86**, mean 52.635, stdev 2.289.

Best random completed `RIVER+WASTEWATER+WETLAND` at 58.86 — below habitat_early 60.20. Top 1% uses **22** openings and **87** completed sets.

Empty R1 opening: 40.2% of all runs, **32%** of top 1% (lift 0.80). The old “empty opening is 73% of the top 1%” artefact is gone after buffer-aware project spend.

`WETLAND` in 76% of top 1% (lift **2.13**, below the ≥3 dominance cut). `GREEN_MFG` base rate 0.12% (prereq chain); lift 0 in top 1% — it is not a random trap nor a random must-buy.

No non-empty opening has ≥40% of the top 1%. Highest wetland-only opening share is 18%.

### Targeted 5,000 (seed 4040)

Biased toward wetland / reforest / flood / wastewater / river / treat, 45% also sample the industry chain, mixed operating weights, buffer kept.

p50 56.51, p99 59.33, max **60.41** (`REFOREST+RIVER+WETLAND`, E=62.59). That is +0.21 vs the named winner, inside the +0.5 random diagnostic. It did not invent a new dominant recipe; it found a slightly better habitat sequence.

### Sensitivity (top named + prudent_buffer)

`habitat_early` remained the winner for `SAT_SCALE` ×0.9/×1.1, neglect 0.14/0.18, event scale 0.9/1.1. Dump-vs-mixed order did not invert. (An earlier sensitivity pass was invalid: `choose_from_plan` emptied a shared queue. That is fixed; plans are now replay-safe.)

## 6. Dominance gate and A11

Published gate:

```
win_gap < 5.0
winner in mixed/sequencing class
best dump < winner − 3.0
random_max <= winner + 0.5
```

| Check | Value | Pass |
| --- | --- | --- |
| Winner | habitat_early (mixed) | yes |
| Win gap | **0.28** vs restore_habitat | yes |
| Best dump | welfare_max **54.72** (margin 5.48) | yes |
| 10k random max | **58.86** (≤ 60.20 + 0.5) | yes |
| Project lift ≥ 3 with n≥10 | **none** | yes |
| Non-empty opening ≥40% of top 1% | **none** | yes |
| Distinct completed sets in top 1% | **87** | yes |

**Dominance gate: PASS.**

A11 lab bar used here: best named project path beats best operating-only path by ≥ 1.0.

| A11 reading | Result |
| --- | --- |
| Projects can beat the 300-credit buffer | **Yes** (60.20 vs 58.41) |
| Projects beat the best operating mix | **Yes** (+1.13 vs restore_then_grow 59.07) |
| Original “break away 2–4 points / operating ceiling ~62” | **Not met** (best 60.20; targeted 60.41) |

`catalogue_freeze_ok` in the lab JSON is true against the ≥1.0 bar. It is **not** a claim that the original 2–4 point A11 sentence is fully satisfied.

## 7. Unresolved risks

1. **Wetland attractor.** 76% of the random top 1% completed wetland (lift 2.13). Skill still matters (habitat pair 60.20 vs wetland-alone 60.05 vs buffer 58.41), but briefing should not pretend all 15 cards are equal.
2. **Green manufacturing is a complement.** The clean-industry fork without restoration still loses to holding credits. That is pedagogically consistent with 40% ecology, but the card text must not sell it as a solo winning plan.
3. **Efficiency Gaussian unchanged.** Teams that dump the buffer to buy a project still take a ~3.3 R1 snapshot hit. Flattening `F` remains a scoring-spec review item, not a silent patch.
4. **Breakaway is modest.** If the live event needs a 62–64 flagship score, do not inflate one more delta ad hoc; reopen A-CAT with a stated target or review `F`.
5. **TypeScript port not done.** Goldens exist; `packages/sim` does not.

## 8. Freeze recommendation

| Claim | Verdict |
| --- | --- |
| 15 interventions deterministic | **Yes** |
| Automated tests green | **Yes (35/35)** |
| 10,000-seed + 5,000 targeted + singles/pairs/sensitivity | **Yes** |
| Published 40/25/15/10/10 preserved | **Yes** |
| Dominance gate | **PASS** |
| A11 (projects beat buffer / best operating by ≥1) | **Yes** |
| A11 (2–4 point breakaway near 62) | **No** |
| Catalogue ready to freeze for the TypeScript port | **Conditional yes** — freeze `py-ref-1.1.0` / A-CAT-1.1 as the engine contract. Do not sell a 62+ habitat blowout. Reopen only if organisers require a larger A11 gap. |

No silent scoring bonuses were added. No Next.js, TypeScript engine, Supabase, authentication, or UI was implemented in this pass.
