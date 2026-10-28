# Langlands R3 — Event-day dress rehearsal

**Date:** 2026-10-27 (local), completed 2026-10-28 00:05 PKT  
**Git:** `main` at `2727d28`, tracking `origin/main`, 0 ahead / 0 behind. No commit, push, deploy, or hosted write from this pass.  
**Verdict:** **CONDITIONAL GO**

This is **not** an official competition result. Existing rehearsal rounds 1–2 on `fgqitafevklmuhybuwzw` were observed read-only and were not reopened, reprocessed, or republished.

---

## 1. Executive verdict

**CONDITIONAL GO** for event day **if and only if** the live Vercel app is pointed at a dedicated event database (not the shared rehearsal project, not `npwgkqfljrqhvuiateqk`) with migrations `0001`–`0012` applied and 20 provisioned teams.

Evidence for GO on mechanics:

- Isolated PGlite walked **all six rounds** with **20 seated captains**, **five distinct authenticated strategies**, Pack A events, 18-minute open stamps, lock → process once → publish, 20/20 town states and published rows, engine hashes matching `py-ref-1.1.0`.
- Invalid starts, rival-team submit, player open, post-lock submit, and duplicate process were rejected or no-ops as specified.
- Regression: web 93, sim 58, db 42, typecheck, lint, isolated production build — all passed.

Evidence against an unconditional GO:

- **No disposable hosted Supabase project was created.** Creating one needs an operator Supabase login / dashboard new-project action. This agent has no CLI login (`supabase` binary absent).
- The configured local app (`apps/web/.env.local`) and, by operator warning, the deployed Vercel app **share rehearsal project `fgqitafevklmuhybuwzw`**, which already has published rounds 1–2. A six-round hosted run was **not** executed there.
- **Five independent browser sessions were not run.** One existing Team 001 cookie session was observed read-only on localhost. Concurrent HTTP players on a live Auth stack remain untested in this pass.

---

## 2. Environment

| Item | Result |
| --- | --- |
| Isolated six-round run | PGlite via `supabase/tests/event-day-dress-rehearsal.test.ts` (migrations `0001`–`0012` in harness order) |
| Local app URL target | `*.supabase.co` project ref **`fgqitafevklmuhybuwzw`** (rehearsal). Keys not printed. |
| Hosted competition (forbidden) | `npwgkqfljrqhvuiateqk` — **not accessed, not migrated, not provisioned** |
| Disposable cloud project | **Not created** — requires operator: Supabase dashboard “New project”, then `0001`–`0012`, seed, Auth (email on, public signup off), `TEAM_PROVISION_SECRET`, provision 20 Team IDs |
| Vercel | No `vercel.json` in repo. Hosted env not read. Assume it may still point at rehearsal; **do not run open/lock/process there until confirmed** |
| Existing rehearsal state (read-only, before and after) | R1 `published`, R2 `published`, R3–R6 `scheduled`. Published rows: 20 + 20. Unchanged after this pass. |

Isolation method: in-memory PGlite. No SQL applied to any `supabase.co` project. No `seed_langlands_r3()`, provision, organiser, or round RPC was called on rehearsal or production.

---

## 3. Six-round timeline (PGlite only)

Each round: organiser `open_round` (18.00-minute window) → five captains submit distinct valid plans → lock (15 holds) → `claim_process` once → publish 20/20 → refuse next open until published.

| Round | Event | Open window | Accepted | Holds | Process | Publish | Next-round open before publish |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | none | 18 min | 5 | 15 | 1 successful run | 20/20 | refused |
| 2 | HEATWAVE | 18 min | 5 | 15 | 1 successful run | 20/20 | refused |
| 3 | DROUGHT | 18 min | 5 | 15 | 1 successful run | 20/20 | refused |
| 4 | FLOOD | 18 min | 5 | 15 | 1 successful run | 20/20 | refused |
| 5 | CONTAMINATION | 18 min | 5 | 15 | 1 successful run | 20/20 | refused |
| 6 | none (final) | 18 min | 5 | 15 | 1 successful run | 20/20 | n/a |

Second `claim_process` on each round returned `noop: true`. Engine version on all published rows: `py-ref-1.1.0`.

**Hosted / Vercel six-round timeline:** not executed.

---

## 4. Team participation (PGlite)

| Item | Count |
| --- | --- |
| Seeded seats | 20 |
| Auth users seated as captains | 20 |
| Organiser staff | 1 (`USER_ORG` fixture, not a seat) |
| Concurrent-intent valid submits per round | 5 (serialized on one PGlite connection; see §7) |
| Holds per round | 15 (no accepted row at lock) |
| Invalid / unauthorized rejects (round 1 plus per-round) | rival submit 403; 3 starts invalid; unknown code invalid; COAL without GRID invalid; player `open_round` 403; post-lock submit `closed`/`late`; overspend accepted but scaled to available |

No credentials were created on any hosted Auth project in this pass.

---

## 5. Decision diversity (test data only)

Not official competition plans.

| Seat | Strategy | Starts | Full-precision engine score |
| --- | --- | --- | --- |
| 1 | `RESTORE_EARLY` mix | R1 `RIVER`, R4 `FLOOD_WALL` | 58.98 |
| 4 | water-heavy mix | R1 `WASTEWATER`, R3 `WATER_TREAT` | 55.79 |
| 2 | equal mix | R1 `CLINICS`, R3 `WATER_TREAT` | 55.00 |
| 5 | `GREEN` mix | R1 `GRID`, R2 `RENEWABLES` | 53.85 |
| 3 | all remaining credits to industry | R1 `INTENSE_AG` | 7.99 |
| 6–20 | default hold | none | 6.42 (silent golden) |

All five active hashes differed. Hold seats matched silent town hash and score `6.42` (`docs/simulation/goldens/py_ref_1_1_0.json`).

---

## 6. Scoring and rankings

Weights unchanged: ecology 40%, welfare 25%, economy 15%, resilience 10%, efficiency 10% (`WEIGHTS` in `@langlands/sim`).

Pack A order unchanged: none → HEATWAVE → DROUGHT → FLOOD → CONTAMINATION → none.

PGlite published `town_states.hash` matched `playInteractive` replay for all 20 seats. Round-6 `snapshot_score` matched `pythonRound(last snapshot, 2)`. Published `final_score` equalled `town_states.final_score`.

**Known 0.01 official-score rounding:** process feeds `finalScore` with prior `snapshot_score` values already rounded to two decimals. Seat 3 published **7.98** vs full-precision replay **7.99**. Physics hash still matched. This is existing process behaviour, not a new formula change.

**Existing rehearsal board (hosted, read-only, not this simulation):** localhost `/board` as Team 001 showed official standings for **published R1 and R2 only**. R3 is scheduled; overlay copy is “Round 3 opens at 01/06/2099… Controls stay closed”. Pillar headers ECO 40 / WEL 25 / ECON 15 / RES 10. Seats 03–20 tied on the visible R2 slice in that overlay; those numbers are **rehearsal competition data**, not the PGlite dress scores above.

---

## 7. Concurrency

| Test | Result | Label |
| --- | --- | --- |
| Five distinct authenticated submits per round | Pass, sequential `asUser` | PGlite |
| True parallel HTTP / five browsers | **Not run** | hosted Auth required |
| `Promise.all` on one PGlite connection | Not used | JWT `set_config` is connection-scoped; parallel `asUser` would race |
| Duplicate process token | `noop: true` | PGlite |
| Duplicate lock | `idempotent: true` | PGlite |
| Idempotent resubmit same key | `status: duplicate` | PGlite |
| Isolation: Team 1 cannot submit as Team 2 | 403 | PGlite |
| Isolation: Team 1 SELECT Team 2 `submissions` / `town_states` | 0 rows | PGlite + existing `isolation.test.ts` |

No race condition was demonstrated on a multi-connection hosted database in this pass.

---

## 8. Security

| Check | Result |
| --- | --- |
| Production project | Untouched |
| Rehearsal project writes | None (read-only REST selects on rounds/results/teams/competitions) |
| Player cannot open rounds | 403 |
| Rival submit | 403 |
| Private rival town/submissions via RLS | 0 rows |
| `password_hash` via anon on rehearsal (earlier grant check) | denied; not re-probed with result bodies here |
| Organiser RPCs | exercised only in PGlite as staff fixture |
| Overspend | **not HTTP-invalid**; engine scales sector spend to available (matches rules field guide) |
| Unknown / mutex / max starts / missing prereq | invalid, previous plan remains |
| Post-lock submit | stored late / `closed`, ignored at lock |

Secrets, passwords, tokens, and service-role values are not included in this file.

---

## 9. Browser experience

**Not a five-session event-day UI rehearsal.** Localhost `http://localhost:3000` targets rehearsal `fgqitafevklmuhybuwzw`. No save, open, lock, process, or publish was clicked.

| Page | What was actually seen |
| --- | --- |
| `/play/fixture` | Unofficial preview map, “Preview — not submitted”, OPEN 18:00 left, 220 cr, Heatwave fixture copy, save disabled |
| `/play` (existing Team 001 cookie) | Loaded Ashfen after spinner; **Team 001 · Seat 01**, Round **3/6 SCHEDULED**, drought banner, **2067 cr**, “Round not open · no save” |
| `/board` | Official standings overlay, R1/R2 tabs only, “YOU” on Seat 01, unpublished R3 not ranked as live |
| `/rules` | Field guide, 20 teams, 18-minute clock, pack A, scoring pillars |
| `/sign-in` | Middleware bounced cookie session to `/play` (expected when session cookie present) |
| Five browsers / mobile layout / Vercel origin / organiser `/room` live controls | **Not tested this pass** |
| Sign-out / expired JWT / injected API failure | **Not tested this pass** |

Ashfen loading recovered to the map on the one live cookie session. Fixture remains the unsigned HUD proof.

---

## 10. Regression results

Commands run from repo root. Hosted competition was not a test target.

| Command | Exit | Counts |
| --- | --- | --- |
| `npm run test:web` | 0 | 16 files, 93 tests |
| `npm run test:sim` | 0 | 4 files, 58 tests |
| `npm run test:db` | 0 | 5 files, 42 tests (includes new dress rehearsal file: 2 passed) |
| `npm run typecheck` | 0 | sim + round-machine + web |
| `npm run lint` | 0 | no ESLint warnings or errors |
| `NEXT_DIST_DIR=.next-release-check npm run build -w @langlands/web` | 0 | compiled; routes include play/context, reopen, restore, window, fixture |

`python3 docs/simulation/official_score.py` was not re-run in this pass (ran clean in the prior release verification). Engine goldens remain the sim suite.

Git before: clean `main` @ `2727d28` plus untracked `docs/audits/`.  
Git after: same HEAD; added untracked `supabase/tests/event-day-dress-rehearsal.test.ts` and this report. Isolated build rewrote `apps/web/next-env.d.ts` to `.next-release-check`; **restored** to `.next` so the tracked tree stayed clean. Remote unchanged. Nothing committed or pushed.

---

## 11. Issues

| ID | Severity | Issue | Reproduction | Impact | Location |
| --- | --- | --- | --- | --- | --- |
| D1 | **Blocker for hosted dress** | No second Supabase project available to this agent | `which supabase` empty; creating a project is an operator dashboard action | Cannot run authenticated Vercel/HTTP six-round against a disposable DB without risking rehearsal | operator / Supabase dashboard |
| D2 | **Blocker if mis-aimed** | Local `.env.local` and likely Vercel still use rehearsal `fgqitafevklmuhybuwzw` with published R1–R2 | Read URL host ref only | Opening R3 on that project would be a real rehearsal-state change | `apps/web/.env.local` (not committed); Vercel env |
| D3 | Medium | Five real browser sessions not executed | Single cookie tab on localhost | UI concurrency, reconnect, mobile, organiser room live controls unverified | n/a |
| D4 | Low | Official `final_score` can differ by 0.01 from full-precision `playInteractive` | Seat 3 7.98 vs 7.99; hash matched | Ranking usually unaffected; document as process rounding | `packages/round-machine/src/process.ts` `previousSnapshots` from `snapshot_score` |
| D5 | Info | Overspend is scaled, not rejected | Round-1 industry 50 000 accepted; `applied.spent` ≤ available | Matches player rules; do not treat as a 400 | `packages/sim` `normalizeSpend`; `docs` field guide |
| D6 | Info | PGlite cannot host parallel JWTs on one connection | `asUser` uses `set_config` | Hosted pool concurrency still needed | `supabase/tests/harness.ts` |

No scoring, catalogue, event-order, or auth-architecture change was made to force a pass.

---

## 12. Remaining launch blockers

1. **Operator:** create a disposable Supabase project (name it so it cannot be confused with rehearsal or the 2026-10-17 hosted ref). Apply `0001`–`0012` in order. Confirm seed: 20 seats, 6 scheduled rounds, slug `langlands-r3`.
2. **Operator:** Auth email password on; public signup **off**; Google off; redirect URLs for localhost and the Vercel origin.
3. **Operator:** set Vercel Production (and Preview) `NEXT_PUBLIC_SUPABASE_URL` / anon / service role / `TEAM_PROVISION_SECRET` to **that** project, or confirm they already are. If they still name `fgqitafevklmuhybuwzw`, either finish that rehearsal in place **as the event DB** (operator decision) or retarget before participants arrive.
4. **Operator:** provision exactly 20 Team IDs via `POST /api/admin/provision-teams`; distribute CSV privately; do not commit it.
5. **Still required before calling the hosted path GO:** five authenticated browsers (or five HTTP clients with separate cookies) submitting during one 18-minute open window; organiser open/lock/process/publish on that isolated project; sign-out and stale-cookie checks; mobile width; `/room` live controls.
6. Do not apply migrations or provision against `npwgkqfljrqhvuiateqk` from an agent session.

---

## 13. Evidence (sanitized)

- PGlite test: `supabase/tests/event-day-dress-rehearsal.test.ts` — 2/2 passed in `npm run test:db` (42/42 total).
- Rehearsal REST (read-only): rounds `[(1, published, null), (2, published, HEATWAVE), (3, scheduled, DROUGHT), (4, scheduled, FLOOD), (5, scheduled, CONTAMINATION), (6, scheduled, null)]`; published_results counts `{1: 20, 2: 20}` before and after.
- Engine replay scores listed in §5; hashes verified in PGlite against persisted `town_states`.
- Audit actions in PGlite: `open_round` ×6, `lock_round` ≥6, `publish_round` ×6.
- Browser: localhost fixture, Team 001 live play (R3 scheduled, save disabled), board R1/R2 only, rules. No Vercel origin loaded.

---

## 14. Final checklist

**Ready (mechanics, local):**

- [x] Frozen engine and official weights
- [x] Migrations 0001–0012 in repo and in PGlite harness
- [x] Six-round lock/process/publish with 20/20 checksums locally
- [x] Five distinct strategies + 15 holds
- [x] Isolation, invalid starts, post-lock late, duplicate process
- [x] Web/sim/db tests, typecheck, lint, production build
- [x] Unsigned Ashfen fixture and honest unpublished-round copy on the live cookie session
- [x] Shared rehearsal DB left with R1–R2 published, R3–R6 scheduled

**Must complete before participants arrive:**

- [ ] Isolated (or deliberately chosen) hosted database confirmed in Vercel env
- [ ] `0001`–`0012` applied on **that** database
- [ ] 20 Team IDs provisioned; signup disabled
- [ ] Organiser account on that project
- [ ] Hosted five-team concurrent submit + full six-round operator walk
- [ ] Preview/production smoke of `/play`, `/board`, `/room`, `/sign-in` on the Vercel origin
- [ ] Decision whether rehearsal `fgqitafevklmuhybuwzw` is retired or promoted — not both with the same Vercel env

**Do not:** reset rehearsal R1–R2, rewrite scores, or aim provisioning at `npwgkqfljrqhvuiateqk`.
