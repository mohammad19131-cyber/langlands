# Langlands R3 — credits, reserve, and money (full guide)

This is the player- and organiser-facing explanation of **every credit-related number** in the game. It matches the frozen rules in `game-rules.md`, `simulation-model.md`, `interventions-catalogue.md`, `scoring-system.md`, and the engine `packages/sim` (`py-ref-1.1.0`).

Currency name: **credits**. Town: **Ashfen**. Starting cash: **220 credits** in reserve.

---

## 1. The three money words (do not mix them up)

| Word | What it is | When it changes |
| --- | --- | --- |
| **Reserve** | Credits the town is **holding** between rounds. Stored on the town as `reserve`. | After each official process: set to whatever was **unspent** that round. Reset play sets it back to **220**. |
| **Income** | Credits **earned this round** from the town’s economy (plus a round-1 grant). | Computed every round inside the engine. Not stored as a separate bank account. |
| **Available** | Credits you may **spend this round**. | `available = max(0, reserve + income − maintenance)`. Server-only. |

Also:

| Word | What it is |
| --- | --- |
| **Maintenance** | Upkeep for interventions already started in a **previous** round. Subtracted when computing `available`. |
| **Spent** | Credits that actually went into sector allocations this round (after scaling). |
| **Unspent** | What is left of `available` after starts + sectors. Becomes next round’s **reserve**. |
| **Project cost** | Up-front catalogue price of accepted intervention starts this round. |

**Rule of thumb**

- **Reserve** = “what we have in the vault going into the year.”
- **Available** = “what we can actually spend this year.”
- **Unspent** = “what goes back into the vault for next year.”

There is **no interest**. Holding credits does not grow them.

---

## 2. Starting position (round 1, before anything is published)

Every team begins identical:

```
reserve = 220
```

That value lives on `town_templates.initial_state.reserve`. Until round 1 is published, the play HUD and organiser credit column read from that template (or from the last published town’s `reserve`).

Round 1 also gets a **recovery grant** inside income (see §4), so **available** in round 1 is much larger than 220.

---

## 3. What you see on the screen

### Player HUD (`/play`)

The budget strip comes from the **server** (`computeBudget`):

- **Reserve** — carried-in `preTown.reserve`
- **Income** — this round’s `incomeFor`
- **Maintenance** — this round’s `maintenanceDue`
- **Available** — `max(0, reserve + income − maintenance)`

A client-side sum of the eight sector boxes is **not** official money. The server ignores client “totals.”

### Organiser room (`/room`)

Each seat shows **credits**:

- If a round has been **published** → last published `published_results.reserve` (official end-of-round vault).
- If nothing published yet → **220** starting reserve from the town template.

### After organiser “Reset play data”

1. Submissions, town states, and published results are deleted.
2. `town_templates.initial_state.reserve` is forced back to **220**.
3. Seats and player towns again show **220** until a new round is processed and published.

---

## 4. How `available` is calculated each round

Inside `stepRound` (official engine), after drift and delayed/ongoing effects:

```
income      = incomeFor(town, roundIndex)
maintenance = maintenanceDue(town, roundIndex)
available   = max(0, reserve + income − maintenance)
```

### Income formula (assumption)

```
income = 180
       + (180 if round == 1 else 0)   # recovery grant, round 1 only
       + 8.6 × economy
       + 3.2 × jobs
       + 1.6 × fiscal
       − 0.45 × pollution
       − 0.40 × (100 − health)
       − 0.30 × (100 − energy)
```

So a healthier, cleaner, more productive town earns more. Pollution and poor health/energy tax income.

### Maintenance

For every intervention already in `town.started` with `startedRound < thisRound`, add that project’s `maintenance_per_round` from the catalogue.

- Maintenance **starts the round after** you start the project.
- Completing a build does not stop maintenance; assets keep costing upkeep while they exist.

---

## 5. What a team chooses (the plan)

While the round is **open**, a team saves:

1. Eight **sector allocations** (non-negative numbers):
   restoration, pollution_control, water, energy, agriculture, industry, infrastructure, public_services
2. Up to **two** catalogue **project starts** (codes like `RIVER`, `WETLAND`)

**Saving does not charge credits.** It only stores the plan. Money moves only when the organiser (or automation) **processes** the round.

Autosave / resave supersedes the previous accepted row. Still no charge until process.

---

## 6. Charge order (the most important spending rule)

When the round is processed, the server spends in this **fixed** order:

```
1. Accept intervention starts (listed order), charge their costs from available
2. Scale sector allocations to whatever budget remains
3. Leftover → unspent → becomes next reserve
```

### Step A — Intervention starts

For each listed start (max 2 accepted):

- Reject unknown codes, duplicates, already started, missing prerequisites, mutex conflicts.
- If cost > remaining budget → drop that start (`budget`), do not charge it.
- If accepted → subtract cost from remaining, queue the build.

Invalid starts are **logged and not charged**. Sector spend still runs on what is left.

### Step B — Sector allocations

`normalizeSpend`:

- If total sector ask ≤ remaining → spend as asked; leftover is unspent.
- If total sector ask > remaining → **scale all eight sectors down** proportionally so they fit.
- If remaining is 0 or all sectors are 0 → all available becomes unspent (full reserve hold).

### Step C — Write reserve

```
town.reserve = unspent
```

That is the vault for the **next** round (and what appears on published results as `reserve`).

---

## 7. Worked example (numbers illustrative)

Suppose at the start of a process step:

| Item | Credits |
| --- | ---: |
| Carry-in reserve | 220 |
| Income this round | 360 |
| Maintenance | 16 |
| **Available** | **564** |

Team plan: start `RIVER` (cost 240), allocate 200 to water and 100 to restoration.

1. Charge `RIVER` → remaining **324**
2. Sectors ask 300 → fits → spend 300, **unspent = 24**
3. `reserve` becomes **24** for next round

If they had asked for 400 in sectors after the start:

1. Charge `RIVER` → 324 left
2. Sectors scaled so water+restoration = 324
3. Unspent = 0

If they start nothing and allocate nothing (or never save):

- Hold behaviour: spend 0 → **unspent = available** → whole pile becomes next reserve.
- Drift, events, and maintenance **still happen**. Silent is not a free bye.

---

## 8. Save vs process vs publish (when money is “real”)

| Moment | Credits |
| --- | --- |
| **Save / resave** | Plan stored. Reserve and available on screen are still the **pre-round** budget. No charge. |
| **Lock** | Last accepted plan frozen (or hold if none). Still no charge. |
| **Process** | Engine runs. Starts charged, sectors applied, `reserve = unspent`, snapshot scored. Town states are prepared for publish. |
| **Publish** | Official `town_states` + `published_results` written (including `reserve`). Players see new official money after this. |

A second process on the same successful round is a **no-op**. Publishing refuses a bad checksum.

---

## 9. How reserve affects the score

Cash is **not** an ecology or welfare pillar. It only appears in **resource efficiency** (10% of the snapshot):

```
discipline = 100 × exp(−(reserve − 300)² / (2 × 160²))
```

- Ideal working buffer ≈ **300 credits** (not the starting 220).
- Hoarding thousands tanks `discipline`.
- Dumping almost everything also hurts other efficiency terms (`waste_score`, `yield_score`).

So: **220 start → earn income → choose how much to spend vs hold**. Holding ~300 is the published fiscal target, not a secret.

---

## 10. Interventions and money over time

| Timing | Money effect |
| --- | --- |
| Start cost | Charged once from this round’s `available` (if accepted) |
| Immediate effects | Town indices change this round (not a second cash charge) |
| Build delay 1–2 | Effects land later; no extra start fee |
| Next rounds | `maintenance_per_round` reduces `available` every later year |

Mutex / prereq failures: start dropped, **cost not charged**.

Catalogue prices and maintenance: `interventions-catalogue.md` (engine `py-ref-1.1.0`, pack A-CAT-1.1).

---

## 11. Pack A income / event context (cash-relevant bits)

| Round | Event | Cash note |
| ---: | --- | --- |
| 1 | None | Extra **+180** recovery grant inside income |
| 2 | Heatwave | No special income line; damage hits state → later income can suffer |
| 3 | Drought | Same |
| 4 | Flood | Same |
| 5 | Contamination | Same |
| 6 | None | Final operating year |

Events do not directly “bill” credits; they damage town indices. Damaged economy/health/energy then reduces future **income**.

---

## 12. Diminishing returns (why dumping one sector is wasteful)

Sector effects use a soft saturation curve (assumption):

```
sat(S) = 12 × (1 − exp(−S / 340))
```

Spending 800 in one sector usually beats less than splitting spend where synergies exist. Efficiency scoring also punishes spend past ~520 in a sector (`waste_score`).

---

## 13. Organiser-facing credit checklist

| Situation | What credits should show |
| --- | --- |
| Fresh seed / after reset | **220** reserve for all seats |
| Round open, not yet processed | Pre-round reserve + this round’s available on player HUD |
| After publish | Official `reserve` = that round’s unspent |
| Reset play | Deletes published money history; forces template `reserve = 220` |
| Never edit | Scores or reserve by hand in SQL — use process/publish or reset |

---

## 14. Common confusions

| Confusion | Truth |
| --- | --- |
| “Available is my bank forever” | No. Available is **this round’s spendable**. Leftover becomes reserve. |
| “Reserve is what I typed in the boxes” | No. Reserve is **unspent after process**, not your sector sum. |
| “Save spent my credits” | No. Only **process** charges. |
| “I can send my own remaining budget” | No. Browser must not submit budgets as truth. |
| “Starting 220 is the score target” | No. Start is 220; efficiency likes about **300** held. |
| “Silent team keeps 220 forever” | No. They still get income − maintenance; whole available rolls into reserve, but the town still drifts and takes events. |
| “Maintenance is paid from reserve after the round” | No. Maintenance is subtracted when forming **available** at the start of the process step. |

---

## 15. One-page formula sheet

```
START
  reserve₀ = 220

EACH ROUND n (official process)
  income_n        = incomeFor(town, n)
  maintenance_n   = maintenanceDue(town, n)
  available_n     = max(0, reserve_{n-1} + income_n − maintenance_n)

  charge accepted starts from available_n   → remaining
  scale sectors to fit remaining            → spent, unspent
  town.reserve = unspent                    → reserve_n

  publish → published_results.reserve = reserve_n

RESET PLAY
  delete play rows
  town_templates.initial_state.reserve = 220
```

---

## 16. Source files (canonical)

| Topic | File |
| --- | --- |
| Player rules | `docs/game-rules.md` |
| Income, step order, sat() | `docs/simulation-model.md` |
| Charge order + catalogue costs | `docs/interventions-catalogue.md` |
| Efficiency / discipline | `docs/scoring-system.md` |
| TypeScript engine | `packages/sim/src/engine.ts` |
| Player budget API | `apps/web/lib/server/game-context.ts` (`computeBudget`) |
| Organiser credit display | `apps/web/lib/admin-ops.ts` (`officialCredits`) |
| Reset forces reserve 220 | RPC `reset_competition_play` (migration `0015`) via `organiser-writes.ts` |

Engine version freeze: **`py-ref-1.1.0`**. Coefficients above are **game assumptions**, not validated Earth-system science.
