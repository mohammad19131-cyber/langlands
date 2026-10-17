# Environmental events

Status: canonical scenario **pack A**. Implementation: `apply_event_pack_a` in `docs/simulation/official_score.py`.

## Design rules

- The schedule is public before round 1.
- Every team receives the same event in the same round.
- Damage is a deterministic function of that team’s state. Preparation changes impact; luck does not.
- No per-team random draws, no hidden “this seat floods harder”.

## Schedule

| Round | Code | Fiction | Why it exists |
| ---: | --- | --- | --- |
| 1 | — | Recovery grant year | Time to start delayed projects before the first shock |
| 2 | `HEATWAVE` | Extreme heat | Tests water, habitat, health, energy reliability |
| 3 | `DROUGHT` | Prolonged dry spell | Tests water/soil stores and food economy |
| 4 | `FLOOD` | Runoff and inundation | Tests infrastructure, buffer, pollution runoff |
| 5 | `CONTAMINATION` | Pollution / public-health incident | Tests remaining pollution load and clinics |
| 6 | — | Final operating year | Delayed assets can still land; no last-second shock lottery |

## Formulas (**assumption**)

Damage is `max(0, formula)` then used both to mutate state and to feed `shock` in the resilience category.

### Round 2 — Heatwave

```
damage = 10
       + 0.20 * (100 − water_q)
       + 0.16 * (100 − bio)
       + 0.18 * (100 − prep)
       − 0.10 * buffer

water_q  -= 0.16 * damage
health   -= 0.14 * damage
energy   -= 0.08 * damage
buffer   -= 0.06 * damage
```

### Round 3 — Drought

```
damage = 11
       + 0.24 * (100 − water_q)
       + 0.16 * (100 − soil)
       + 0.12 * (100 − prep)
       − 0.08 * buffer

water_q  -= 0.20 * damage
soil     -= 0.12 * damage
economy  -= 0.10 * damage
bio      -= 0.08 * damage
jobs     -= 0.06 * damage
```

`WATER_TREAT` multiplies this damage by 0.90 after completion.

### Round 4 — Flood

```
damage = 12
       + 0.20 * (100 − infra)
       + 0.18 * (100 − buffer)
       + 0.12 * (100 − soil)
       + 0.10 * (pollution − 40)
       − 0.10 * prep

infra    -= 0.16 * damage
soil     -= 0.10 * damage
water_q  -= 0.14 * damage
services -= 0.08 * damage
economy  -= 0.07 * damage
```

`FLOOD_WALL` multiplies by 0.75. `WETLAND` multiplies by 0.85. If both owned, multiply both (0.6375). That stack is published, not secret.

### Round 5 — Contamination

```
damage = 9
       + 0.24 * (pollution − 35)
       + 0.16 * (100 − water_q)
       + 0.12 * (100 − health)
       − 0.10 * prep

health -= 0.18 * damage
jobs   -= 0.08 * damage
fiscal -= 0.06 * damage
air    -= 0.05 * damage
```

`CLINICS` multiplies by 0.85.

## What this sequence does strategically

- Early ecology spend reduces heat and drought damage (so `restore_then_grow` beat `grow_then_restore` by ~6 points in the lab).
- Mid-game infrastructure and wetlands matter for the flood.
- A dirty boom is punished on round 5 even if money looks good.
- Round 6 without an event lets T+2 parks and conversions complete instead of being lottery-wiped.

## Pack B

A future pack is a **new engine version** and a new public PDF. It must never replace pack A mid-competition.

## Historical note

`docs/simulation/score_lab.py` still contains an older round-3 *supply-chain shock*. That event is **not** pack A. Production must call `apply_event_pack_a` only.
