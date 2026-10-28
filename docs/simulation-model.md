# Simulation model

Status: canonical physics. Implementation reference: `docs/simulation/score_lab.py` (town update) and `docs/simulation/official_score.py` (pack A events + official score).

## Honesty label

| Kind | Meaning |
| --- | --- |
| **Principle** | Qualitative relationship that is standard in environmental teaching (pollution can harm health; restoration is slow; flood risk depends on land and infrastructure). Not quantified from a named study. |
| **Assumption** | Game coefficient chosen for fairness and teaching. Must not be described as empirical. |

This model is **not** a digital twin of a real catchment, grid, or labour market.

## State vector

All indices are clamped to `[0, 100]` except `reserve` (credits), `population` (people), and mix flags (`dirty_energy`, `green_energy`, `intensive_ag`, `regenerative_ag`, `industrial_intensity`) clamped to their documented ranges.

| Code | Start | Notes |
| --- | ---: | --- |
| `air` | 32 | Principle: emissions affect air. |
| `water_q` | 38 | Quality and usable supply, combined for tractability (**assumption**). |
| `soil` | 36 | |
| `bio` | 28 | Biodiversity / habitat. |
| `pollution` | 68 | Higher is worse. |
| `health` | 44 | Lags air and water (**assumption**: 0.18 tracking rate). |
| `services` | 48 | Housing and civic capacity. |
| `jobs` | 46 | Livelihoods. |
| `economy` | 50 | Productive activity. |
| `fiscal` | 52 | Municipal books. |
| `energy` | 42 | Reliability, not kWh. |
| `infra` | 46 | Roads, drainage, built fabric. |
| `prep` | 30 | Preparedness / emergency services. |
| `buffer` | 26 | Ecological buffer. Used by events; **not** a direct scoring term in two categories. |
| `reserve` | 220 credits | |
| `population` | 50,000 | Display + dysfunction gate. |
| `dirty_energy` | 1.0 | Post-disaster thermal mix. Range 0–1.5. |
| `green_energy` | 0.0 | Range 0–1.5. |
| `intensive_ag` | 0.4 | Range 0–1.2. |
| `regenerative_ag` | 0.1 | Range 0–1.2. |
| `industrial_intensity` | 0.45 | Range 0.1–1.4. |

Hidden mix flags appear in the UI as qualitative badges, not raw floats.

## Update order (must not change)

For round `n`, Phase 1 reference engine (`docs/simulation/engine.py`):

1. `apply_drift`
2. Project delayed landings (mark completions)
3. Operating delayed landings
4. Ongoing effects of projects completed in a **previous** round
5. `income_for` → `available = max(0, reserve + income − maintenance)`
6. Resolve intervention starts (prereq/mutex vs completed+building, max 2), charge starts, then scale sector spend
7. Immediate project effects; queue later landings
8. `apply_event_pack_a` (multipliers only if already completed)
9. `reserve = unspent`
10. Official snapshot

Charge order is starts-then-sectors (`game-rules.md`, `interventions-catalogue.md`). Maintenance begins the round after a start. Ongoing effects begin the round after completion.

Identical inputs must yield identical outputs. No `Math.random`, no wall-clock inside the engine.

## Income (**assumption**)

```
income = 180
       + (180 if n == 1 else 0)
       + 8.6 * economy
       + 3.2 * jobs
       + 1.6 * fiscal
       − 0.45 * pollution
       − 0.40 * (100 − health)
       − 0.30 * (100 − energy)
```

Round 1 grant is disaster-recovery funding in the fiction, not a real grant programme.

## Diminishing returns (**assumption**)

```
sat(S) = 12 * (1 − exp(−S / 340))
```

Dumping 800 credits into one sector yields less than splitting 400 + 400 where synergies exist. This is a balance tool, not a production function.

## Synergies (**assumption**, motivated by principles)

- Restoration is slightly stronger when pollution control is also funded.
- Industry is weaker if energy or infrastructure is low.
- Agriculture is weaker if water is low.
- Public services are weaker if fiscal health is low.
- Energy spend shifts the mix greener only if energy spend ≥ industry spend that round.

## Neglect threshold (**assumption**)

If, of credits actually spent this round:

- industry + energy + agriculture < 16% → economy, jobs, fiscal fall
- restoration + pollution control + water < 16% → pollution, bio, air worsen

Published in the rulebook so it is not a secret gotcha.

## Delayed effects (**principle**: habitat and some investment lag; **assumption**: one round)

Queued from operating restoration (and some industry/infra) and from interventions with `build_rounds > 0`. Industry **pollution is immediate**.

## Interventions

See `interventions-catalogue.md`. They add documented deltas after operating spend, then maintenance is reserved from next income.

## Bounds and invariants

- Indices never leave `[0, 100]`.
- `available` after normalisation is ≥ 0.
- Sector spend + accepted new intervention costs ≤ `available`.
- Population stays in `[42000, 56000]` under current drift rules.
- Engine must not read other teams.

## Testing the physics

Python goldens: `docs/simulation/goldens/py_ref_1_1_0.json`. TypeScript port: `packages/sim` (Vitest parity tests). Event tests use pack A in `engine.py` / `packages/sim`. Do not mix the historical supply-shock event from the first lab into production.
