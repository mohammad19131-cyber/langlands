# Interventions catalogue

Status: canonical v1.1 (revision **A-CAT-1.1**, engine `py-ref-1.1.0`). **15** interventions. Max **2 starts per round**, so a team cannot buy the tree (12 starts maximum across 6 rounds).

v1 numbers underperformed a 300-credit operating buffer (assumption A11). This revision changes **costs, effects, delays and maintenance only**. Scoring weights, event schedule, flood/drought multipliers already published, mutex, and prerequisites are unchanged except `GREEN_MFG` build time (2 → 1) as documented below.

Effects are **game units** added to town variables. They are assumptions, not measured field results.

## How they attach to the engine

After operating allocations:

1. Validate codes, copies, mutex, prerequisites against **pre-round** state.
2. Charge cost from remaining `available` (after sector spend, or with sector spend — see below).
3. If `build_rounds == 0`, apply `immediate_effects` this round before the event.
4. Else queue delayed effects for T+`build_rounds`.
5. From the next round, add `maintenance_per_round` to the maintenance bill.
6. `ongoing_effects` apply each later round after completion.

**Budget composition (recommendation, frozen):** teams choose sector integers and a list of starts. Server charges starts first (listed order), then sectors, then remainder is reserve. If starts exceed `available`, drop last-listed starts.

## Mutex groups

| Group | Members | Rule |
| --- | --- | --- |
| `ENERGY_BASELOAD` | `COAL`, `RENEWABLES` | At most one owned. Starting the other is rejected. |
| `AGRI_PUSH` | `REGEN_AG`, `INTENSE_AG` | At most one owned. |

## Catalogue

| Code | Name | Sector | Cost | Build | Maint | Prereq | Immediate | Delayed / ongoing / event |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| `WETLAND` | Wetland restoration | restoration | 280 | 1 | 6 | — | — | T+1: water_q+7, bio+10, soil+3, buffer+8. ongoing: water_q+0.35, bio+0.30, buffer+0.20. Flood damage ×0.85 |
| `REFOREST` | Reforestation | restoration | 280 | 2 | 6 | — | — | T+1: air+5. T+2: bio+11, soil+6, buffer+6. ongoing: air+0.25, bio+0.25, soil+0.15 |
| `RIVER` | River cleanup | restoration | 240 | 0 | 6 | — | water_q+5, pollution−4 | ongoing: pollution−0.55 |
| `EMISSIONS` | Industrial emissions control | pollution_control | 260 | 1 | 10 | — | — | T+1: pollution−8, air+4. ongoing: pollution−0.9, economy−0.2 |
| `WASTEWATER` | Wastewater upgrade | pollution_control | 300 | 1 | 8 | — | — | T+1: water_q+7, pollution−7, health+5. Contamination damage ×0.90 |
| `WATER_TREAT` | Emergency water treatment | water | 200 | 0 | 10 | — | water_q+6, health+2 | Drought damage ×0.90 |
| `GRID` | Grid repairs | energy | 200 | 0 | 8 | — | energy+6, infra+2 | Enables `COAL`, `RENEWABLES`, `FACTORIES` |
| `COAL` | Emergency thermal restart | energy | 280 | 0 | 18 | `GRID`, mutex energy | energy+8, economy+4, pollution+7, air−4 | ongoing: dirty_energy+, pollution+0.8 |
| `RENEWABLES` | Wind and solar park | energy | 360 | 2 | 10 | `GRID`, mutex energy | — | T+2: energy+7, pollution−3, buffer+2, green_energy+ |
| `REGEN_AG` | Regenerative farming | agriculture | 260 | 1 | 9 | mutex agri | regenerative_ag+ | T+1: soil+5, bio+3, economy+2 |
| `INTENSE_AG` | Intensive yield push | agriculture | 240 | 0 | 11 | mutex agri | economy+5, jobs+4, soil−3, water_q−3, pollution+3 | ongoing: intensive_ag+ |
| `FACTORIES` | Repair factories | industry | 240 | 1 | 12 | `GRID` | — | T+1: economy+5, jobs+4, pollution+2, industrial_intensity+ |
| `GREEN_MFG` | Green manufacturing conversion | industry | 280 | 1 | 10 | `EMISSIONS`, `FACTORIES` | — | T+1: economy+6, pollution−10, jobs+4, air+4, industrial_intensity−. ongoing: pollution−0.70, economy+0.30. Contamination ×0.90 |
| `FLOOD_WALL` | Flood defences | infrastructure | 300 | 1 | 8 | — | infra+5, prep+6 | T+1: buffer+7. Flood damage ×0.75 |
| `CLINICS` | Clinics and emergency services | public_services | 240 | 0 | 12 | — | health+6, prep+3 | ongoing: health+0.4. Contamination damage ×0.85 |

## Strategic roles (why 15, not 40)

| Purpose | Codes |
| --- | --- |
| Slow ecology that misses late starters | `WETLAND`, `REFOREST` |
| Fast water / pollution | `RIVER`, `WATER_TREAT`, `WASTEWATER` |
| Energy fork | `COAL` vs `RENEWABLES` after `GRID` |
| Food fork | `INTENSE_AG` vs `REGEN_AG` |
| Industry fork | `FACTORIES` then optional `GREEN_MFG` |
| Named shocks | `FLOOD_WALL`, `CLINICS`, `WATER_TREAT` |
| Compliance path | `EMISSIONS` |

## Principles vs assumptions

- **Principle:** wetlands and forests do not appear overnight; thermal generation is faster to restart than a new renewable park; intensive yield can stress soil and water.
- **Assumption:** every integer in the table, every ×0.85 event modifier, every maintenance figure.

## Anti-trivial rules

- Cannot own both energy baseloads or both agri pushes.
- `GREEN_MFG` still requires two prior assets (`EMISSIONS`, `FACTORIES`). A round-6 start cannot complete. A-CAT-1.1 shortened build from 2 to **1** so a conversion started in round 3 lands before contamination; round-5 cosmetics can still complete on the last snapshot, but path-mean (0.38) punishes the delay.
- Maintenance makes collecting every cheap asset irrational.
- Two starts per round forces sequencing.

## Revision A-CAT-1.1 (rationale)

Lab finding (`py-ref-1.0.0`): holding ~300 credits scored **58.41**; wetland on the same operating mix scored **57.97** even when the buffer was preserved; the advertised green-industry chain scored **49–53**. The 300-credit efficiency Gaussian is **not** the whole gap (discipline at 0 vs 300 is 3.31 snapshot points per round, but only if the team dumps the reserve). After rebudgeting sectors from leftover cash, projects still lost because delayed catalogue deltas were smaller than one round of `sat()` restoration spend, then maintenance taxed later operating.

Scoring formula was **not** changed (that would need a separate review). Changes below are catalogue-only.

| Code | Change | Why (environmental / gameplay, not a spend bonus) |
| --- | --- | --- |
| `WETLAND` | Maint 12→6; T+1 water/bio/buffer raised; add soil+3; add small ongoing | A completed wetland is a living capital asset, not one year of planting. Upkeep of an established marsh is cheaper than construction. Flood ×0.85 **unchanged**. |
| `REFOREST` | Cost 320→280; maint 10→6; T+1/T+2 ecology raised; add ongoing; keep 2-year delay | Forests still mature slowly. Cost now matches wetland so the pair is a sequencing choice, not a cash cliff. |
| `RIVER` | Maint 8→6; ongoing pollution −0.40→−0.55 | A cleaned channel keeps working; still weaker than a wetland as a six-round ecology engine. |
| `WASTEWATER` | Cost 360→300; maint 14→8; stronger T+1 water/pollution/health; contamination ×0.90 | Plant upgrades cut sewage load and slightly blunt the contamination shock. Not a flood tool. |
| `FLOOD_WALL` | Cost 360→300; maint 10→8; infra/prep/buffer raised; flood ×0.75 **unchanged** | Grey infrastructure still does not raise ecology much; it is a resilience complement to wetlands, not a substitute. Stack 0.75×0.85 remains published. |
| `GRID` | Cost 250→200 | Repairing the grid is an enabler, not a win condition; v1 priced the whole energy/industry tree as a trap. |
| `EMISSIONS` | Cost 320→260; maint 14→10; stronger cleanup; milder economy drag | Scrubbers are cheaper to run than to ignore, but still not a solo victory. |
| `FACTORIES` | Cost 300→240; maint 14→12; pollution +4→+2; economy +4→+5 | Restarting existing plants is not a new smelter. Residual dirt remains so conversion still matters. |
| `GREEN_MFG` | Cost 380→280; build 2→1; maint 12→10; pollution −10 and air+4 at T+1; intensity −0.15; ongoing cleanup; contamination ×0.90 | Conversion actually cleans the plant instead of merely undoing the factory bump two years later. Still requires both prereqs, so last-round greenwash cannot skip the chain. |
| `RENEWABLES` | Cost 420→360; maint 12→10 | Slow clean power remains optional; stacking it on the full industry chain is still a cash squeeze. |

Unchanged on purpose: `WATER_TREAT`, `CLINICS`, `COAL`, `REGEN_AG`, `INTENSE_AG`, mutex groups, flood/drought multipliers, 40/25/15/10/10, dysfunction floors, pack A timing.

## Mix-flag magnitudes (Phase 1 assumption A-MIX-1)

The table’s “+” mix fields had no numbers. The reference engine uses these documented assumptions (not extra scoring bonuses):

| Code | Mix field | When | Delta |
| --- | --- | --- | ---: |
| `COAL` | `dirty_energy` | immediate | +0.25 |
| `COAL` | `dirty_energy` | ongoing | +0.05 |
| `RENEWABLES` | `green_energy` | T+2 | +0.40 |
| `REGEN_AG` | `regenerative_ag` | immediate | +0.30 |
| `INTENSE_AG` | `intensive_ag` | immediate | +0.30 |
| `INTENSE_AG` | `intensive_ag` | ongoing | +0.05 |
| `FACTORIES` | `industrial_intensity` | T+1 | +0.20 |
| `GREEN_MFG` | `industrial_intensity` | T+1 | −0.15 |

Implemented in `docs/simulation/engine.py`. Do not treat these as empirical.

A-CAT-1.1 added the `GREEN_MFG` intensity reduction: conversion lowers plant intensity rather than granting a hidden score bonus.

## Simulation status

The 15 interventions are in the Phase 1 Python engine (`py-ref-1.1.0`). Operating-only scores still match `official_score.py`. Catalogue freeze recommendation is in `docs/simulation/balance-report.md`.
