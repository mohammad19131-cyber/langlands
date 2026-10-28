# Langlands R3 — gameplay, credit economy and delegate experience audit

**Date:** 2026-10-28  
**Tree:** local working tree on `main` @ `2727d28` plus uncommitted engine/UI/save work. Not GitHub-only.  
**Constraint:** no gameplay, scoring, catalogue, or hosted-database changes. No commit/push/deploy. Isolated engine and PGlite only.  
**Engine contract:** `py-ref-1.1.0` / catalogue **A-CAT-1.1**. Live processing uses TypeScript `packages/sim`, not the Python lab.

---

## 1. How a round works (plain English)

Every team starts from the same Ashfen. Each round is one game-year and an 18-minute decision window.

While the round is **open**, a captain splits this round’s **available credits** across eight sectors and may start up to **two** catalogue projects. They can save many times. Only the last **accepted** server save before lock counts. Saving does **not** spend money yet. The town is not updated until the organiser (or tick) **processes** the round.

At lock, teams with no accepted save get a **hold**: no projects, no sector spend, all available credits go to reserve. Drift, maintenance and the round’s shock still happen.

The server then runs the same frozen engine twice for all 20 seats. If the two checksums match, results may be **published**. Players see official scores only after publication. The next round cannot open until this one is published.

**Path (code):**

1. Delegate edits `/play` (`GameScreen.persist`).
2. `POST /api/rounds/:id/submissions` parses the body, checks membership, dry-runs `stepRound`, then calls RPC `submit_decision`.
3. Postgres trigger validates sectors, max two starts, mutex, catalogue codes. Status is assigned by the RPC (`accepted` / `late` / `superseded`). Clients cannot set it.
4. Organiser `lock_round` freezes the last accepted row (or a hold).
5. `runProcessAndMaybeSave` → `processRound` → `packages/sim` `stepRound` (`py-ref-1.1.0`) twice.
6. Town states and scores are written privately; `publish_round` copies 20/20 public rows.

**Authoritative live engine:** TypeScript `packages/sim` (`stepRound` / `processRound`). Python `docs/simulation/engine.py` is the reference that the TypeScript port must match. `docs/simulation/official_score.py` is an **operating-only lab** (no catalogue multipliers) and is **not** on the live result path.

### What is verified vs still unproven

| Step | Verified how | Not proven here |
| --- | --- | --- |
| First save | Isolated `submit_decision`; engine cash identity | Hosted browser |
| Second distinct save | `supabase/tests/submit-supersede.test.ts` (needs migration **0013**) | Hosted rehearsal (0013 unconfirmed) |
| Reload persistence | Save writes the row; play context reloads `ctx.submission` | Hosted reload |
| Invalid starts | Engine drops; **API** `assertAuthoritativeStarts` **rejects the whole save** (stricter than the rulebook “drop and continue”) | — |
| Overspend | Engine **scales** sector spend; dress rehearsal confirms not HTTP 400 | — |
| Late | Isolated round-machine: after `closes_at` → status `late`, ignored at lock | Hosted |
| Duplicate idempotency key | Unique `(round, team, key)`; duplicate is a no-op | — |
| Lock / process once / publish / next round | PGlite six-round dress rehearsal, 20 seats | Hosted six-round |
| Processing failure | Replay mismatch throws; `save_process_run` stores `_ok: false`; publish stays blocked | Hosted failure injection |

---

## 2. Exact credit system

There is **no bank account that is charged at save time**. Credits move only inside `stepRound`.

```
income  = 180
        + (180 if round == 1 else 0)     # recovery grant, round 1 only
        + 8.6 × economy
        + 3.2 × jobs
        + 1.6 × fiscal
        − 0.45 × pollution
        − 0.40 × (100 − health)
        − 0.30 × (100 − energy)

available = max(0, opening_reserve + income − maintenance)

maintenance = sum of catalogue maintenance for every project started in an earlier round
              (starts this round do not pay until next round)
```

Functions: `incomeFor` / `maintenanceDue` / `stepRoundPy` in `packages/sim/src/engine.ts` (Python twins in `docs/simulation/engine.py`). Constants: `STARTING_RESERVE = 220`, `IDEAL_RESERVE = 300` in `packages/sim/src/constants.ts`.

**Charge order (frozen):** pay accepted **starts** in listed order, then **scale** sector allocations to what remains, then leftover → next round’s reserve. No interest. No borrowing. If maintenance exceeds reserve + income, `available` is **0** (the extra bill is not carried as debt).

Client-submitted totals are ignored. Overspend is scaled, not borrowed.

Income is computed **after** this round’s drift, delayed landings and ongoing effects — not from the raw T0 row. Using T0 without drift would wrongly give Round 1 income **950** and available **1170**. The engine’s actual Round 1 income is **934.06**.

### Worked example — Round 1, before any spend

Opening reserve = **220**.

After `applyDrift` the income terms are:

| Term | Value |
| --- | ---: |
| Base stipend | 180.00 |
| Round 1 recovery grant | 180.00 |
| 8.6 × economy 48.45 | 416.67 |
| 3.2 × jobs 46.147 | 147.67 |
| 1.6 × fiscal 51.45 | 82.32 |
| −0.45 × pollution 70.73 | −31.83 |
| −0.40 × (100 − health 42.27) | −23.09 |
| −0.30 × (100 − energy 41.05) | −17.69 |
| **Income** | **934.06** |
| Maintenance | 0 |
| **Available = 220 + 934.06 − 0** | **1154.06** |

A silent team puts all **1154.06** in reserve. An equal-split team spends all **1154.06** on sectors and closes at **0**.

There are no other grants, penalties-as-cash, refunds, or loans. Event damage changes **indices**, which then change **later income**. Efficiency scores the **shape** of spend and the closing reserve; it does not add or subtract credits.

### Six-round ledger A — silent hold (no projects, no sector spend)

Isolated `play()` / `stepRound`. Matches golden silent hash/score **6.42**, closing reserve **3815.05**.

| R | Event | Open | Income (grant) | Maint | Available | Projects | Sectors | Close |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | — | 220.00 | 934.06 (180) | 0 | 1154.06 | 0 | 0 | 1154.06 |
| 2 | HEATWAVE | 1154.06 | 698.38 (0) | 0 | 1852.44 | 0 | 0 | 1852.44 |
| 3 | DROUGHT | 1852.44 | 636.13 (0) | 0 | 2488.57 | 0 | 0 | 2488.57 |
| 4 | FLOOD | 2488.57 | 528.57 (0) | 0 | 3017.14 | 0 | 0 | 3017.14 |
| 5 | CONTAMINATION | 3017.14 | 438.36 (0) | 0 | 3455.50 | 0 | 0 | 3455.50 |
| 6 | — | 3455.50 | 359.55 (0) | 0 | 3815.05 | 0 | 0 | 3815.05 |
| **Σ** | | | **3595.05** | **0** | | **0** | **0** | **3815.05** |

Lifetime credits = opening 220 + all income = **3815.05**. Hoarding collapses the town (R6 snapshot **0**).

### Six-round ledger B — spend every credit, equal sectors, no projects

Score **55.92**. Reserve always **0**.

| R | Event | Open | Income | Maint | Available | Sectors | Close | Snapshot |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | — | 220.00 | 934.06 | 0 | 1154.06 | 1154.06 | 0 | 44.58 |
| 2 | HEATWAVE | 0 | 852.28 | 0 | 852.28 | 852.28 | 0 | 47.76 |
| 3 | DROUGHT | 0 | 927.09 | 0 | 927.09 | 927.09 | 0 | 49.37 |
| 4 | FLOOD | 0 | 974.40 | 0 | 974.40 | 974.40 | 0 | 51.56 |
| 5 | CONTAMINATION | 0 | 1045.26 | 0 | 1045.26 | 1045.26 | 0 | 54.65 |
| 6 | — | 0 | 1135.05 | 0 | 1135.05 | 1135.05 | 0 | 58.86 |
| **Σ** | | | **5868.14** | **0** | **6088.14** | **6088.14** | **0** | final **55.92** |

### Six-round ledger C — grow-early operating (higher income, worse ecology)

Documents that **available cash is endogenous**. R6 income **1335.72** vs silent **359.55**. Lifetime available **6923.48**. Final snapshot **48.30** (ecology penalty). This is **not** a claim that 6923 is the mathematical maximum; it is a measured grow-early path.

### Limits, borrowing, overspend

- **Reserve target:** 300 credits scores best on efficiency `discipline`. 0 is allowed. Thousands of idle credits tank `discipline` and, if nothing is spent, the town.
- **No borrowing.** `available` cannot go negative.
- **Overspend:** 50 000 per sector is accepted; the engine scales to `available`. Isolated: `projectCost + sector + unspent === available`.
- **Repeated save:** only the last accepted row is processed. Credits are not charged per save.
- **Rejected save:** previous accepted row stands; town unchanged.
- **After lock:** further saves are `late` / closed and ignored.

---

## 3. Can delegates buy everything?

### Catalogue (from `packages/sim/src/catalogue.ts`)

| Code | Name | Cost | Build | Maint / later round | Prereq | Mutex | Immediate? |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| WETLAND | Wetland restoration | 280 | 1 | 6 | — | — | no (T+1) |
| REFOREST | Reforestation | 280 | 2 | 6 | — | — | no (T+1, T+2) |
| RIVER | River cleanup | 240 | 0 | 6 | — | — | yes |
| EMISSIONS | Industrial emissions control | 260 | 1 | 10 | — | — | no |
| WASTEWATER | Wastewater upgrade | 300 | 1 | 8 | — | — | no |
| WATER_TREAT | Emergency water treatment | 200 | 0 | 10 | — | — | yes |
| GRID | Grid repairs | 200 | 0 | 8 | — | — | yes |
| COAL | Emergency thermal restart | 280 | 0 | 18 | GRID | ENERGY_BASELOAD | yes |
| RENEWABLES | Wind and solar park | 360 | 2 | 10 | GRID | ENERGY_BASELOAD | no (T+2) |
| REGEN_AG | Regenerative farming | 260 | 1 | 9 | — | AGRI_PUSH | mix only |
| INTENSE_AG | Intensive yield push | 240 | 0 | 11 | — | AGRI_PUSH | yes |
| FACTORIES | Repair factories | 240 | 1 | 12 | GRID | — | no |
| GREEN_MFG | Green manufacturing | 280 | 1 | 10 | EMISSIONS, FACTORIES | — | no |
| FLOOD_WALL | Flood defences | 300 | 1 | 8 | — | — | yes (+ T+1 buffer) |
| CLINICS | Clinics and emergency services | 240 | 0 | 12 | — | — | yes |

- 15 interventions. List-price sum **3960**. If every asset existed at once, maintenance would be **144 / round**.
- Max **2 starts per round** → max **12 starts** in the game.
- Mutex: cannot own both COAL and RENEWABLES; cannot own both REGEN_AG and INTENSE_AG. Unique ownable set is **13**, still more than 12 slots.
- GREEN_MFG started in round 6 does not complete (`engine.test.ts`).

**Delegates cannot buy the full catalogue.** The binding constraints are the two-start cap and mutexes, not cash.

### Budget versus cost (isolated 12-start path)

A legal 12-start sequence (GRID+RIVER, WATER_TREAT+CLINICS, EMISSIONS+FACTORIES, WETLAND+FLOOD_WALL, GREEN_MFG+REGEN_AG, WASTEWATER+REFOREST) spent **3080** on projects and still had **2231.34** left for sectors. Lifetime available on that path **5311.34**. Maintenance rose 0 → 14 → 36 → 58 → 72 → 91. Not started: COAL, RENEWABLES, INTENSE_AG. Not completed by round 6: WASTEWATER, REFOREST (started too late).

Equal-split operating with **no** projects already generates **6088** lifetime credits — more than the 3960 list. Grow-early generated **6923**. Money is plentiful; **starts, prereqs, delays and neglect** are the scarce resources.

### Can they max every sector and every pillar?

No.

- `sat(S) = 12 × (1 − exp(−S/340))` flattens dump-one-sector play.
- If industry+energy+agriculture < 16% of spent credits, economy/jobs/fiscal fall. If restoration+pollution+water < 16%, pollution/bio/air worsen.
- Industry spend hurts air/bio/buffer; restoration spend mildly hurts economy.
- Ecology is 40% of the snapshot; dysfunction floors punish a collapsed pillar.
- Measured: silent **6.42**, grow-early snapshot path weaker than equal-split **55.92**, 12-start mix **not** a free sweep of all pillars (R6 ecology 47.8 / welfare 56.0 / economy 56.5).

### Saving versus last-round dump

- Holding about **300** helps efficiency `discipline`. Holding **3815** and spending nothing loses the game.
- Spending to **0** every round (ledger B) still scores **55.92** — operating mix beats a vault.
- Round 6 is **62%** of `final_score`. A last-round cosmetic dump cannot erase five weak snapshots, and a last-round GREEN_MFG will not even complete.
- No double-spend, no post-lock spend, no rejected-save debit. Those were tested in the engine and PGlite dress rehearsal.

---

## 4. Do the rounds differ?

Pack A (`PACK_A` in `packages/sim/src/constants.ts` and `docs/environmental-events.md`):

| Round | Code | When applied | What it does |
| ---: | --- | --- | --- |
| 1 | none | — | Recovery grant in income only. No shock. |
| 2 | HEATWAVE | After this round’s spend and immediate project effects | Damage from water/bio/prep/buffer; hits water, health, energy, buffer |
| 3 | DROUGHT | same | Damage from water/soil/prep/buffer; hits water, soil, economy, bio, jobs. `WATER_TREAT` ×0.90 if **already completed** (build 0, so a round-3 start completes before the event) |
| 4 | FLOOD | same | Damage from infra/buffer/soil/pollution/prep. `FLOOD_WALL` ×0.75 and `WETLAND` ×0.85 **stack** if completed |
| 5 | CONTAMINATION | same | Damage from pollution/water/health/prep. Catalogue also ×0.85 `CLINICS`, ×0.90 `WASTEWATER`, ×0.90 `GREEN_MFG` if completed |
| 6 | none | — | Last landings; no shock |

Effects are **immediate to this round’s snapshot**, not delayed shocks. Multipliers apply only to **completed** assets (`eventMultiplier`). Damage is `max(0, formula) × multipliers × EVENT_SCALE` then subtracted from named indices. `shock_log` feeds resilience.

Python `docs/simulation/engine.py` `apply_event_pack_a` matches TypeScript. Parity: `packages/sim/tests/parity.test.ts` vs `docs/simulation/goldens/py_ref_1_1_0.json` (silent, balanced, GRID→COAL). Event order test expects `[null, HEATWAVE, DROUGHT, FLOOD, CONTAMINATION, null]`. Flood stack and same-round WATER_TREAT tests pass.

**Doc gap (not an engine bug):** `docs/environmental-events.md` names only CLINICS for contamination. The frozen catalogue also multiplies WASTEWATER and GREEN_MFG. Live engine uses the catalogue.

`official_score.py` uses the same damage **formulas** but **no** project multipliers and applies damage before flooring in a slightly different order. It is the operating lab, not production.

Historical `score_lab.py` supply-chain shock is **not** pack A and is not on the live path.

---

## 5. Is the crisis clear to delegates?

**Yes, as a briefing — not as a formula sheet.**

On `/play`, for the **current** round:

- Header: round n/6, open/locked/published, countdown, available credits.
- `EventStrip`: crisis title (or “Reconstruction year” / “Final accounting”) and tagline.
- `EventOverlay` (Event / strip click): readable name, shock badge, tagline, “under pressure” indicators, “what helps”, note that the schedule is identical for all 20 teams.
- Action bar: selected projects, costs, save state, two-project limit.
- `/rules`: all six pack A rows (the schedule is **public before round 1**, per `game-rules.md`).

Future shocks are **supposed** to be visible on `/rules`. The play overlay only expands **this** round. Unpublished **scores and rival towns** stay off `/play` and `/board` until `published` (`boardForRound` returns `unpublished`; play context loads published boards only).

**Gap:** `/play` does not show the numeric damage formulas. Those live in `docs/environmental-events.md`. Delegates see qualitative consequences, not `0.20 × (100 − water_q)`. That is a communication gap, not a hidden per-team modifier.

No new UI was added in this audit.

---

## 6. Scoring and publication

Weights in `packages/sim/src/constants.ts` and `docs/scoring-system.md`:

| Pillar | Weight | Index |
| --- | ---: | --- |
| Ecology | 40% | `(air + water_q + soil + bio + (100 − pollution)) / 5` |
| Welfare | 25% | `(health + services + jobs) / 3` |
| Economy | 15% | `(economy + fiscal + energy) / 3` |
| Resilience | 10% | `0.5 × (0.5·prep + 0.5·infra) + 0.5 × shock` |
| Efficiency | 10% | `0.40·discipline + 0.35·waste + 0.25·yield` (reserve Gaussian at 300; waste above 520/sector; yield on `sat` slope) |

Dysfunction penalties after the weighted sum (ecology < 36, welfare < 40, economy < 40, prep/infra < 32, population < 47 000). Snapshot clamped 0–100.

```
final_score = round(0.62 × snapshot_last + 0.38 × mean(snapshots_so_far), 2)
```

Python 3 banker's rounding (`pythonRound`). Official writes happen only in `processRound` / `publish_round` on the server. Client copies must stay unofficial.

**Tie-break (spec):** higher final ecology, then lower mean event damage, then lower seat.

**Live public board (`apps/web/lib/ranking.ts`):** higher ranking score, then higher ecology, then **seat**. Comment in code: mean event damage is **not** on `TownPublic`, so it cannot be applied. Isolated campaign tests use the engine tuple; the public board does not.

Publication: `publish_round` requires 20 town states and 20 published rows. Unpublished towns are RLS-private. The public board refuses non-`published` rounds.

---

## 7. Tests run this session (isolated)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 warnings |
| `npm run test:sim` | **58** passed / 4 files (parity, events, budget, catalogue) |
| `npm run test:web` | **99** passed / 17 files |
| `npm run test:db` | **44** passed / 6 files (supersede, late, six-round PGlite) |
| `python3 docs/simulation/test_engine.py` | **35** passed |
| `python3 docs/simulation/official_score.py` | exit 0 (lab; operating-only) |
| `npm run build` | pass |

Ledgers above were produced by calling `packages/sim` `stepRound` / `play` / `playInteractive` on a throwaway script. **No hosted writes. No browser pass claimed.**

---

## 8. Exploits, bugs and balance (by severity)

**High (launch, not a rules cheat)**

- Hosted second-save still depends on migration **0013**, which is in the tree but not confirmed on rehearsal. First save works; a second different save can still raise `clients may only insert accepted or late proposals` until 0013 is applied.

**Medium (spec vs live)**

- Public leaderboard omits mean-event-damage tie-break. Two teams with equal path score and equal ecology sort by **seat**, not by shock log.
- Player **save API** rejects a plan if the engine would drop a start (`assertAuthoritativeStarts`). The rulebook says invalid starts are dropped and sector spend still applies. Live captains must not include illegal codes; the engine path used at **process** would drop them if they had been stored.

**Low / by design (not exploits)**

- Overspend is scaled, not rejected.
- Maintenance above income+reserve floors available at 0 (no debt).
- Saving every credit to reserve is a **losing** strategy (6.42), not a vault exploit.
- Last-round GREEN_MFG / REFOREST cannot fully land — intended.
- `official_score.py` without catalogue multipliers could mislead a lab user; it is not the live scorer.

**Balance (intentional scarcity)**

- Cannot buy all 15 projects. Cannot max all pillars at once. Equal operating spend already beats hoarding and beats a dirty grow-early dump on snapshot quality. Trade-offs are real.

---

## 9. Verified local / unverified hosted / blockers

**Verified locally**

- Full round physics, pack A order, Python↔TypeScript golden hashes, cash identity, scale-on-overspend, mutex/prereq/max-two, late vs accepted, PGlite six-round process/publish, scoring weights and `final_score`, play payload stripping of credentials, crisis copy wired to current round + public `/rules` schedule.

**Unverified hosted**

- Browser `/play` save → reload after 0013.
- 20-team live hall, 18-minute clocks, cron/tick through six published rounds.
- Public-board tie-break with real equal scores.

**Blockers for “the hall already works”**

- Confirm/apply **0013** on rehearsal SQL only (never production `db push`).
- Do not treat this audit as a hosted GO. It is a **gameplay and economy** audit of the local tree.

---

## Bottom line

The game **does** work as a closed loop in isolated tests: save is a proposal, lock freezes it, TypeScript `py-ref-1.1.0` scores all 20 towns twice, publish is gated, the next round waits. Credits are computed after drift, spent starts-then-sectors, and carried only as unspent reserve. Teams **cannot** buy every project or max every pillar; the two-start cap and mutexes bind before money does. The four shocks are real, identical for every seat, and shown on `/play` as this round’s crisis plus a public `/rules` schedule. Official weights are 40/25/15/10/10 and are calculated only on the server.

What is **not** proven is the hosted second-save (needs 0013) and a live 20-team browser run. The public board also skips the published “mean damage” tie-break. None of that is a credit-printing exploit.
