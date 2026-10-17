# Langlands R3 — Technical and Game Design Plan

> **Superseded as the canonical spec.** Keep this file for history. The living contract is `AGENTS.md` plus the `docs/*.md` set dated for the official 40/25/15/10/10 score. Town physics in `docs/simulation/score_lab.py` are still reused; official scoring and pack A events are in `docs/simulation/official_score.py`.

Status: **design only**. The repository was empty (git `main`, no commits, no app files). This document, `docs/schema.sql`, and `docs/simulation/score_lab.py` are the implementation contract. Do not build the product until the unresolved decisions in §14 are locked.

Working product name: **Langlands R3**. Shared fictional municipality: **Ashfen**. Currency: **credits**.

---

## 0. What this is (and is not)

No public Langlands R3 rulebook was found. All mechanics below are a **pedagogical competition model**, not a scientific reconstruction of ecology, public health, or regional economics.

Claims the product may make:

- “Under the published rules, this allocation changes these game variables.”
- “Your official score is computed by engine version X on the server.”

Claims the product must not make:

- “This policy would restore a real watershed by N%.”
- “This mix is empirically optimal for climate adaptation.”

Browser-submitted scores, remaining budgets, clocks, and simulated outcomes are **never authoritative**.

---

## 1. Documented assumptions

| ID | Assumption | Why it exists |
| --- | --- | --- |
| A1 | Ashfen is an abstract town of 50,000 people. Credits are not a real currency. | Keeps maths comparable across 20 teams. |
| A2 | One round is one game-year of recovery. Real decision windows are a separate clock. | Separates simulation time from event operations. |
| A3 | Six rounds, scenario pack A, engine coefficients in `score_lab.py`. | Enough delayed effects and shocks without a two-day event. |
| A4 | All 20 towns start from the **same JSON template** and the **same published catalogue**. | Fairness. |
| A5 | Events are deterministic. The same round event hits every team; impact scales with that team’s state. | Ranking is skill, not luck. |
| A6 | Operating allocations use diminishing returns `12 × (1 − e^(−spend/340))`. | Dumping one sector is inefficient. |
| A7 | Restoration, biodiversity, ecological buffer, and some economic gains are **delayed one round**. Industry pollution is **immediate**. | Rewards planning; punishes last-round greenwash less than early restoration. |
| A8 | If productive spend (industry + energy + agriculture) or environmental spend (restoration + pollution control + water) falls below **16% of that round’s spend**, a published neglect penalty applies. | Prevents a hidden “ignore a pillar” path. |
| A9 | Fiscal reserve scores as a **Gaussian around 300 credits**. Hoarding does not farm resilience. | A working buffer is good; a vault is not a town. |
| A10 | Official score uses pillar weights 28/24/24/24, a floor at 32, and path weights 58% final snapshot + 27% mean snapshot + 15% shock absorption. | Transparent, no single-pillar victory. |
| A11 | Operating spend alone tops out near **62/100**. Flagship projects are required to break away. | Catalogue skill matters. |
| A12 | Client UIs may show an **unofficial preview** labelled as such. Ranking uses only server engine output. | Safety against tampered payloads. |

---

## 2. Game rules

### 2.1 Setup

- Exactly 20 teams. Organiser pre-creates seats 1–20 and invites captains.
- Every team receives an identical Ashfen: same state, same catalogue, same round timetable, same scenario pack.
- Rulebook, catalogue, scoring formula, event schedule, and engine version are visible before round 1 opens.

### 2.2 Round loop (server order, published)

For each round `n` from 1 to 6:

1. Natural drift / decay.
2. Delayed effects from round `n − 1` land.
3. Income is computed from server state. `available = reserve + income`.
4. Teams submit allocations and up to **three** new project starts before `closes_at`.
5. At the deadline the round **locks**. Late payloads are stored as `late` and ignored.
6. Missing submissions become **zero new projects + 100% unspent** (reserve hold). This is explicit, not a silent skip.
7. Engine applies spend, project starts, maintenance, then the round event.
8. Unused funds become the next reserve.
9. Snapshot score is stored. Results publish only when **all 20** towns are written and the checksum matches.

Teams cannot act during `locked`, `processing`, or `published`.

### 2.3 Money

```
income = 180
      + (180 if round == 1 else 0)
      + 8.6 × economy
      + 3.2 × jobs
      + 1.6 × fiscal
      − 0.45 × pollution
      − 0.40 × (100 − health)
      − 0.30 × (100 − energy)
available = max(0, reserve + income − project_maintenance)
```

If `available` would be negative, reserve is 0 and fiscal/services take a forced-cut penalty.

Spend rules:

- Eight sector integers ≥ 0. Sum of sectors + new project costs ≤ `available`.
- Remainder is reserve. There is no interest.
- The server recomputes `available` from `town_states`. Client totals are discarded.

### 2.4 Projects

- Published catalogue only. Unknown codes reject the whole submission.
- Prerequisites, mutex groups, copies, and budget are checked server-side in seat order (1–20) with the **pre-round** state, so processing order does not change validity.
- A rejected project start does not reject sector spend; the invalid start is dropped, logged, and its cost stays unspent.
- Completed projects pay maintenance every later round.

### 2.5 Isolation

Teams never read another team’s allocations. After a round is `published`, they may see other teams’ **pillar scores and public map tiles**, not the budget that produced them, unless the organiser later releases a full debrief pack.

---

## 3. Town variables

All indices are 0–100 unless noted. Higher is better except **pollution**.

| Code | Start | Pillar | Meaning in the game |
| --- | --- | ---: | --- |
| `air` | 32 | Ecology | Air index |
| `water_q` | 38 | Ecology | Water quality and supply |
| `soil` | 36 | Ecology | Soil and land condition |
| `bio` | 28 | Ecology | Biodiversity |
| `pollution` | 68 | Ecology (inverted) | Pollution load |
| `health` | 44 | Welfare | Public health |
| `services` | 48 | Welfare | Housing and civic services |
| `jobs` | 46 | Welfare | Livelihoods |
| `economy` | 50 | Economy | Productive activity |
| `fiscal` | 52 | Economy | Municipal fiscal health |
| `energy` | 42 | Economy | Energy reliability |
| `infra` | 46 | Resilience | Physical infrastructure |
| `prep` | 30 | Resilience | Disaster preparedness |
| `buffer` | 26 | Resilience | Ecological buffer |
| `reserve` | 220 credits | Resilience (shaped) | Cash buffer |
| `population` | 50,000 | Display / drift | Slow mover; not a scoring pillar |
| `dirty_energy` | 1.0 | Hidden mix | Post-disaster fuel mix |
| `green_energy` | 0.0 | Hidden mix | Clean capacity |
| `intensive_ag` | 0.4 | Hidden mix | Extractive farming |
| `regenerative_ag` | 0.1 | Hidden mix | Regenerative farming |
| `industrial_intensity` | 0.45 | Hidden mix | Heavy industry share |

Hidden mix variables are shown in the UI as qualitative badges (“diesel-heavy grid”), not as raw floats, so the public rules stay readable while the engine stays deterministic.

### 3.1 Pillars

```
ecology    = (air + water_q + soil + bio + (100 − pollution)) / 5
welfare    = (health + services + jobs) / 3
economy    = (economy + fiscal + energy) / 3
reserve_s  = 100 × exp(−(reserve − 300)² / (2 × 160²))
resilience = 0.30×infra + 0.30×prep + 0.25×buffer + 0.15×reserve_s
```

### 3.2 Operating spend (immediate)

Diminishing returns `sat(S)` as in A6, then synergies:

- Restoration is slightly stronger if pollution control is also funded.
- Industry is weaker if energy or infrastructure is low.
- Agriculture is weaker if water is low.
- Public services are weaker if fiscal health is low.

Sector intent (game effects, not science):

| Sector | Helps | Hurts / costs |
| --- | --- | --- |
| Restoration | air, soil, bio, buffer (part delayed) | Near-term jobs/economy slightly |
| Pollution control | −pollution, air, water, health | Compliance drag on economy |
| Water | water, health, buffer, prep | Budget |
| Energy | energy, infra; greener if energy ≥ industry spend | Dirty mix raises pollution |
| Agriculture | jobs, economy, soil if regenerative | Intensive mix stresses water/soil |
| Industry | economy, jobs, fiscal (part delayed) | pollution, air, bio, buffer |
| Infrastructure | infra, prep (part delayed), services | Budget |
| Public services | health, services, jobs, prep | Fiscal if overused |

Exact coefficients: `docs/simulation/score_lab.py`. TypeScript must port them 1:1 with golden tests.

---

## 4. Project catalogue (v1, 28 items)

Effects are **game units** added to town variables. `T+1` means they land in the next round’s delayed step. Costs are credits. Maintenance is per later round.

Mutex groups: `ENERGY_BASELOAD`, `AGRI_PUSH`.

| Code | Name | Sector | Cost | Build | Maint | Prerequisites | Immediate | Delayed / ongoing |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `WETLAND` | Wetland restoration | restoration | 280 | 1 | 12 | — | — | T+1: water_q+4, bio+6, buffer+5 |
| `REFOREST` | Reforestation | restoration | 320 | 2 | 10 | — | — | T+1: air+3; T+2: bio+7, soil+4, buffer+4 |
| `RIVER` | River cleanup | restoration | 240 | 0 | 8 | — | water_q+5, pollution−4 | ongoing: pollution−0.4 |
| `REMEDIATE` | Contaminated land | restoration | 400 | 2 | 14 | `RIVER` or `SCRUBBERS` | — | T+2: soil+8, pollution−6, bio+3 |
| `MONITOR` | Emissions network | pollution_control | 160 | 0 | 6 | — | air+2 | enables `SCRUBBERS`, `ENFORCE` |
| `SCRUBBERS` | Industrial scrubbers | pollution_control | 350 | 1 | 16 | `MONITOR` | pollution−5 | ongoing: pollution−0.8, economy−0.3 |
| `WASTEWATER` | Wastewater upgrade | pollution_control | 380 | 1 | 14 | — | water_q+4, pollution−4 | T+1: health+3 |
| `CIRCULAR` | Circular waste plant | pollution_control | 300 | 1 | 12 | `MONITOR` | pollution−3 | T+1: economy+2, fiscal+1 |
| `TREAT` | Emergency water treatment | water | 200 | 0 | 10 | — | water_q+6, health+2 | — |
| `AQUIFER` | Aquifer recharge | water | 340 | 2 | 8 | `TREAT` | — | T+2: water_q+7, buffer+4 |
| `LEAKS` | Leak reduction | water | 220 | 1 | 6 | — | water_q+3, infra+2 | ongoing: water_q+0.3 |
| `GRID` | Grid repairs | energy | 250 | 0 | 8 | — | energy+6, infra+2 | enables `MICROGRID`, `RENEWABLES` |
| `COAL` | Emergency thermal restart | energy | 280 | 0 | 18 | mutex `ENERGY_BASELOAD` | energy+8, economy+4, pollution+7, air−4 | ongoing: dirty_energy+, pollution+0.8 |
| `RENEWABLES` | Wind/solar park | energy | 420 | 2 | 12 | `GRID`; mutex `ENERGY_BASELOAD` | — | T+2: energy+7, pollution−3, buffer+2, green_energy+ |
| `MICROGRID` | Community microgrids | energy | 300 | 1 | 10 | `GRID` | energy+3, prep+4 | ongoing: prep+0.3 |
| `FOOD` | Emergency food programme | agriculture | 180 | 0 | 8 | — | health+4, jobs+2 | — |
| `REGEN_AG` | Soil regeneration farming | agriculture | 260 | 1 | 9 | mutex `AGRI_PUSH` | regenerative_ag+ | T+1: soil+5, bio+3, economy+2 |
| `INTENSE_AG` | Intensive yield push | agriculture | 240 | 0 | 11 | mutex `AGRI_PUSH` | economy+5, jobs+4, soil−3, water_q−3, pollution+3 | ongoing: intensive_ag+ |
| `FACTORIES` | Repair factories | industry | 300 | 1 | 14 | `GRID` | economy+4, jobs+4, pollution+4 | T+1: economy+3, industrial_intensity+ |
| `GREEN_MFG` | Green manufacturing conversion | industry | 380 | 2 | 12 | `SCRUBBERS`, `RETRAIN` | — | T+2: economy+6, pollution−4, jobs+3 |
| `EXPORT` | Short-term export processing | industry | 220 | 0 | 10 | `FACTORIES` | fiscal+6, economy+3, pollution+5 | expires after 2 rounds |
| `FLOOD` | Flood defences | infrastructure | 360 | 1 | 10 | — | infra+4, prep+5 | T+1: buffer+4; flood event damage −25% |
| `HOUSING` | Transport and housing repair | infrastructure | 320 | 1 | 12 | — | services+5, jobs+3, infra+4 | — |
| `WARNING` | Early warning system | infrastructure | 160 | 0 | 5 | — | prep+6 | shock damage −10% |
| `CLINICS` | Clinics and health response | public_services | 240 | 0 | 12 | — | health+6 | ongoing: health+0.4 |
| `CIVIC` | Schools and civic centres | public_services | 200 | 1 | 8 | — | services+5, jobs+2 | — |
| `RETRAIN` | Job retraining | public_services | 180 | 1 | 6 | — | jobs+3 | enables `GREEN_MFG` |
| `EMERG` | Emergency services expansion | public_services | 210 | 0 | 10 | — | prep+5, health+2 | shock damage −8% |

That is 28 rows; **v1 ships 24** by cutting `EXPORT`, `CIVIC`, `LEAKS`, and `CIRCULAR` if the catalogue must stay small. Recommendation: ship all 28, cap **3 starts per round**, so teams cannot buy the tree in one year.

Event-specific modifiers (`FLOOD` reduces flood damage) are applied only when that event code runs. They are listed in the rulebook beside the event.

---

## 5. Environmental events — scenario pack A

All teams, same round, published before the competition. Impact is a real number `damage ≥ 0` used both to mutate state and to compute shock absorption.

| Round | Code | Trigger | Damage inputs | State hits |
| ---: | --- | --- | --- | --- |
| 1 | — | None | 0 | Recovery grant already in income |
| 2 | `HEAT_WATER` | Always | low water, low bio, low prep, low buffer | water, health, economy, buffer |
| 3 | `SUPPLY_SHOCK` | Always | high industrial intensity, low fiscal, low energy | economy, fiscal, jobs |
| 4 | `FLOOD` | Always | low infra, low buffer, low soil, high pollution | infra, soil, water, services, economy |
| 5 | `CONTAMINATION` | Always | high pollution, low water, low health | health, jobs, fiscal, air |
| 6 | — | None | 0 | Final operating year |

Formulas are in `apply_event()` in the scoring lab. Pack B (if ever used) must be a new frozen engine version, never a silent substitution mid-event.

---

## 6. Scoring system (out of 100)

### 6.1 Formula

```
floor_penalty = Σ 0.72 × max(0, 32 − pillar)

snapshot = clamp(
  0.28×ecology + 0.24×welfare + 0.24×economy + 0.24×resilience
  − floor_penalty
)

shock = 100 − mean(event damages in this competition)

final = 0.58×last_snapshot + 0.27×mean(snapshots) + 0.15×shock
```

Displayed to one decimal. Ties broken by (1) higher ecology, (2) lower mean event damage, (3) earlier seat number — published in the rulebook so it is not a surprise.

### 6.2 Why this shape

- Four close weights stop a single-pillar victory.
- Floor at 32 makes collapse on any pillar expensive.
- Mean snapshot punishes a last-round cosmetics spike.
- Shock term rewards preparation without making cash-hoarding a strategy (A9).
- Operating-only ceiling ~62 leaves headroom for projects.

### 6.3 Laboratory results

Source: `python3 docs/simulation/score_lab.py --brief` (operating spend only, no projects). Same start state, pack A, six rounds.

| Strategy | Score | Ecology | Welfare | Economy | Resilience |
| --- | ---: | ---: | ---: | ---: | ---: |
| prudent_buffer | **61.53** | 52.09 | 66.44 | 60.82 | 65.60 |
| resilience_max | 60.94 | 52.34 | 67.38 | 58.10 | 63.45 |
| green_industry | 60.46 | 51.92 | 67.86 | 67.01 | 53.44 |
| adaptive_lowest_pillar | 60.21 | 54.38 | 67.59 | 57.55 | 56.58 |
| even_pair_ecology_economy | 60.21 | 52.41 | 68.33 | 65.96 | 52.33 |
| balanced | 60.14 | 50.27 | 70.18 | 65.97 | 52.60 |
| restore_then_grow | 59.88 | 59.58 | 64.84 | 58.38 | 50.77 |
| grow_then_restore | 58.60 | 44.06 | 69.29 | 69.59 | 53.87 |
| welfare_max | 56.70 | 44.10 | 73.57 | 50.97 | 50.59 |
| starve_economy | 55.50 | 66.45 | 56.42 | 32.62 | 50.64 |
| eco_max | 52.69 | 78.12 | 48.31 | 28.01 | 43.91 |
| hoard | 50.86 | 40.16 | 56.87 | 54.99 | 39.96 |
| starve_ecology | 40.79 | 9.36 | 71.73 | 76.45 | 51.76 |
| industry_max | 37.00 | 7.60 | 62.52 | 79.53 | 45.43 |

Checks:

- Winner is mixed. Win gap **0.59**. Mixed band **2.93**. Full spread **24.53**.
- Single-pillar dumps and starvation finish clearly behind.
- Hoarding 1,640 credits scores **50.86**; a 300-credit working buffer wins the operating lab.
- `industry_max` still prints the nicest economy (79.5) and the worst score.
- Several competent paths sit inside three points: **no unique recipe**.

Projects will widen the 58–62 cluster. That widening must be re-tested with the TypeScript engine before freeze (test plan §11).

---

## 7. Architecture

```
Browser (Next.js App Router)
  → Server Actions / Route Handlers (session, validation, no score trust)
    → Supabase Auth + Postgres (RLS)
      → service-role processor only on the server
        → packages/sim (pure TypeScript, golden-tested)
```

Stack as specified: Next.js App Router, React, strict TypeScript, Tailwind CSS, Supabase Postgres + Auth, Vercel.

Monorepo layout (when implementation starts):

```
apps/web                 Next.js UI
packages/sim             Pure engine (no I/O)
packages/sim-fixtures    Golden vectors from score_lab.py
supabase/migrations      Schema, RLS, RPCs
docs/                    This plan and lab
```

The browser may import `packages/sim` **only** behind an `UnofficialPreview` banner. Official writes go through a Node runtime that signs `engine_version` + `catalogue_hash` into `town_states`.

---

## 8. Database, constraints, RLS

Full SQL: `docs/schema.sql`.

Core relationships:

- `competitions` 1—20 `teams` (enforced `team_count = 20`, unique `seat`).
- `teams` N—N `profiles` via `team_members` (captain or member).
- `competition_staff` assigns organiser/judge.
- `rounds` belong to a competition; unique `(competition_id, round_index)`.
- `submissions` belong to `(round, team)`. Partial unique index: **one `accepted` row per team per round**.
- `town_states` are append-only per `(team, round)` and are not writable by `authenticated`.
- `audit_logs` are service-role insert only.
- `catalogue_projects` and `town_templates` freeze the rules for that competition.

Invariants:

- `closes_at > opens_at`.
- Submission insert allowed only if the round is `open` and `now()` is inside the window (**database `now()`**, not client time).
- Role on `profiles` cannot be self-promoted to organiser (update policy keeps `role` unchanged).
- Scores, checksums, and process runs have **no insert policy** for `authenticated`.

RLS summary:

| Table | Team | Judge | Organiser |
| --- | --- | --- | --- |
| own submissions | read + insert while open | read | read |
| other submissions | none | none during live* | read |
| own town_states | read | read | read |
| other town_states | after round published (pillars/map only in UI) | read | read |
| process runs / audit | none | none | read |
| catalogue / rounds | read when competition visible | read | read |

\*Judges see outcomes, not live draft budgets, so they cannot leak a rival’s plan mid-round. Organisers can, and that access is audited.

---

## 9. Server-authoritative rounds

### 9.1 Clocks

- `opens_at` / `closes_at` are timestamptz in Postgres.
- The UI clock is cosmetic. “Submit” is accepted only if the insert policy’s `now() < closes_at` succeeds.
- Organiser pause sets competition `paused` and stops new opens; it does not rewrite past `town_states`.

### 9.2 Idempotent submissions

`POST /api/rounds/:id/submissions`

Headers: `Idempotency-Key` (UUID). Body: allocations, project_starts, optional `client_claimed_at` (stored, ignored for validity).

Server:

1. Authn + team membership.
2. Load round; reject unless `open`.
3. Recompute budget from last published `town_states`.
4. Validate schema, 8 sectors, project codes, max 3 starts.
5. In one transaction:
   - Mark previous `accepted` row `superseded`.
   - Insert new `accepted` row with the same or new idempotency key.
6. If `(round_id, team_id, idempotency_key)` already exists, return that row unchanged (HTTP 200).
7. Append `audit_logs` (`submission.accepted` or `submission.duplicate`).

Captains and members of the same team may overwrite until lock. Last accepted write wins.

### 9.3 Lock → process → publish

`process_round` (service role, Next.js + Postgres advisory lock `hashtextextended(round_id)`):

1. CAS: `scheduled/open → locked` only if `now() ≥ closes_at` (or organiser force-lock, audited).
2. Insert `round_process_runs` attempt N.
3. For seats 1–20, load accepted submission or the default hold.
4. Run `packages/sim` in memory. Do not stream partial writes.
5. Bulk insert 20 `town_states`. Compute checksum = SHA-256 of canonical JSON of all 20 states + engine_version + catalogue_hash.
6. CAS: `locked → processing → published` only if row count is 20 and checksum is stable across a second in-process replay.
7. If replay mismatches, mark attempt failed, round stays `locked`, page the organiser. **Never publish a half field.**

Retries: same round, attempt N+1, same engine. Processing is idempotent if `town_states` for that `round_id` already exist and checksum matches — return the existing publication.

### 9.4 Audit

Every lock, force-lock, process attempt, publish, DQ, and catalogue freeze writes `audit_logs` with actor, IP, payload. Audit is not editable in the app.

---

## 10. Permissions

| Capability | Member | Captain | Judge | Organiser |
| --- | --- | --- | --- | --- |
| Sign in | yes | yes | yes | yes |
| View rulebook, catalogue, own town | yes | yes | yes | yes |
| Edit allocations / start projects | yes | yes | no | no |
| Final submit (same as save; last write wins) | yes | yes | no | no |
| See other teams’ live budgets | no | no | no | yes (audited) |
| See published pillar board | after publish | after publish | yes | yes |
| Open / lock / pause rounds | no | no | no | yes |
| Run processor | no | no | no | yes |
| Disqualify a team | no | no | recommend only | yes |
| Override a numeric score | **never** | **never** | **never** | **never** |
| Export debrief pack | no | no | after close | after close |

Judges do not enter numbers. If a judging layer is wanted (narrative prize, presentation prize), it is a **separate non-numeric** note, stored apart from `final_score`.

---

## 11. Premium UI

Tone: editorial, cartographic, quiet. Deep ink, paper, a single bronze/green accent. No gamified chrome, no fake live widgets, no placeholder towns.

### 11.1 Surfaces

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` | public | Competition brief, not a demo sim |
| `/sign-in` | all | Supabase auth |
| `/play` | team | Map + four pillars + countdown |
| `/play/decide` | team | Allocations, projects, validation |
| `/play/history` | team | Own round-by-round states |
| `/board` | team after publish, judges | 20-team pillar board |
| `/rules` | all signed-in | Frozen rulebook + catalogue |
| `/room` | organiser | Control room |
| `/room/team/[seat]` | organiser | Support view, audited |
| `/judge` | judge | Read-only outcomes |

Empty states are real: “Round 2 locked — processing 20 towns”, never invented scores.

### 11.2 Decision screen

- Eight sector controls bound to integers.
- Running total vs **server-quoted** `available`. If the client desyncs, save fails with the server number.
- Project cards grouped by sector, showing cost, prereqs (met/unmet from server state), mutex, delay.
- Unofficial preview panel: “Not your score. Official results after the round is published.”
- Autosave with idempotency keys; visible “Saved 14:02:11 UTC”.

### 11.3 Interactive 2D / isometric map

Recommendation: **SVG isometric tiles**, not WebGL.

- 8–10 districts (river, grid, industry, farms, civic, wetlands, hills, harbour).
- Tile art and density are a **pure function of published `town_states`**.
- Pollution haze, wetland fill, factory smoke, flood walls appear only from server fields.
- Click a district → inspect the variables that drive it.
- The map never allocates budget and never runs the engine.

Why SVG: accessible, screenshot-stable for judges, no GPU variance across 20 school laptops, easier to test.

### 11.4 Organiser control room

- 20-seat grid: not submitted / saved / accepted / late / DQ.
- Round state machine with server timestamps.
- One-click lock, process, publish — each step requires confirm and writes audit.
- Engine version and catalogue hash always visible.
- Panic: pause competition, reopen a round **only if unpublished** (cannot reopen after `town_states` exist).

---

## 12. Automated tests

Engine (`packages/sim`, Vitest):

- Golden vectors exported from `score_lab.py` for all 14 lab strategies (final score ±0.01, each pillar ±0.05).
- Diminishing returns: 800 in one sector < 400+400 split on mixed payoffs.
- Neglect threshold fires below 16% and does not fire at 16%.
- Reserve Gaussian: 300 > 0 > 1640 on resilience contribution.
- Budget: overspend clamps; project + sectors cannot exceed `available`.
- Prerequisites, mutex, max copies.
- Delayed effects land on T+1 / T+2, not immediately.
- Pack A events: identical input state → identical damage.
- Floor penalty for ecology 7.6 matches industry_max lab row.

API / RLS (Supabase local + integration):

- Team A cannot `select` team B submissions.
- Insert after `closes_at` fails even if the client clock is rewinded.
- Duplicate `Idempotency-Key` returns the same row; no second accepted row.
- Concurrent last-write: two members save at once → exactly one `accepted`.
- `authenticated` cannot insert `town_states`.
- Process replay checksum stable; second process is a no-op.
- Round will not publish with 19 states.
- Default hold applied to a silent team.

E2E (Playwright, 20 seeded teams):

- Simultaneous submit in an open window (20 parallel POSTs) all 200.
- Transition open → locked → published; UI countdown cannot submit after lock.
- Map tiles change only after publish.
- Organiser force-lock is audited.
- Preview banner never copies its number into `town_states`.

Load: 80 users (20×4), 5s polling plus 20 submits at T−10s. Target: p95 submit < 500ms on Vercel + Supabase in the rehearsal region.

---

## 13. Deployment, recovery, rehearsal

### 13.1 Deploy

- Vercel preview per PR; production pinned to a git SHA.
- Engine version = that SHA + `packages/sim` version field.
- Supabase migrations apply forward-only. Catalogue freeze is a data migration with checksum stored on `competitions`.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, anon key, **service role only on server**.
- No mock mode in production builds. `NEXT_PUBLIC_DEMO` is compile-time stripped.

### 13.2 Recovery

| Failure | Response |
| --- | --- |
| Submit 5xx during open | Client retries same idempotency key; server stays unique |
| Processor crash mid-round | Round remains `locked`; retry attempt N+1; no partial publish |
| Checksum mismatch | Stay locked; compare two dumps; do not hand-edit scores |
| Auth outage | Pause competition; do not extend a round retroactively without an audited organiser action |
| Need extra time | Organiser updates `closes_at` **only while `open`** |
| Wrong catalogue discovered after publish | Void the round (`void`), restore previous `town_states` as current, ship a new engine version; never patch published JSON in place |

Backups: Supabase PITR enabled before rehearsal. Snapshot after each published round.

### 13.3 Full 20-team rehearsal

T−14d: freeze rules, catalogue, pack A, engine golden tests.  
T−10d: provision 20 dummy teams + 4 organisers/judges.  
T−7d: dry-run six rounds at 5 minutes each (30 minutes plus debrief).  
T−7d checks: 20/20 processed, checksums, RLS probe from a rival account, late submit rejected, silent team got hold, map published together, audit export.  
T−3d: restore from backup, prove a processor retry.  
T−1d: production pin, status page, paper copy of the rulebook.  
T0: live. No engine change on the day.

---

## 14. Unresolved decisions (block implementation)

1. **Live vs multi-day.** Recommendation: one session, **20-minute rounds**, ~3 hours including briefings.
2. **Are pack A events public before round 1?** Recommendation: **yes**, full formulas in the rulebook.
3. **Leaderboard during the event.** Recommendation: pillars only after each publish; no live ticker of rivals’ budgets.
4. **Team size and join path.** Recommendation: organiser-seeded captains, 2–5 members, no self-serve 21st team.
5. **Catalogue size.** 24 vs 28 projects; max starts 3.
6. **Can projects be cancelled?** Recommendation: no cancel after lock; abandoned builds still pay remaining build delay with no effect.
7. **Spectator mode** for a hall screen.
8. **Presentation / narrative prize** beside the numeric score.
9. **Auth provider:** frozen as qualified Team ID + password (bcrypt). No Google, magic-link, or participant email UI.
10. **Whether round 1 grant stays 180 credits.**
11. **Brand, town name, and whether “Ashfen” is acceptable.**
12. **Reopen policy** if a lab laptop farm loses Wi‑Fi for five minutes.

Until (1), (2), (4), and (9) are answered, do not start the Next.js app. Porting `packages/sim` and migrations can begin as soon as this document is accepted, because they do not depend on visual brand.

---

## 15. Phased implementation (after freeze)

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| 0 | Next.js + Tailwind + strict TS + Supabase project | `tsc --noEmit` clean, empty authenticated shell |
| 1 | Port `score_lab.py` → `packages/sim` + golden tests | 14 strategies match Python ±0.01 |
| 2 | Migrations, RLS, seed 20 teams | Rival-team isolation test green |
| 3 | Submit API, idempotency, round processor | 20 parallel submits + publish checksum |
| 4 | Play dashboard + decision screen (no map) | Team can save and see unofficial preview labelled |
| 5 | SVG isometric map bound to `town_states` | Tiles change only after publish |
| 6 | Organiser room + judge board | Rehearsal script runnable |
| 7 | Load test, PITR drill, 20-team rehearsal | Checklist in §13.3 signed off |

Phase 1 may proceed immediately after design sign-off. Phases 4–6 wait on §14 brand and round-duration decisions.

---

## 16. What was inspected

- Workspace `/Users/saminajaved/Downloads/LANGLANDS`: git repository on `main`, **no commits**, no application source, no README, no `package.json`.
- This plan does not pretend any of the product already works.
