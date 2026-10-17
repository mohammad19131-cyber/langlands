# Testing and game balance

Status: canonical test plan. Physics lab: `score_lab.py`. Official score lab: `official_score.py`.

## Already run (design phase)

```
python3 docs/simulation/official_score.py
```

| Check | Result |
| --- | --- |
| Identical start | All named strategies start from the same `Town()` |
| Pack A events | Same round event for all; damage state-scaled |
| 40/25/15/10/10 + dysfunction | Mixed winner `prudent_buffer` 58.41, gap 0.79 |
| Long-term planning | `restore_then_grow` 57.62 vs `grow_then_restore` 51.53 |
| Dominant dump | `eco_max` 50.26, `industry_max` 23.13, `hoard` 46.20 |
| 400 random Dirichlet allocations | max 58.00 < best named mixed; median 53.12 |
| Score bounds | All named scores in (0, 100) |

**Phase 1 (Python engine):** see `docs/simulation/balance-report.md`. Engine `py-ref-1.1.0` (catalogue **A-CAT-1.1**). **35/35** unit tests. Dominance gate **pass**. Projects now beat the 300-credit buffer (habitat 60.20 vs prudent_buffer 58.41). Catalogue freeze for the live event remains **conditional** on A11’s original 2–4 point / ~62 ceiling.

**TypeScript port (`packages/sim`):** `cd packages/sim && npm test` → **54/54**. Frozen golden `py_ref_1_1_0.json` silent/balanced/GRID-then-COAL scores, snaps, and SHA-256 match. `npx tsc --noEmit` clean.

**Phase 2 isolation (PGlite, stub `auth.uid()`):** `npm run test:db` isolation file — 14/14 locally verified 2026-10-17. Covers rival submissions, role self-promotion, official-write grants, uninvited submit, idempotency unique, invalid starts/mutex/third start, published_results columns, judge vs organiser, closed-round insert, seed rerun.

**Phase 3 round machine (same PGlite harness, not hosted Supabase):** `npm run test:db` round-machine file — 14/14 locally verified 2026-10-17. Covers unauthenticated/uninvited submit, organiser-only open/lock/void, predecessor gate, identical vs conflicting idempotency keys, rival write isolation, server deadline vs client clock, prereq rejection, 20-team lock with default holds, duplicate process no-op, checksum mismatch blocking publish, public rows without private keys, support-read audit, 19-entry manifest staying locked with 0 states, interrupted claim reclaim, all six pack A rounds matching silent `play()` scores, exactly-20 `processRound` guard. **Not yet run:** the same suite against hosted Supabase; 20 parallel HTTP submits; multi-connection lock races.

## Engine tests (Phase 1, Vitest)

- Golden vectors for all 14 named strategies, score ±0.01, each category ±0.05.
- `sat(800)` vs `sat(400)+sat(400)` mixed-payoff inequality.
- Neglect threshold: 15.9% fires, 16.0% does not.
- Reserve Gaussian: 300 > 0 > 1640 on `F`.
- Dysfunction: ecology 7.6 produces a penalty matching `industry_max`.
- Pack A: fixture town in, exact damage out for each of rounds 2–5.
- Delayed restoration lands T+1, not T+0.
- Catalogue: prereq fail, mutex fail, third start dropped, overspend scales.
- Invariants: indices in 0–100, spend ≤ available, population bounds.
- Re-run 400 random + 15-project random loaders; fail CI if any dump or random beats the best mixed path by ≥ 5.0 **and** win gap ≥ 5.0.

Dominant-strategy gate for freeze:

```
win_gap < 5.0
winner in mixed/sequencing class
best dump < winner − 3.0
random_max <= winner + 0.5
```

If interventions break this, change **catalogue numbers**, not live weights, and update every spec file.

## Multi-team / API tests

- Seed 20 teams, 20 parallel `POST` in the last 10s of `open` → 20 × 200, 20 accepted rows.
- Duplicate idempotency key → same row, one accepted.
- Duplicate `process` → second attempt no-op, checksum equal.
- 19 successful writes + 1 crash → round stays `locked`, nothing published.
- Silent team → default hold applied, still 20 states.
- Deadline: insert with client date in the past but `now() > closes_at` fails.
- Team A cannot select team B submission (RLS).
- `authenticated` cannot insert `town_states`.
- Replay from stored submissions reproduces ranking byte-for-byte on `final_score`.

## Load

80 users (20×4), 5s polling, 20 submits at T−10s. Target p95 submit < 500ms in the rehearsal region.

## Balance notes for later labs

- `prudent_buffer` winning on operating-only play means the 300-credit target is a **published micro**, not a victory recipe. After projects land, re-check it does not swamp catalogue skill.
- Efficiency must stay independent of Δecology (already true by formula).
- Event modifiers stacking (`FLOOD_WALL` × `WETLAND`) is published; test the product 0.6375.

## Science-olympiad fit

Tests should be readable in a debrief: “why industry dump lost” is a dysfunction penalty plus contamination, not a hidden fudge.
