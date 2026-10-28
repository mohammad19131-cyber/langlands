# Langlands R3 — current-state audit and handover

**Date:** 2026-10-27  
**Mode:** audit only. No source, hosted, credential, or deployment changes except this file.  
**Inspected tree:** git `main` at `d510830` plus uncommitted Phase 2 gameplay work and copy edits.  
**Readiness verdict:** **NOT READY**

This report is for another assistant that must understand the repository before recommending further work. It is not a licence to implement. Do not treat this file as a mechanics spec. Canonical mechanics remain the documents in `docs/` plus `packages/sim` and `supabase/migrations/`. Where those disagree, stop; do not pick one silently.

---

## 1. Executive summary

Langlands R3 is a 20-team pedagogical environmental strategy competition. Teams manage identical copies of the fictional town Ashfen across six rounds, submit sector spend and at most two catalogue interventions, then receive a server-authoritative official score (ecology 40 / welfare 25 / economy 15 / resilience 10 / efficiency 10). The frozen engine is `py-ref-1.1.0`, catalogue `A-CAT-1.1`, Pack A events on rounds 2–5.

The product that exists in code is a dark forest-and-amber map-first command screen behind Team ID (or staff email) login, plus an organiser control room that can open / lock / process / publish / void rounds. Automated tests of the engine, web helpers, and a local PGlite database are green today (133 vitest tests). That is not event readiness.

The competition cannot be run safely from this tree:

1. Opening a round only flips `status` to `open`. It does not stamp an 18-minute `opens_at` / `closes_at` window. Seeded windows are year 2099. There is still no HTTP API to set or extend `closes_at`, despite the runbook requiring it.
2. Void is terminal. `predecessor_published` requires the previous round to be `published`, not `void`. A voided round 4 permanently blocks rounds 5–6 unless someone writes SQL. The previous hosted audit (2026-10-19) observed exactly that stuck sequence. **This audit did not re-query hosted Supabase.** Treat that hosted snapshot as stale until a safe read-only re-check.
3. After lock, `rounds.lock_manifest` stores every team’s allocations and project starts. `authenticated` has `GRANT SELECT` on `rounds` and RLS allows any competition participant to read round rows. Password hashes were column-revoked in `0007`; lock manifests were not. Next.js does not select that column, but the anon key ships in the browser.
4. The visible countdown cannot tick locally. `remainingMs` is algebraically `closesAt - serverNow`. A 1-second React tick does not change the displayed remaining time until `/api/play/clock` refreshes `serverNow` (~5s), and the fixture HUD stayed at `18:00 left` across screenshots several seconds apart.
5. Phase 2 gameplay UX (HUD, desk, save labels, local fixture) is **uncommitted**. Origin/main is still Phase 1 public entry (`d510830`). A handover that implements against HEAD alone will not see the current desk.
6. There has been no 20-team rehearsal, no hosted RLS probe from a rival account, no live save against a real open window, and no organiser-room browser pass in this audit.

Preserve the map-first dark-forest identity. Do not start a redesign. Do not change `packages/sim` formulas. Do not commit, push, migrate, or open rounds unless an operator explicitly asks.

---

## 2. Repository and environment state

| Item | Value | Evidence |
| --- | --- | --- |
| Working directory | `/Users/saminajaved/Downloads/LANGLANDS` | `git rev-parse --show-toplevel` |
| Branch | `main` tracking `origin/main` | `git status --short --branch` |
| HEAD | `d5108301504e12881e601690b0a37acaec43b659` | `git rev-parse HEAD` |
| Remote | `https://github.com/mohammad19131-cyber/langlands.git` | `git remote -v` |
| Ahead/behind | in sync with origin | `main...origin/main` with no ahead/behind count |
| Staged files | none | `git diff --cached --stat` empty |
| Uncommitted | 20 modified files, 3 untracked | see below |
| Node | workspaces require `>=20` | root `package.json` |
| App | Next.js 15 App Router, React 19, Tailwind 3 | `apps/web/package.json` |
| Packages | `@langlands/sim`, `@langlands/round-machine` | root workspaces |
| Local env | `apps/web/.env.local` present | key **names** only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `TEAM_PROVISION_SECRET` | not among local env key names | provisioning route returns 503 without it |
| Hosted DB | not queried this audit | previous audit 2026-10-19 used PostgREST read-only |
| Vercel / deploy config | no `vercel.json` in repo | glob |
| This report | `docs/audits/` did not exist before this file | glob `docs/audits/**` returned 0 |

**Uncommitted (must be preserved; this audit did not revert them):**

Modified:

- Gameplay HUD/desk: `GameHeader.tsx`, `ActionBar.tsx`, `CommandDesk.tsx`, `GameScreen.tsx`, `DistrictPanel.tsx`, `EventStrip.tsx`, `Overlays.tsx`
- Copy softening: `sign-in/page.tsx`, `SignInForm.tsx`, `rules/page.tsx`, `Leaderboard.tsx`, `ResultsPanel.tsx`, `SupportView.tsx`, `room-ops.ts`, `game-context.ts`
- Helpers/tests: `clock.ts`, `clock.test.ts`, `decision.ts`, `decision.test.ts`, `game-types.ts`

Untracked:

- `apps/web/app/play/fixture/page.tsx`
- `apps/web/lib/game-fixture.ts`
- `apps/web/lib/game-types.test.ts`

The copy edits are not authored as part of the Phase 2 HUD work; they only shorten “organiser” language to “staff” / “invite”. Treat them as a separate dirty diff.

**Architecture (as implemented):**

- `apps/web` — Next.js UI, API routes, server loaders. Official score is not computed in client components; process uses `@langlands/round-machine` on the server.
- `packages/sim` — pure TypeScript port of `docs/simulation/engine.py`. `ENGINE_VERSION = "py-ref-1.1.0"`.
- `packages/round-machine` — lock/process/publish helpers. **No package tests.**
- `supabase/migrations/0001`–`0008` — schema, RLS, round machine, credentials, DQ submit.
- `docs/` — product, rules, scoring, security, runbook, UI contract. Several files still say “not implemented” or describe APIs that do not exist.

**Local configuration is not assumed safe.** `.env.local` names a hosted Supabase project. Middleware and unsigned `/play` loaders call `auth.getUser()` when those public keys exist. This audit did not print values, did not POST login, and did not call round RPCs.

---

## 3. Project timeline and recent changes

| Date | Commit | What it actually did |
| --- | --- | --- |
| 2026-10-17 | `e75e26c` | Initial commit: specs, engine, schema, Next app skeleton |
| 2026-10-17 | `0fc12f9` | Team ID + password sign-in |
| 2026-10-17 | `3e9b539` | bcrypt hashes + night-before provision API |
| 2026-10-17 | `a208a54` | Player decision screen around the Ashfen map |
| 2026-10-17 | `0a7c870` | Official results + 20-team published leaderboard |
| 2026-10-17 | `80e5b9d` | Organiser control room |
| 2026-10-17 | `512b033` | Organiser/staff email login path |
| 2026-10-19 | `d510830` | Phase 1 entry: public Field Guide, dark public chrome, `/` → `/sign-in` |
| 2026-10-19 | (outside repo) | Full-system audit canvas at git `512b033`. Verdict: not ready. Hosted R4 void, 1/20 logins |
| 2026-10-19 | (outside repo) | Frontend UX audit canvas. Verdict: login wall is the product |
| 2026-10-19…27 | **uncommitted** | Phase 2 HUD/desk repair + local `/play/fixture` + unrelated copy edits |

`docs/development-roadmap.md` still describes Phase 4 as next. That is stale. Play UI, map, results, and control room exist in commits `a208a54`–`80e5b9d`. `docs/product-specification.md` still opens with “Not implemented”. `docs/deployment-and-event-runbook.md` still says “No production app exists yet.”

**What changed since the 2026-10-19 audits (evidence in this tree, not in hosted data):**

- Public `/sign-in` and `/rules` now share `PublicChrome` (Field guide + Sign in). This is committed in `d510830`.
- Working-tree HUD shows team, round, open state, available credits, and a single primary save. Desk uses player-facing sector names. Fixture page exists for HUD inspection without login. **Not on origin.**
- Clock **label** now says `m:ss left`. The remaining-time algebra is unchanged.
- Automated web tests are 47 vs 42 in the frontend audit (new `decision` / `game-types` cases in the dirty tree).
- Hosted competition state was **not** re-read. Do not claim R4 is still void today.

---

## 4. Intended philosophy versus current experience

### Original product vision

Canonical intent is in `docs/product-specification.md`, `docs/game-rules.md`, and `docs/ui-requirements.md`:

- Premium website-based science-olympiad, not a research model of a real place.
- Exactly 20 identical towns, predetermined identical events, no hidden per-team randomness.
- Map-first command experience. Editorial / cartographic. Deep ink, paper, one bronze/green accent.
- Server-authoritative. Browsers propose; they do not submit scores, budgets, clocks, or simulation outcomes as truth.
- Official ranking after round 6 using the published formula and tie-break. Nobody may override a numeric score.
- Audience: 20 student teams, organiser (+ deputy), optional read-only judges, optional hall screen of **published** pillars only.

UI contract (`docs/ui-requirements.md`) still lists `/` as a public briefing, `/play/decide` as a separate decision route, `/rules` as signed-in, and `/judge` as a judge page.

### Current implemented experience

- `/` is not a briefing. It redirects to `/sign-in` (`apps/web/app/page.tsx`).
- With a configured backend, unsigned `/play`, `/board`, and `/room` redirect to `/sign-in`. Confirmed in the browser on 2026-10-27.
- Public chrome exists: Field guide is reachable without credentials. Sign-in copy is short: “Twenty teams restore the town of Ashfen across six rounds.”
- The live game (committed + uncommitted) is a full-viewport dark forest map (`#0B0F0D` / `#0E1512`) with amber credits and an isometric Ashfen map. That is closer to the intended game than to a school dashboard.
- Decision-making is an overlay/desk on the same map (`CommandDesk`), not a separate `/play/decide` product. `/play/decide`, `/play/history`, `/play/results`, and `/board` all mount `GameScreen` with different initial tabs/overlays.
- Organiser control room exists at `/room`. Judge route `/judge` 404s.
- Ivory paper components (`SiteHeader`, `CatalogueGrid`) still exist and are **unmounted**.

### Features that exist only in documentation or plans

| Documented | In code? |
| --- | --- |
| Public briefing at `/` | No — redirect to sign-in |
| `/judge` read-only outcomes | No — 404 |
| Organiser change of `closes_at` while open | No HTTP, no UI |
| Organiser pause / resume | `competitions.status` enum includes `paused`; `open_round` blocks when paused; **no pause/resume API or UI** |
| Reopen an unpublished lock | Runbook allows deputy reopen; `open_round` only `scheduled → open` |
| Recovery from void so later rounds can open | No |
| Mean event-damage tie-break on the public board | Ranking code documents that the field is absent |
| Three project starts (`docs/LANGLANDS-R3-PLAN.md`) | Code freeze is two (`MAX_STARTS_PER_ROUND = 2`) |
| Client INSERT of submissions via RLS | App uses `submit_decision` RPC; direct insert policy still exists |

### Decisions that still need explicit approval

See section 14. Do not invent a judge rubric, a void-recovery rule, a window-stamping rule, or a merge of HTTP-reject vs engine-drop without an operator decision.

---

## 5. Route and feature inventory

Legend: **Browser** = opened in the local Cursor browser against `http://localhost:3000` this audit. **Code** = source only. Authenticated player `/play` and organiser `/room` were **not** opened with a real session.

| Route | Purpose | Auth | Status | Reachable unsigned? | Inspected |
| --- | --- | --- | --- | --- | --- |
| `/` | Redirect to sign-in | public | implemented | yes → `/sign-in` | Browser 1440 |
| `/sign-in` | Team ID or staff email + password | public; signed-in users redirect to `/play` or `/room` | implemented | yes | Browser 1440 + compact; client validation `abc` |
| `/rules` | Field guide / frozen rulebook | public (UI contract said signed-in) | implemented, dark restyle | yes | Browser 1440 |
| `/play` | Map + HUD + desk | configured + unsigned → `/sign-in`; unconfigured preview | implemented | no (when configured) | Browser: redirect only |
| `/play/decide` | Same `GameScreen`, desk open, tab decide | same as `/play` | implemented as alias | no | Code |
| `/play/history` | Same screen, results tab, desk open | same | implemented as alias | no | Code |
| `/play/results` | Same as history | same | implemented as alias | no | Code |
| `/play/fixture` | Local HUD fixture, `NODE_ENV === "production"` → `notFound()` | none; preview mode, persist disabled | **untracked** | yes in `next dev` | Browser 1440 / 390 / 768 |
| `/board` | `GameScreen` standings overlay | same as `/play` | implemented | no | Browser: redirect |
| `/room` | Organiser control room | 401 → sign-in; 403 “Not available.” | implemented | no | Browser: redirect. UI code only |
| `/room/team/[seat]` | Audited support view | organiser | implemented | no | Code |
| `/judge` | UI-contract judge page | n/a | **missing** | 404 | Browser 404 page |
| `/auth/callback` | OAuth callback | — | implemented | n/a | Code |
| `/auth/sign-out` POST | Sign out, 303 to `/sign-in` | session | implemented | n/a | Code |
| `not-found` | Honest 404 | public | implemented | yes | Browser `/judge` |
| `app/error.tsx` | Render failure | — | implemented | not triggered | Code |
| `app/loading.tsx` | “Surveying Ashfen…” | — | implemented | seen during compiles | Browser |
| `SiteHeader` / `CatalogueGrid` | Ivory paper chrome | — | **unmounted** | n/a | Code |

### API routes (code inspection; none invoked with mutating methods against hosted)

| Method | Path | Gate | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | public, 503 if unconfigured | Team bcrypt then GoTrue; organiser email path. **Not called this audit.** |
| POST | `/api/auth/logout` | session cookie | exists; UI sign-out uses `/auth/sign-out` instead |
| GET | `/api/play/clock` | signed-in seated team | status + `serverNow`; no town/submission |
| GET | `/api/play/board` | signed-in participant | published pillars only; 409 if unpublished |
| POST | `/api/rounds/:id/submissions` | seated team | `parseProposal` + `assertAuthoritativeStarts` then `submit_decision` |
| POST | `/api/rounds/:id/open\|lock\|process\|publish\|void` | organiser + service_role RPC | no set-window, no reopen, no pause |
| GET | `/api/rounds/:id/support/:teamId` | organiser | audited support read |
| GET | `/api/room` | organiser | control-room poll |
| POST | `/api/admin/provision-teams` | `TEAM_PROVISION_SECRET` bearer and/or organiser | returns one-time plaintext passwords |

### Player orientation (HUD)

On the **fixture** (preview, not a live team):

- Team line: `Team 004 · Seat 04`
- Round: `2 / 6`
- Status: `OPEN 18:00 left` (did not decrement while watched)
- Available credits: `220 cr` always visible; Reserve visible at the 1440 screenshot
- Event: Heatwave strip
- Save: `Preview only` disabled; status `Preview — not submitted`
- Desk: Budget / Catalogue / Town / Results; player-facing names Habitat, Farming, Resilience
- Map remains the primary surface; desk is a right column (desktop) or bottom sheet (phone)

A real seated `/play` was not opened. Whether live save, hold notice, and clock poll behave on a hosted open round is **unverified**.

---

## 6. Gameplay rules and simulation findings

For each important rule: **code / docs / approved freeze / conflict**.

The freeze in `AGENTS.md` (20 teams, 6 rounds, 18-minute window, 40/25/15/10/10, Pack A, Ashfen, credits, `py-ref-1.1.0`) is treated as organiser-approved product freeze. Older plan text that contradicts it is not approval.

### Teams, users, authentication

| | |
| --- | --- |
| Code | Team ID (`login_id` digits) + bcrypt on `teams.password_hash`, then GoTrue session so `auth.uid()` works. Staff email via `resolveLoginIdentifier`. DQ teams get the same 401 as a bad password. Organiser: `competition_staff.staff_role === 'organiser'`. |
| Docs | `docs/team-provisioning.md`, `docs/security-and-permissions.md`. |
| Approved | Team ID login; no self-registration on the page. |
| Conflict | UI contract `/rules` signed-in only; implementation is public. Judge role exists in schema; no `/judge` UI. |

### Round progression

| | |
| --- | --- |
| Code | `scheduled → open → locked → processing → published`. `void` allowed from open/locked/processing, not published. `open_round` requires predecessor `published` and competition not `paused`. `lock_round` requires exactly 20 teams; does **not** wait for `closes_at`. Process uses frozen `stepRound` twice + checksum. Publish requires 20/20. |
| Docs | Same machine in `docs/database-schema.md` / runbook. Runbook also: extend `closes_at`; reopen unpublished lock; pause on auth outage. |
| Approved | Server-authoritative lock/process/publish; silent hold if missing. |
| Conflict | No window stamp on open. No set-window API. No reopen. Void blocks the rest of the event. |

`open_round` (`supabase/migrations/0006_round_machine.sql` around the `update public.rounds set status = 'open'`):

```sql
update public.rounds set status = 'open' where id = _round_id;
```

It does not write `opens_at` or `closes_at`. `submit_decision` still requires `now()` in `[opens_at, closes_at)` while status is `open`.

### Sectors, catalogue, validation

| | |
| --- | --- |
| Code | Eight engine sectors. Player labels in `CATEGORIES` / `playerSector()` (Habitat, Farming, Resilience, …). Field Guide and unused `CatalogueGrid` still use `SECTOR_LABELS` (Restoration, Agriculture, Infrastructure). Max two starts. Mutex: COAL vs RENEWABLES, REGEN_AG vs INTENSE_AG. HTTP `assertAuthoritativeStarts` **rejects** the whole POST if the engine would drop any start. |
| Docs | `docs/game-rules.md` §7: overspend scales sector spend; excess starts **dropped** in listed order. Field Guide repeats that. |
| Approved | Two starts, eight sectors, catalogue A. |
| Conflict | HTTP reject vs documented drop. Dual vocabulary. Plan doc still says three starts. |

### Budgets and credits

| | |
| --- | --- |
| Code | `available = max(0, reserve + income − maintenance)`. Client `budgetCheck` blocks save when project costs exceed available. Engine still scales sector spend. Starting reserve 220 in fixture and rules page. |
| Docs | Same formula in rules / Field Guide. Browser totals are unofficial. |
| Approved | Credits; remainder is reserve. |
| Conflict | None on the formula. Client remaining-credits display is a proposal until the server accepts. |

### Events

Pack A in `packages/sim/src/constants.ts`: R1 none, R2 HEATWAVE, R3 DROUGHT, R4 FLOOD, R5 CONTAMINATION, R6 none. Fixture round 2 correctly shows Heatwave. Events are identical for all towns; damage depends on that town’s state.

### Simulation engine

`ENGINE_VERSION = "py-ref-1.1.0"`. `npm run test:sim` 54/54 this audit, including Python golden parity. Do not alter coefficients. Label them as game assumptions.

Previous isolated lab (2026-10-19, not re-run): silent hold snapshots 35.99 / 31.84 / 22.16; prudent buffer final 58.41; habitat+buffer won a synthetic set. Those numbers are historical, not re-verified today. `python3 docs/simulation/official_score.py` and `test_engine.py` were **not** run because they write result/golden files.

### Scoring and ranking

| | |
| --- | --- |
| Code | Snapshot uses frozen weights. `final_score = round(0.62 * last + 0.38 * mean, 2)` in the engine. Public board ranks by `rankingScore` (stored `final` if present else snapshot), then ecology, then **lower seat**. Comment in `apps/web/lib/ranking.ts` states mean event damage is not on `TownPublic`. |
| Docs | Tie-break: higher ecology, lower mean event damage, lower seat. |
| Approved | 40/25/15/10/10 and the 0.62/0.38 path. Nobody overrides the number. |
| Conflict | Public ranking omits damage. Product spec forbids judge-entered numeric scores; UI contract still has `/judge`. |

### Save and submission

- Client autosave while dirty (GameScreen). Fixture cannot persist (`mode: "preview"`).
- Live POST requires idempotency key, session membership (not a client Team UUID), open round, `submit_decision` RPC.
- Same key + same body → duplicate; same key + different body → 409.
- After close: RPC not ok → HTTP 403 `closed`.
- Missing at lock → default hold (zero spend, zero starts). Uncommitted `silentHoldNotice` explains this in the HUD.
- DQ submit rejected in `0008` and in PGlite `team-credentials` tests. Hosted apply of `0008` is unverified.

### Clock

`remainingMs` (`apps/web/lib/clock.ts`):

```
offset = clientNow - server
return close - (clientNow - offset)  // == close - server
```

`GameScreen` still passes `Date.now() + tick * 0`. Uncommitted `GameHeader` ticks `Date.now()` every second, but the algebra still ignores elapsed local time. `/api/play/clock` polls every 5s in live mode. Fixture HUD remained `18:00 left` after multiple screenshots. Tests encode the freeze as “counts remaining time from serverNow, not a raw client clock” — they do not assert a ticking display.

Server deadline is still DB `now()`, not the browser. The display bug does not by itself extend the window. It does mislead players.

### Results, leaderboard, publication

Published boards hide allocations/starts. Missing is not scored as zero. Uncommitted copy removed some “organiser publishes” phrasing. Publication requires checksum match. This audit did not process or publish.

### Organiser controls

Implemented: Open, Lock, Process, Publish, Void, 20-seat grid, support read.  
Missing: set/extend window, pause/resume, reopen, un-void, DQ from the room UI (DQ exists in schema/RPC tests, not verified as a Control Room button in this pass).

Void confirm uses the same green primary as Publish (`ControlRoom.tsx` confirm button classes). Previous UX audit called this P0. Still true in source. Not browser-verified (auth blocked).

---

## 7. Frontend and UI/UX findings

### Visual identity

Committed Phase 1 and uncommitted Phase 2 keep dark forest + restrained amber. Fonts: Fraunces + Source Sans 3 (`app/layout.tsx`). This matches the intended game, not a generic dashboard. Do not recommend a full redesign.

### Browser inspections this audit

Local `next dev` on `http://localhost:3000` (this audit started the server; `.env.local` present so middleware may have performed hosted `getUser` **reads**). No login POST. No round actions.

| Page | Viewport attempted | Result |
| --- | --- | --- |
| `/` | 1440×900 | Redirects to `/sign-in` |
| `/sign-in` | 1440×900, compact/phone-like capture | Form, Field guide nav, short intro. Invalid `abc` → `role="alert"` without calling login |
| `/rules` | 1440×900 | Public Field Guide, engine `py-ref-1.1.0`, 2 starts, 220 credits, Pack A, dual sector names |
| `/play` `/board` `/room` | 1440×900 | Unsigned redirect to `/sign-in` |
| `/judge` | compact leftover metrics | 404 “No such page in this competition.” |
| `/play/fixture` | 1440×900, 390×844, 768×1024 | Map-first HUD; desk; preview save disabled |

**Screenshot caveat:** CDP `Emulation.setDeviceMetricsOverride` was used. The 768 capture looked the same as 390 in the screenshot pipeline; treat 768 **visual** as weakly verified. Accessibility tree still showed the desk. 1440 fixture screenshot showed a wider map with Reserve.

**Not opened:** live `/play` as a seated team, `/room` as organiser, `/room/team/[seat]`, hosted production URL.

### UX findings (working tree)

| ID | Sev | Evidence | Issue |
| --- | --- | --- | --- |
| UX-1 | P1 | Browser fixture + `clock.ts` | Countdown does not tick |
| UX-2 | P2 | `/rules` vs `playerSector()` | Restoration/Agriculture/Infrastructure vs Habitat/Farming/Resilience |
| UX-3 | P2 | Field Guide § overspend drop vs HTTP 400 | Players are taught a rule the save API does not follow |
| UX-4 | P2 | `GameHeader.tsx` overflow control | `aria-label="More pages"` but visible glyph is the first letter of the team line (`T` for Team 004) |
| UX-5 | P2 | Phone fixture | Event copy truncates; overflow “T”; desk covers lower map (intended sheet) but action bar competes with the sheet |
| UX-6 | P2 | `ControlRoom.tsx` | Void confirm shares Publish’s green button |
| UX-7 | P3 | `/play/decide` `/history` `/results` `/board` | Four URLs, one screen; easy to bookmark the wrong tab |
| UX-8 | P3 | Unmounted `SiteHeader`, `CatalogueGrid` (`text-ink` ivory) | Dead chrome still in tree |
| UX-9 | P3 | Compact sign-in nav | “RULES / FIELD” clipped in screenshot |
| UX-10 | P1 | Code only | Organiser Open copy talks about “server closing time” the room cannot set |

Phase 1 **did** fix the previous “zero links on sign-in / isolated ivory rules” findings. Students can read the Field Guide before they have a Team ID.

---

## 8. Backend and security findings

### What the server actually enforces

- Round open + DB `now()` vs `opens_at`/`closes_at` in `submit_decision` and in the submissions INSERT policy.
- Membership from session, not from a client-supplied team UUID (`submissions/route.ts` rejects mismatched `teamId`).
- Idempotency in the RPC.
- Organiser RPCs granted to `service_role` only; Next.js checks `requireOrganiser` then calls RPC.
- Engine dry-run before write; official process is server-side.
- DQ blocked in `0008` RPC (PGlite tested).
- `password_hash` column revoked from `authenticated` (`0007`).
- Published board payload strips private keys (`PUBLIC_BOARD_KEYS` in `ranking.ts`).

### What the client only enforces

- Autosave timing, dirty flags, “Preview only”, local eligibility greying, countdown display, budget warning copy.
- A motivated client can still POST a proposal; the server must reject it. That design is correct.

### Confirmed schema/security defects (not probed against hosted)

**P0 — `lock_manifest` readable by every participant**

`lock_round` writes a 20-seat JSON array including `allocations` and `projectStarts` onto `rounds.lock_manifest` (`0006_round_machine.sql`).  
`0004` `GRANT SELECT ON public.rounds TO authenticated` with RLS `rounds_read` for any `is_competition_participant`. No column revoke (contrast `password_hash`).  
Next.js game loaders select a safe column list. The browser still has the anon key. Direct PostgREST `select * from rounds` after lock would expose rival private plans.

This audit **did not** attempt that query against hosted. Evidence: schema + grants. Isolation tests do not cover this column.

**P0 / P1 — no window control**

Runbook: organiser updates `closes_at` only while open. Grep of `*.sql` / `*.ts` finds no `set_closes` / `update_closes` / `extend_round`. `open_round` does not stamp a window. Seed: `2099-06-01` (`supabase/migrations/0005_seed_event.sql`, `supabase/scripts/generate-seed.ts`).

**P1 — void is a dead end**

`predecessor_published` requires `status = 'published'`. `void_round` will not void published rows (good) but leaves later rounds unopenable (bad for recovery). Runbook’s “void then restore previous states” is not implemented as an API.

**P1 — reopen missing**

`open_round` only accepts `scheduled`. Accidental lock cannot be undone except void, which then blocks the successor.

**P2 — no login rate limit**

Grep of `apps/web` finds no rate limiter. Login POST is a hosted auth attempt; not exercised.

**P2 — provision endpoint returns plaintext passwords**

By design, once. Requires `TEAM_PROVISION_SECRET`. Local `.env.local` does not list that key, so local POST would 503. Hosted secret presence unknown. Do not call it.

**P2 — security spec stale**

`docs/security-and-permissions.md` claims it matches schema plus `0002`–`0006`, and that organisers may change `closes_at`. Migrations `0007` and `0008` exist. The closes_at permission is documentation, not code.

**Unverified (explicitly not tested)**

- Hosted RLS from a rival team JWT.
- Whether hosted has applied `0006`/`0007`/`0008`.
- Whether hosted GoTrue allows public signup.
- Concurrent 20-team submits against hosted Postgres (PGlite tests are single-connection).
- CSRF / cookie flags beyond `@supabase/ssr` defaults.
- Production Vercel env, PITR, or pin SHA.

Do not probe production by attempting unauthorised access.

---

## 9. Tests, build results, and coverage gaps

Safety filter applied before each command. None of the executed commands are intended to write hosted data.

| Command | Executed? | Safety note | Result |
| --- | --- | --- | --- |
| `npm run typecheck` | yes | local `tsc --noEmit` | **pass** (sim, round-machine, web) |
| `npm run lint` | yes | `next lint` | **pass** (“No ESLint warnings or errors”) |
| `npm run test:sim` | yes | vitest, no network | **54/54 pass** (`parity` 6, `interventions` 17, `engine` 31) |
| `npm run test:web` | yes | node vitest; bcrypt local | **47/47 pass** (includes uncommitted `game-types.test.ts` and extra `decision` cases) |
| `npm run test:db` | yes | PGlite only (`supabase/tests/vitest.config.ts`) | **32/32 pass** (isolation 14, round-machine 14, team-credentials 4 including DQ submit) |
| `python3 -m unittest` / `official_score.py` | **no** | `test_engine.py` writes TypeScript goldens; `official_score.py` writes JSON | skipped |
| `npm run build` | **no** | may prerender with `.env.local` and mutate `.next` | skipped |
| `npm run organiser:local` | **no** | creates a local organiser account | skipped |
| `npm run seed:sql` | **no** | generates SQL; easy to misuse against hosted | skipped |
| POST `/api/auth/login` | **no** | state-changing hosted auth | skipped |
| Round open/lock/process/publish/void | **no** | forbidden | skipped |

**What these results prove:** the frozen engine still matches its goldens; web helpers typecheck; PGlite RLS/round-machine/credentials tests still pass on the migration files in git.

**What they do not prove:** hosted schema = repo migrations; rival isolation on Supabase; live save; 20 concurrent teams; ranking with event damage; mobile E2E; clock ticking; organiser happy-path in a browser; production build.

**Gaps**

- No Playwright/Cypress.
- No React component tests.
- `packages/round-machine` has no tests (covered only via `test:db` + HTTP not integration-tested).
- No test that `authenticated` cannot `select lock_manifest`.
- No test that `remainingMs` decreases as local time elapses for a fixed `serverNow`.
- No hosted race on unique accepted submission.
- No rehearsal script wired to the room UI.

---

## 10. Competition readiness assessment

**Verdict: NOT READY**

Not CONDITIONALLY READY: the blockers are not “apply one migration and go.” Window control, void recovery, lock_manifest exposure, uncommitted HUD, and unknown hosted state all remain.

Not READY FOR REHEARSAL: a rehearsal that opens rounds on the current hosted project can lock the sequence (void) or open into a 2099 window so nobody can submit. Provisioning 20 teams against a stuck R4 does not create a fair 6-round event.

### Event operations vs this tree

| Need | Status |
| --- | --- |
| Clean 6-round initial state | Seed uses 2099 windows. Hosted last-known (2026-10-19) had R1–R3 published as identical silent holds, R4 void. **Unverified today.** |
| 20 Team IDs | Provision API exists. Last-known hosted login_id count = 1. Local env lacks `TEAM_PROVISION_SECRET`. |
| Open + 18-minute deadline | Open does not stamp the window. No set-window UI. |
| Submission lock | Lock RPC works in PGlite. Organiser can lock immediately after open (no `closes_at` wait). |
| Process + publish | Implemented; checksum; 20/20. Not exercised this audit. |
| Failed / voided round recovery | Void cannot un-void; successor cannot open. |
| Cross-team privacy | Submissions RLS looks correct in PGlite. `lock_manifest` is a hole in the schema. Hosted rival probe not done. |
| Organiser workflow | Room UI exists; missing the controls the runbook tells the organiser to use. Void confirm is the same green as Publish. |
| Concurrent use / performance | Unverified. |
| Complete rehearsal | Missing. Runbook T−7d checklist is not clickable end-to-end. |
| Operator instructions | Runbook exists but is stale (“no production app”, describes APIs that are absent). |

Passing 133 unit/PGlite tests is necessary and insufficient.

---

## 11. Comparison with previous audits

Previous artefacts (outside this git repo):

- Canvas: Langlands R3 event-readiness audit, git `512b033`, 2026-10-19, hosted read-only.
- Canvas: Langlands R3 frontend/UX audit, same git, local unsigned browser.

| Previous finding | Current status | Evidence |
| --- | --- | --- |
| Hosted R4 void blocks R5–R6 | **Unknown hosted; still true in code** | `predecessor_published`; this audit did not re-query PostgREST |
| Opening a round does not start an 18-minute window | **Unresolved** | `open_round` still only sets `status` |
| No HTTP to set/extend `closes_at` | **Unresolved** | grep empty; ControlRoom has no control |
| Accidental lock cannot reopen; void terminal | **Unresolved** | `open_round` scheduled-only; `void_round` |
| 19/20 teams lack login_id (hosted) | **Unknown** | last verified 2026-10-19 only |
| Countdown cannot tick | **Unresolved** (label text improved) | `remainingMs`; fixture stayed `18:00 left` |
| `/` is not a briefing | **Unresolved by design of Phase 1** | still `redirect("/sign-in")` |
| Sign-in had no path to rules | **Fixed** (committed `d510830`) | Browser: Field guide link; `/rules` public |
| `/rules` ivory, no chrome, no way back | **Fixed** | Browser: `PublicChrome`, sign-in link, dark restyle |
| Header packed Decide/Results/Board/Desk | **Partially fixed** (uncommitted) | Desk + overflow menu; overflow shows letter `T` |
| Dual sector vocabulary | **Partially fixed** | Desk uses `playerSector`; Field Guide still `SECTOR_LABELS` |
| HTTP reject vs engine drop | **Unresolved** | `assertAuthoritativeStarts` vs `game-rules.md` §7 |
| Ranking omits mean event damage | **Unresolved** | `compareOfficial` in `ranking.ts` |
| Organiser Void confirm same green as Publish | **Unresolved** | `ControlRoom.tsx` confirm classes |
| Open copy promises a closing time UI cannot set | **Unresolved** | `ACTION_COPY.open` + confirmBody |
| No `/judge` | **Unresolved** | Browser 404 |
| Human judging undefined | **Unresolved / policy** | product spec forbids numeric judge scores |
| RLS only proven on PGlite | **Unresolved** | `test:db` 32 pass; hosted not probed |
| 20×6 rehearsal missing | **Unresolved** | none run |
| `product-specification.md` “Not implemented” | **Unresolved** (docs stale) | file still says that |
| Roadmap Phase 4 next | **Outdated** | play/map/room already committed |
| Login wall is the product | **Partially outdated** | Field Guide is public; game still behind login (correct if credentials exist) |
| 163 tests passed 2026-10-19 | **Outdated count** | 133 vitest today; Python skipped because it writes files |
| `lock_manifest` readable by participants | **Not in previous audits; new confirmed finding** | `0006` + `GRANT SELECT` on `rounds` |

Do not treat “Phase 1 succeeded” as “the event is ready.” Phase 1 only made public entry honest and dark. Phase 2 HUD is still dirty. Mechanics blockers from the full-system audit are still in the source.

---

## 12. Prioritised issue register

Evidence tags: **Confirmed** (seen in this tree and/or this browser pass), **Partially verified**, **Unverified**, **Contradiction**.

| ID | Sev | Evidence | Type | Impact | Next action |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | Confirmed (code) | defect | Open does not create a legal submit window | Spec + implement `opens_at`/`closes_at` stamp on open; do not code until Grok/operator approve the exact duration rule |
| P0-2 | P0 | Confirmed (code) | defect / missing API | Organiser cannot set or extend deadline | Add audited set-window RPC + room UI; update every spec |
| P0-3 | P0 | Confirmed (code) | defect | Voided round bricks the rest of the event | Decide recovery rule, then implement; SQL surgery on hosted is an operator act, not an AI default |
| P0-4 | P0 | Confirmed (code) | defect | Lock cannot be reopened | Decide whether unpublished lock may return to open |
| P0-5 | P0 | Confirmed (schema) | security | After lock, all teams’ plans may be readable via `rounds.lock_manifest` | Column-revoke or split table; add PGlite test; hosted re-grant check |
| P0-6 | P0 | Unverified today | ops | Hosted may still be R4 void / 1 login / 2099 windows | Safe read-only aggregate re-check, then operator-led reset **after** P0-1…4 exist |
| P0-7 | P0 | Confirmed (process) | ops | No 20-team rehearsal | Blocked on P0-1…4 and clean data |
| P1-1 | P1 | Confirmed (code + fixture browser) | defect | Clock display frozen | Fix remaining-time algebra; add a test that local elapsed time decreases remaining ms |
| P1-2 | P1 | Contradiction | rules | Save API rejects dropped starts; rules say drop | Operator chooses; then align Field Guide + HTTP + engine messaging |
| P1-3 | P1 | Confirmed (code) | UX | Void confirm indistinguishable from Publish | Restyle void; still require typed confirm |
| P1-4 | P1 | Confirmed (code) | missing | Pause/resume documented, not implemented | Policy then API; do not fake it in the UI |
| P1-5 | P1 | Confirmed (code) | fairness | Tie-break missing event damage | Add field to public payload **only** if it is non-private; or document that seat is the live third key |
| P1-6 | P1 | Confirmed (git) | process | Phase 2 HUD uncommitted | Commit or explicitly park; do not mix with engine/schema PRs |
| P1-7 | P1 | Partially verified | docs | Runbook/security/roadmap/product spec stale | Sync docs after mechanic decisions; do not “pick one” in code first |
| P2-1 | P2 | Confirmed | UX | Dual sector names | One player glossary; keep engine keys internal |
| P2-2 | P2 | Confirmed (browser) | UX | Overflow control shows `T` | Use a real menu icon; keep aria-label |
| P2-3 | P2 | Confirmed | security hygiene | No login rate limit | Add after mechanics; do not probe hosted |
| P2-4 | P2 | Confirmed | maintainability | Unmounted ivory components; round-machine untested as a package | Delete or mount; add tests |
| P2-5 | P2 | Confirmed | a11y | Phone event truncation; compact nav clip | Polish after HUD commit |
| P2-6 | P2 | Unverified | security | Hosted signup flags, `0008` applied, Vercel env | Operator dashboard review, not an agent login |
| P3-1 | P3 | Confirmed | polish | Multiple aliases of GameScreen | Keep if useful; don’t add more |
| P3-2 | P3 | Preference | design | `/` briefing vs sign-in-first | Phase 1 already chose sign-in-first + Field Guide. Do not reopen without evidence |
| P3-3 | P3 | Policy | product | `/judge` | Decide board-only vs build the page. Do not invent a rubric |

Separate from defects: **do not change scoring weights, catalogue, Pack A, or engine version** to “fix” balance. Previous lab suggested habitat+buffer is strong; that is a balance research question, not an event-blocker, and those numbers were not re-run today.

---

## 13. Recommended implementation sequence and dependencies

Do not start this sequence automatically. It is an order for after an operator asks.

0. **Preserve the dirty tree.** Phase 2 HUD and the copy edits are uncommitted. Commit them as their own PR **or** leave them dirty. Do not squash them into a schema change.
1. **Policy pack (section 14)** before any round-machine SQL.
2. **P0-5 lock_manifest** column privilege + PGlite isolation test. No UI.
3. **P0-1 and P0-2 window stamp + set/extend `closes_at`.** Update `docs/security-and-permissions.md`, runbook, schema doc, Field Guide together. Re-run `test:db`. Do not touch `packages/sim`.
4. **P0-4 reopen** (if approved) as `locked → open` only when unpublished and no `town_states`.
5. **P0-3 void recovery** (if approved) — e.g. allow opening n+1 if n is `void` **or** a replace-void-with-scheduled path. This is a mechanics change; Grok-owned.
6. **P1-1 clock algebra** in `clock.ts` + tests; keep server `now()` as the real deadline.
7. **P1-2 / P2-1 copy alignment** with the chosen validation rule and one glossary.
8. **P1-3 void styling.**
9. **P1-5 ranking** only after deciding whether damage is public.
10. **Hosted:** operator read-only re-check, then a **new** competition seed or approved SQL recovery. Not an agent with the service role wandering in production.
11. Provision 20 dummy teams (provision API; store CSV offline). Never commit passwords.
12. Compressed rehearsal (runbook T−7d) on staging, including rival-account RLS probe and lock_manifest select-as-player.
13. Only then discuss a live event. Pin SHA. No catalogue tweaks.

**Do not:** rewrite the map, add chat, mix human marks into `final_score`, expand to 21 teams, or start Next.js work during a planning-only request.

Dependencies: 3–5 before 10–12. 0 before anything that `git stash` might lose. 2 can proceed in parallel with 0.

---

## 14. Decisions requiring approval before implementation

1. **On open, what is written to `opens_at` / `closes_at`?** (`now()` + 18 minutes vs honour pre-seeded times vs organiser-supplied ISO.)
2. **May an organiser extend `closes_at` while open?** Runbook says yes; code has no API.
3. **May an unpublished lock return to open?** Runbook says deputy may; code forbids.
4. **How does a voided round unblock n+1?** Allow open if predecessor is void? Insert a replacement scheduled round? Manual SQL only?
5. **Invalid starts: reject HTTP 400 (current) or drop as the rulebook says?**
6. **Player-facing sector names:** Habitat/Farming/Resilience vs Restoration/Agriculture/Infrastructure.
7. **Is `/judge` required, or is `/board` the judge surface?** Product spec forbids numeric judge scores.
8. **Is mean event damage public?** If yes, add it to `TownPublic`. If no, publish that seat is the third key.
9. **Commit Phase 2 HUD now, or keep iterating uncommitted?**
10. **Hosted recovery vs new competition row?** Do not reset production without an operator.

Until these are answered in writing, implementers must not “pick one.”

---

## 15. Unverified claims and limitations

This audit did **not**:

- Query hosted Supabase tables, counts, round statuses, or login_id cardinality.
- Sign in as a team or organiser.
- Submit, lock, process, publish, void, provision, or pause anything.
- Open Vercel, change env, or inspect production HTTP beyond the local app talking to whatever `.env.local` points at for `getUser` reads.
- Run Python goldens (`test_engine.test_write_typescript_goldens` writes files).
- Run `next build`.
- Load-test 20 browsers.
- Prove hosted RLS.
- Prove `0007`/`0008` are applied hosted.
- Inspect live `/play` save, `/room` clicks, or support view in a browser.
- Reliably distinguish 768 vs 390 screenshot pixels (pipeline limitation).
- Read private submissions, student names, or secret values.

Claims about hosted R4 / 1-of-20 logins / 2099 windows originate in the 2026-10-19 read-only audit and are labelled **stale until re-read**.

`docs/product-specification.md` “Not implemented” is false as a description of the repo (play/room exist) and true as a description of event readiness.

---

## 16. Handover summary for another AI assistant

You are inheriting a **planning-first competition** whose engine and PGlite round machine are in good unit-test health, whose public entry was restyled in commit `d510830`, and whose **play HUD repair is sitting uncommitted** on `main`. Origin is `d510830`. Do not `git reset`, stash-drop, or commit unless the user asks.

**Read first:** `AGENTS.md`, this file, `docs/game-rules.md`, `docs/scoring-system.md`, `docs/security-and-permissions.md`, `docs/ui-requirements.md`. Grok owns mechanics/schema. Opus owns UI against the UI contract. If docs disagree with code, stop.

**Current product:** dark map-first Ashfen command screen behind Team ID/staff login; Field Guide public; organiser room can walk `open → lock → process → publish → void` but cannot set a clock or recover from void.

**Do not implement in the same breath as reading this.** The user who commissioned this audit said stop after the report.

If later asked to implement, the first safe engineering work is (a) preserve/commit the HUD separately, (b) revoke `lock_manifest` from participants, (c) window stamp + set `closes_at`, after the policy answers in section 14. Do not touch `packages/sim` coefficients. Do not use the service role against hosted to “fix” R4. Do not create accounts. Do not POST login from an audit.

**Fixture:** `http://localhost:3000/play/fixture` is development-only, `notFound()` in production, persist disabled. Use it to look at HUD without credentials.

**Tests that are safe by default:** `npm run typecheck`, `lint`, `test:sim`, `test:web`, `test:db`.  
**Unsafe:** `organiser:local`, `seed:sql`, login POST, round RPCs, `official_score.py` (writes), hosted REST writes.

**Verdict to repeat to humans:** **NOT READY** for rehearsal or a live 20-team event.

---

### Audit integrity

- No source files were edited except the creation of this report.
- Git was not reset, committed, or branch-switched.
- No dependencies installed.
- No Vercel or deploy settings changed.
- No hosted round was opened, locked, processed, published, or voided.
- No accounts created; no decisions submitted.
- Environment values, keys, tokens, connection strings, and private submissions were not written into this file.
- A local `next dev` process was started for browser inspection and is not part of the repository.
