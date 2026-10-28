# Langlands R3 — Launch-day Phase 1 baseline

**Date:** 2026-10-27  
**Mode:** inspect and test only. No implementation, commit, push, deploy, or hosted writes.  
**Verdict:** The working tree can run an **isolated** 20-team six-round event in PGlite. It is **not** ready to launch on the existing hosted competition today.

This file does not overwrite `LANGLANDS_CURRENT_STATE_AUDIT.md` or `LANGLANDS_DELIVERY_2026-10-27.md`.

---

## 1. Git and working-tree status

| Item | Value |
| --- | --- |
| Repo | `/Users/saminajaved/Downloads/LANGLANDS` |
| Branch | `main` tracking `origin/main` |
| HEAD | `d510830` — *Explain the game before sign-in and restyle the public field guide.* |
| Staged | none |
| Ahead/behind | in sync with origin |
| Remote | `https://github.com/mohammad19131-cyber/langlands.git` |

**Committed timeline (origin/main):** initial engine/schema → Team ID login → provision API → map decision screen → results/board → control room → staff-email login → Phase 1 public Field Guide (`d510830`).

**Working tree is dirty.** All useful work is uncommitted. Do not stash, reset, or overwrite it.

### Phase 2 player experience (keep)

HUD/desk/save/clock/fixture — the map-first Ashfen command screen:

- `apps/web/components/game/{GameHeader,ActionBar,CommandDesk,GameScreen,DistrictPanel,EventStrip,Overlays}.tsx`
- `apps/web/lib/{clock,decision,game-types}.ts` and their tests
- Untracked: `apps/web/app/play/fixture/page.tsx`, `apps/web/lib/game-fixture.ts`, `apps/web/lib/game-types.test.ts`

### Unrelated copy edits (keep, do not mix into a mechanics PR)

Shortened “organiser” language to staff/invite:

- `sign-in/page.tsx`, `SignInForm.tsx`, `rules/page.tsx`
- `Leaderboard.tsx`, `ResultsPanel.tsx`, `SupportView.tsx`
- `game-context.ts` staff notice; small `room-ops.ts` pause copy (file also has launch helpers)

### Launch mechanics already in the dirty tree (not on origin)

Security + 18-minute window + reopen (from the earlier delivery pass, still uncommitted):

- `supabase/migrations/0009_lock_manifest_privilege.sql`, `0010_round_windows.sql`
- `apps/web/app/api/rounds/[id]/{window,reopen}/route.ts`
- `packages/round-machine/src/{index,machine,process}.ts`
- `apps/web/components/room/ControlRoom.tsx`, `apps/web/lib/room-ops.ts`
- PGlite tests + `rehearsal.test.ts`
- `docs/security-and-permissions.md`, `docs/database-schema.md`

### Local env (names only)

`apps/web/.env.local` present: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.  
`TEAM_PROVISION_SECRET` is **not** in that file. Values were not read into this report.

---

## 2. Commands and actual results (this audit)

| Command | Ran now? | Result |
| --- | --- | --- |
| `npm run typecheck` | yes | **pass** (sim, round-machine, web) |
| `npm run lint` | yes | **pass** (next lint deprecated warning only) |
| `npm run test:sim` | yes | **54/54 pass** |
| `npm run test:web` | yes | **48/48 pass** |
| `npm run test:db` | yes | **37/37 pass** (isolation 15, round-machine 14, rehearsal 4, credentials 4) |
| `npm run build` | yes | **pass** with webpack cache warning + Supabase Edge `process.version` warning. Routes include `/api/rounds/[id]/window` and `/reopen`. `/play/fixture` is in the build; the page calls `notFound()` when `NODE_ENV === "production"`. |
| `npm run organiser:local` | **no** | would create an account |
| `npm run seed:sql` | **no** | generates SQL; easy to misuse against hosted |
| Login / round RPCs against hosted | **no** | forbidden |
| Browser this Phase 1 | **no** | last fixture clock check was the earlier delivery pass, not this audit |

Scripts live in root `package.json` and `apps/web/package.json`. Engine tests are pure. `test:db` uses PGlite only (`supabase/tests/vitest.config.ts`).

---

## 3. Confirmed working (code + tests this run)

| Area | Evidence |
| --- | --- |
| Simulation / scoring math | `test:sim` 54; `ENGINE_VERSION` `py-ref-1.1.0`; weights untouched |
| Sign-in **code** | Team ID bcrypt then GoTrue; staff email path; client validation; `/` → `/sign-in` |
| Player HUD **code** | Map-first GameScreen; desk; save labels; ticking `remainingMs` unit tests |
| Decision submit **code + PGlite** | `submit_decision` RPC; idempotency; HTTP rejects starts the engine would drop |
| Round machine **PGlite** | open stamps 18 minutes; extend; reopen unpublished lock; lock/process/publish 20/20 |
| Isolated rehearsal | `rehearsal.test.ts` 4/4: mixed submits + holds, 6 published rounds, 20 seats |
| Organiser APIs **code** | open/lock/process/publish/void + new window/reopen routes in the production build |
| Production compile | `npm run build` succeeded |

---

## 4. Confirmed failures and unverified (keep distinct)

### Confirmed (in this tree or this run)

| ID | Sev | File / cause | Proposed fix (do not start until Phase 1 accepted) |
| --- | --- | --- | --- |
| L1 | P0 | Entire launch path is **uncommitted**. Origin is still `d510830`. A reboot or bad git command loses today’s game. | Operator commit after review. This audit must not commit. |
| L2 | P0 | `0009`/`0010` exist only in the working tree. Hosted Postgres does not have them unless an operator applies them. | Apply to a **new/staging** database, never by destructive rewrite of the live event from an agent. |
| L3 | P0 | Seed still uses `2099-06-01` (`0005_seed_event.sql`). Open now overwrites the window **only after `0010` is applied**. | Use `open_round` from this tree; do not hand-edit hosted timestamps from an agent. |
| L4 | P0 | Local env has no `TEAM_PROVISION_SECRET`. Provision API 503s without it. | Operator sets the secret on the event host; do not put it in git. |
| L5 | P1 | `predecessor_published` still requires `published`, not `void`. Voided round n blocks n+1. | Needs an approved void-recovery policy. Do not invent one. |
| L6 | P1 | `compareOfficial` in `apps/web/lib/ranking.ts` skips mean event damage (commented: not on TownPublic). | Policy: publish damage or document seat as the live third key. |
| L7 | P1 | Field Guide still uses `SECTOR_LABELS` (Restoration / Agriculture / Infrastructure); desk uses Habitat / Farming / Resilience. | One glossary after launch-critical work. |
| L8 | P2 | `next build` Edge warning: `@supabase/ssr` imports Node `process.version` via middleware. | Ignore for launch unless middleware fails in production. |
| L9 | P2 | HTTP save rejects dropped starts; `docs/game-rules.md` §7 says drop. | Align copy or API after approval. |
| L10 | P3 | `/judge` missing; unused ivory `SiteHeader` / `CatalogueGrid`. | Out of scope for today. |

### Unverified (not tested in this Phase 1)

- Hosted round statuses, login_id count, whether R4 is still void (last read-only look was 2026-10-19).
- Whether hosted has `0006`–`0008` applied.
- Live Team ID login against hosted (login POST not run).
- Seated `/play` save, autosave, clock poll, hold notice.
- Organiser `/room` clicks (open/extend/lock/process/publish) in a browser.
- 20 concurrent browsers / lab Wi-Fi.
- Hosted RLS from a rival JWT.
- Public GoTrue signup flags.

Do not treat PGlite green as hosted green.

---

## 5. Current product state (code)

| System | State |
| --- | --- |
| Sign-in | Team ID or staff email. Configured unsigned `/play` `/board` `/room` redirect to `/sign-in`. |
| Gameplay | Single map-first `GameScreen`. `/play/decide|history|results|/board` are tab aliases. Fixture is dev-only. |
| Submission | Server-authoritative POST; client cannot persist in preview. |
| Simulation | Frozen `py-ref-1.1.0`. Not changed this audit. |
| Rounds | `scheduled→open→locked→processing→published`; void unpublished only. Window stamp and reopen exist **in this tree**. |
| Organiser | Control room buttons for Open, Add 5 minutes, Lock, Process, Publish, Reopen, Void. Pause/resume HTTP still missing. |

---

## 6. Launch blockers vs polish

**Blockers for a real school event today**

1. Uncommitted tree (L1).
2. Hosted database ≠ this tree (L2, L3) and hosted state unknown.
3. 20 Team IDs not proven on the event host (L4 + unverified logins).
4. No live seated save / room browser pass this audit.
5. Void still a dead end if anyone voids (L5).

**Not blockers (do after a working rehearsal)**

Dual glossary, `/judge`, unused ivory chrome, lint deprecation, webpack cache warning, ranking damage (unless a tie is expected on the day).

---

## 7. Fastest safe path to launch (do not execute in Phase 1)

1. **Preserve:** commit the dirty tree in reviewable slices (HUD, then 0009/0010 + APIs) when the operator asks. Until then, do not stash.
2. **Do not migrate the existing hosted competition from an agent.** Operator decides: new Supabase project / staging vs approved SQL recovery.
3. Apply `0001`–`0010` to that **clean** database. Seed 20 teams. Set `TEAM_PROVISION_SECRET` only on the host.
4. Provision 20 dummy Team IDs; store the CSV offline.
5. Compressed rehearsal: open (confirm ~18 min), one save, extend 5 min, lock, process, publish, through round 6. Rival-account `select` on `round_lock_private` must fail.
6. Only then use the same SHA for the hall.

Do not change catalogue, weights, Pack A, or start limits. Do not redesign the map.

---

## 8. Files changed by this audit

Only this new file:

- `docs/audits/LANGLANDS_LAUNCH_DAY_PHASE1_2026-10-27.md`

No source, migration, or test files were edited. Existing uncommitted work is intact.
