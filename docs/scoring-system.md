# Scoring system

Status: canonical official score. Lab: `docs/simulation/official_score.py`.

Proposed structure accepted and **tested**: 40 / 25 / 15 / 10 / 10.

## Categories (100 points)

| Category | Weight | Measurable index | What it is not |
| --- | ---: | --- | --- |
| Ecological recovery | 40 | `E = (air + water_q + soil + bio + (100 − pollution)) / 5` | Not health, not cash, not prep |
| Public welfare | 25 | `W = (health + services + jobs) / 3` | Not air/water themselves (those act through health with lag) |
| Economic stability | 15 | `Y = (economy + fiscal + energy) / 3` | Not jobs (jobs sit in welfare) |
| Crisis resilience | 10 | `R = 0.5 * (0.5·prep + 0.5·infra) + 0.5 * shock` | Not `buffer` (buffer only changes event damage, an interaction) |
| Resource efficiency | 10 | `F` defined below | Not ecological outcomes (avoids double-counting restoration) |

`shock = 100 − mean(damage of events that have already occurred with damage > 0)`. Before round 2, `shock` falls back to the prep/infra index so round 1 does not hand out a free 100.

All indices are 0–100 before weighting.

## Resource efficiency `F` (**assumption**)

Cash is scored **only here**, not inside resilience.

```
discipline = 100 * exp(−(reserve − 300)² / (2 * 160²))     # working buffer, not a vault
waste      = sum(max(0, S_sector − 520)) / max(spent, 1)  # spend past the flat sat() region
waste_score = 100 * (1 − waste)
yield_score = 100 * Σ_i S_i * exp(−S_i / 340) / Σ_i S_i   # keep spend on the slope of sat()

F = clamp(0.40 * discipline + 0.35 * waste_score + 0.25 * yield_score)
```

Hoarding thousands of credits tanks `discipline`. Dumping 900 credits in one sector tanks `waste_score` and `yield_score`. Holding about **300 credits** is the published fiscal target, not a secret.

## Double-counting controls

| Risk | Control |
| --- | --- |
| Buffer in ecology and resilience | `buffer` is not a category term. It only reduces event damage, which then appears in `shock`. |
| Reserve in resilience and efficiency | Reserve appears only in `F`. |
| Health counted as ecology | Health is welfare-only. Air/water remain ecology. |
| Energy counted twice | Energy reliability is economy-only. Preparedness is resilience-only. |
| Restoration giving ecology + efficiency | Efficiency uses spend shape and reserve, not Δecology. |

## Dysfunction penalties (applied to the 100-point snapshot)

A town must not rank highly while collapsing. After the weighted sum:

```
penalty = 0
if E < 36: penalty += 0.62 * (36 − E)
if W < 40: penalty += 0.50 * (40 − W)
if Y < 40: penalty += 0.70 * (40 − Y)
if (0.5·prep + 0.5·infra) < 32: penalty += 0.35 * (32 − that)
if population < 47_000: penalty += 8

snapshot = clamp(0.40E + 0.25W + 0.15Y + 0.10R + 0.10F − penalty, 0, 100)
```

Starting `E ≈ 33.2`, so early snapshots carry a small ecology penalty until recovery begins. That is intended.

## Path (anti last-round cosmetics)

```
final_score = round(0.62 * snapshot_6 + 0.38 * mean(snapshot_1..6), 2)
```

Rounding: banker’s rounding as in Python 3 `round` for .xx, displayed to two decimals. Ties after that use the rule below.

## Tie-break

1. Higher final ecology index `E` after round 6
2. Lower mean event `damage` (rounds 2–5)
3. Lower seat number (1 before 20)

Published in the player rulebook.

## Laboratory result (operating spend only, 15-project catalogue not yet applied)

Command: `python3 docs/simulation/official_score.py`

| Finding | Value |
| --- | --- |
| Winner | `prudent_buffer` **58.41** |
| Runner-up | `restore_then_grow` **57.62** |
| Win gap | **0.79** |
| `grow_then_restore` | **51.53** (early shocks punish delay of ecology) |
| Best dump | `welfare_max` **52.79** |
| `eco_max` | **50.26** (economy penalty 7.79) |
| `industry_max` | **23.13** |
| 400 random strategies | max **58.00**, median **53.12** — none beat the best mixed path |

Conclusion: the 40-point ecology weight does **not** create an ecology dump victory, because dysfunction penalties and the 16% productive-spend rule collapse `Y`. Long-term sequencing beats boom-then-clean. Random search did not find a hidden dominant recipe in operating space.

**Open test:** the 15 interventions are not in this Python lab yet. Phase 1 TypeScript engine must re-run dominance tests with projects before freeze. See `testing-and-game-balance.md`.

## Display

UI shows five category bars, the penalty line, snapshot, and (after publish) `final_score` so far. Client-computed copies must be labelled unofficial.
