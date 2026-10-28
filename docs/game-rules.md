# Game rules

Status: canonical player-facing rules. Coefficients live in `simulation-model.md`.

## 1. Competition shape

- 20 teams, seats 1–20, pre-created by the organiser.
- Shared town: **Ashfen**. Currency: **credits**.
- **6 rounds**. Each round is one game-year.
- Real clock: **18 minutes** to decide, then the server locks, processes all 20 towns, and publishes together.
- Recommended live session: 20 min briefing + 6 × 20 min + 20 min debrief.

## 2. What a team does each round

While the round status is `open`:

1. Inspect the published state of their own town. The 20-town board is organiser-only.
2. Split **available credits** across eight operating sectors.
3. Optionally start up to **two** interventions from the catalogue.
4. Save as often as they like. The last **accepted** server write before `closes_at` counts.

Sectors: restoration, pollution control, water, energy, agriculture, industry, infrastructure, public services.

Available credits are computed by the server:

```
available = max(0, reserve + income − intervention_maintenance)
```

Income uses the published formula in `simulation-model.md`. Client totals are ignored.

Unspent credits become next round’s **reserve**. There is no interest.

Charge order (server): accepted intervention starts in listed order, then sector spend, then remainder to reserve. If starts do not fit, drop the last-listed start until they do.

## 3. Interventions

- Only catalogue codes are legal.
- Prerequisites and mutex groups are checked against **pre-round** state, identical for processing order.
- Build time 0, 1, or 2 rounds. Effects land when specified (immediate, T+1, T+2).
- Maintenance is paid every later round while the asset exists.
- Invalid starts are dropped, logged, and their cost is not charged. Sector spend still applies.
- Interventions cannot be cancelled after lock.

Full list: `interventions-catalogue.md`.

## 4. Events

Pack A is public before round 1:

| Round | Event |
| ---: | --- |
| 1 | None (recovery grant in income) |
| 2 | Heatwave |
| 3 | Drought |
| 4 | Flood |
| 5 | Pollution incident |
| 6 | None (final operating year) |

The event is the same for every team. Damage depends on that team’s state. Formulas: `environmental-events.md`.

## 5. Simultaneous resolution

Server order, every round, every team:

1. Drift / decay
2. Delayed effects from previous rounds
3. Income and `available`
4. Apply the team’s locked submission (or the default hold)
5. Round event
6. Write reserve
7. Snapshot score

Results publish only when all 20 writes succeed and a checksum matches a replay.

## 6. Default hold (abandoned or silent team)

If there is no accepted submission at lock:

- Zero new interventions
- Zero sector spend
- 100% of `available` held as reserve

This is explicit neglect, not a bye. Drift, events, and maintenance still run.

## 7. Invalid submissions

- Unknown fields or codes → rejected, previous accepted row (if any) remains.
- Overspend → server scales sector spend down; excess project starts dropped by listed order until the budget fits.
- More than two starts → extras dropped in listed order.
- After `closes_at` → stored as `late`, ignored.

## 8. Isolation

Teams never see another team’s allocations, intervention queue, unpublished scores, or the 20-town board. After each round is `published` they see their **own** official pillar scores and own town. Official standings are organiser-only.

## 9. Ranking

Official score out of 100 after round 6 (`scoring-system.md`). Places 1–3 are the top three scores.

Tie-break, in order: higher ecology category, lower mean event damage, lower seat number.

Disqualification removes the team from ranking. Their town may still process so the field stays at 20 checksums.

## 10. What players are told

The rulebook shown in `/rules` includes this file’s summary, the catalogue, the score formula, pack A, and the engine version string. No hidden modifiers.
