# Langlands R3 — final event readiness

**Date:** 2026-10-28  
**Previous gate:** `docs/audits/LANGLANDS_SECURITY_AND_AUTOMATION_GATE_2026-10-28.md` (re-checked against the repo in this session).

## Status

| Gate | Decision |
| --- | --- |
| Core gameplay | **GO** (local engine, catalogue, Pack A) |
| Local six-round rehearsal | **GO** (PGlite, 20 dummy seats) |
| Hosted privacy and access control | **NO-GO** |
| Automated round progression | **NO-GO** for hosted; **GO** for local scheduler code |
| Browser-tested player and organiser flows | **NO-GO** (ungated UI only; no safe hosted login) |
| **Live event** | **NO-GO** |

Hosted writes this session: **none**. Commits, pushes, deploys: **none**. `supabase db push`: **not run**. Minute-cron: **not enabled**.

Project refs (public, not secrets): production `npwgkqfljrqhvuiateqk`; `apps/web/.env.local` points at rehearsal `fgqitafevklmuhybuwzw`.

---

## Gate 1 — previous security + automation gate

Re-read the report and the files it names.

| Claim | Evidence this session |
| --- | --- |
| `0014_published_results_own_row.sql` exists, own-row SELECT, not applied hosted | File present. PGlite `published-results-privacy.test.ts` **10/10**. Hosted apply **NOT VERIFIED**. |
| `0013` save/resave locally | `submit-supersede.test.ts` **5/5** (save, resave, no charge, rival deny, unauthenticated deny). Hosted function body / second-save **NOT VERIFIED**. |
| Hosted participant JWT permissions | Still **NOT VERIFIED**. Anon REST only (below). |
| Scheduler durable / idempotent | `event-tick-lifecycle.test.ts` **2/2**; `event-readiness-drills.test.ts` **3/3**. |
| Process/publish cannot double | Second `processClaimedRound` is a no-op; extra ticks after success no-op. |
| Failed process cannot advance | Failed process stays `locked`, 0 `published_results`; bad checksum publish refused. |
| Scoring / Pack A unchanged | `git diff` on `packages/sim/src`, `docs/scoring-system.md`, `docs/simulation/engine.py`, `official_score.py` is empty. Engine `py-ref-1.1.0`. |

Critical hosted blockers remain. Local testing continued. Live event stays **NO-GO**.

---

## Gate 2 — six-round rehearsal (isolated)

**Target:** in-process PGlite. Not rehearsal, not production.

**Dummy teams:** 20 seeded seats in every PGlite seed (`seed_langlands_r3`).

| Run | Teams actually exercised | Outcome |
| --- | --- | --- |
| `event-tick-lifecycle.test.ts` | 20 seats (1 authenticated save + 19 official holds), all 6 Pack A rounds via `planEventTick` + lock/process/publish/open | Pass. Start does not restamp the 18-minute window. Round n+1 opens only after n is published. After round 6, status `closed`, further start refused. Silent path score matches `play()`. |
| `event-day-dress-rehearsal.test.ts` | 20 seats; **5** distinct authenticated captains (seats 1–5) plus **15** holds; all 6 Pack A rounds | Pass. Events `null, HEATWAVE, DROUGHT, FLOOD, CONTAMINATION, null`. Window **1,080,000 ms**. Official checksums (SHA-256 of 20 town hashes): R1 `2053c74c…ca8087a3`, R2 `c3c51809…5204b8c2`, R3 `f14da9be…1b3b8bc6`, R4 `7e5967dd…ca2dbfa7`, R5 `078d1c48…2e629a26`, R6 `1c9c9aac…7a55db8c`. Round-6 scores (official engine, not the browser): seat 1 **58.98**, 4 **55.79**, 2 **55**, 5 **53.85**, 3 **7.98**, silent holds **6.42**. |
| `event-readiness-drills.test.ts` | **20** dummy captains each save + same-key retry | Pass. 20 accepted rows. 0 `town_states` until publish. Stolen claim then one process; bad checksum publish refused. |

Commands:

```bash
npm run test:db -- --run supabase/tests/event-tick-lifecycle.test.ts
npm run test:db -- --run supabase/tests/event-day-dress-rehearsal.test.ts
npm run test:db -- --run supabase/tests/event-readiness-drills.test.ts
```

This is **not** a hosted 20-laptop hall. PGlite uses stub `auth.uid()`. It **is** the real TypeScript engine and catalogue.

---

## Gate 3 — browser tests actually performed

Existing `npm run dev` on port **3000** was returning **500** (`MODULE_NOT_FOUND` for `.next/server/pages/_document.js`). It was **not** killed.

A separate server was started:

```bash
cd apps/web && NEXT_DIST_DIR=.next-readiness npx next dev -p 3010
```

`.env.local` still names rehearsal. **No Team ID/password was submitted.** No organiser login. No hosted round was opened.

| Surface | Result |
| --- | --- |
| `GET /sign-in` | 200. Team ID + password form. No self-registration copy. |
| `GET /play/fixture` | 200. Map-first Ashfen, seat 04, round 2/6, heatwave strip, **220 cr** available/reserve, countdown, unofficial-preview banner. Civic Quarter panel opens. Plan panel shows eight sector allocations. **Preview only** save control is **disabled**. |
| `GET /rules` | 200. Engine `py-ref-1.1.0`, 20 teams, 6 rounds, 18 minutes, catalogue and scoring. Stale “others’ pillar scores” copy was corrected to organiser-only board (matches `game-rules.md`). |
| `GET /play`, `/room`, `/board` | **307** to `/sign-in` without a cookie (browser + curl). |
| Authenticated captain session | **NOT RUN** — would hit rehearsal Auth. |
| Authenticated organiser `/room` | **NOT RUN**. |
| Save/resave in the browser | **NOT RUN** (fixture cannot submit; live save would write rehearsal). |

### Manual steps still required (operator, dedicated empty event DB)

1. Confirm the Vercel/`NEXT_PUBLIC_SUPABASE_URL` ref is the event project, not `npwgkqfljrqhvuiateqk` and not a competition with published rounds unless that is the event.
2. Sign in as seat 01. Confirm Ashfen, own town only, no 20-town board.
3. Save, edit, resave while open. Confirm credits do not drop until process.
4. Sign in as seat 02 in another browser. Confirm seat 01 plan is invisible.
5. Sign in as organiser at `/sign-in` (staff email). Open `/room`. Start **once**. Watch 18:00. Do not press Start again to restamp.
6. After publish, player `/play/results` shows **own** history only. `/board` 403 for captains.

---

## Gate 4 — privacy and security (what was actually run)

### Local (PGlite)

- Captain A cannot read B’s `published_results`, submissions, `town_states`, or lock payload.
- Own published row readable after publish; unpublished hidden.
- Uninvited authenticated: 0 result rows.
- Organiser/judge of that competition: published TownPublic rows.
- Captains cannot `open_round` / `lock_round`.
- `GET /api/play/board` helper `mayReadOfficialBoard(false) === false`.

### Hosted (read-only, rehearsal URL, anon key, no tokens printed)

| Request | HTTP |
| --- | --- |
| `published_results?select=team_seat&limit=1` | **401** |
| `submissions?select=id&limit=1` | **401** |
| `town_states?select=team_id&limit=1` | **401** |
| `rounds?select=round_index,status&limit=6` | **401** |

Anon cannot read those tables. That does **not** prove `0014` (captain JWT still unverified) or that `0013` is applied.

### Local Next on :3010 (no session)

| Request | HTTP |
| --- | --- |
| `GET /api/event/tick` | **401** `{ ok: false, error: "unauthorized" }` — no mutation |
| `POST /api/event/tick` | **401** |
| `POST /api/event/start` | **401** |
| `GET /api/play/board` | **401** |
| `GET /api/room` | **401** |

---

## Gate 5 — failure and recovery drills (PGlite)

| Drill | Result |
| --- | --- |
| Worker “restart” while round 1 is open | Tick is `idle`. Second start does not restamp `opens_at`/`closes_at`. |
| Same idempotency key after a dropped response | `duplicate`; still one accepted row per team. |
| Stolen process claim (second `claim_process` before `save_process_run`) | First save **stale process claim**. Retry process succeeds **once**. 20 towns. Extra ticks no-op. |
| Publish with wrong checksum | Refused. 0 `published_results`. Status not `published`. Fix checksum, publish once. |
| Captain tries to open/lock | 403. |
| Tick after `closed` | `complete`. Start refused. |
| Failed process (19 lock rows) | Already covered in lifecycle: stays `locked`, 0 pubs. |
| Two successful process attempts | Second no-op (round-machine + drills). |

**Schema limit (do not “fix” by deleting rows):** `claim_process` advisory lock lasts only for that SQL call. The Node simulation sits **outside** the lock. Two workers can steal the claim token if both claim before either saves. **Recovery:** retry **process**. Do not publish, void, or skip. Next successful save wins; the stale save fails.

PGlite is one connection: 20 **parallel HTTP** JWTs and two Node workers were **not** run. Sequential 20 captain saves were run.

---

## Gate 6 — performance note and operator runbook

20 sequential authenticated saves in PGlite succeeded. That is **not** a 20-laptop load test. No rate-limit, pooler, or Vercel timeout evidence.

### Pre-event

1. Dashboard URL ref = intended event project.
2. CLI `supabase/.temp/project-ref` is production — **never** `supabase db push` from this machine.
3. Apply `0013` then `0014` in the SQL editor if the pre-checks show they are missing (scripts in the previous gate report).
4. Rival-JWT probe: captain A cannot `SELECT` captain B `published_results`.
5. `select pg_get_functiondef('public.submissions_before_write'::regproc);` contains the accepted→superseded exception.
6. 20 captains provisioned (`POST /api/admin/provision-teams`). One-time CSV only; do not commit it.
7. Vercel env: URL/anon/service role/`TEAM_PROVISION_SECRET`. Add `EVENT_TICK_SECRET` or `CRON_SECRET` **only** when auto-progress is authorised. Deploying `apps/web/vercel.json` (`GET /api/event/tick` every minute) **starts** auto-progress if the competition is `live`.

### Start once

1. Organiser signs in → `/room`.
2. **Start event** → `POST /api/event/start` (`slug` `langlands-r3`). Opens round 1 for 18 minutes if `scheduled`.
3. A second Start does not restamp the window.
4. Monitor `/room`. Fallback poll is every 20s while `live` and the tab is open. Cron is the durable worker **after** explicit enable.

### During a round

- Players: `/play` save/resave. Server clock is truth.
- At `closes_at`: tick **lock** → **process** → **publish** → **open** next.
- Publish writes the 20 `town_states` and `published_results` together. Players see official results after `published`.

### Failures

| Symptom | Action |
| --- | --- |
| Process / checksum error | Stay unpublished. Retry **process**. Do not publish or edit JSON. |
| `stale process claim` | Retry process. |
| `processing` with no successful run | Retry process (reclaim). |
| Pause during open | Resume; tick will lock after `closes_at`. |
| Pause during lock/process | Tick still process/publish, then stops. |
| Predecessor not published | Restore void if needed. Do not skip a year. |
| After round 6 published | `closed`. Stop. |

### Confirm results

- Organiser `/board` and `/room`.
- Player `/play/results` = own history only.
- `published_results` count 20 per published round.

### Who to call

Operator with dashboard SQL access (migrations, JWT probe). Do not give captains the service-role key.

---

## Gate 7 — quality commands (this session, actual)

| Command | Result |
| --- | --- |
| `npm run test:db -- --run supabase/tests/event-tick-lifecycle.test.ts supabase/tests/event-day-dress-rehearsal.test.ts supabase/tests/event-readiness-drills.test.ts supabase/tests/published-results-privacy.test.ts supabase/tests/submit-supersede.test.ts` | **22/22** (5 files) |
| `npm run test:db` | **63/63** (10 files) |
| `npm run test:sim` | **121/121** (6 files) |
| `npm run test:web` | **116/116** (22 files) |
| `python3 -m unittest discover -s docs/simulation -p 'test_*.py'` | **35/35** (`OK`, 0.029s) |
| `npm run typecheck` | passed (`tsc --noEmit` for sim, round-machine, web) |
| `npm run lint` | passed (`No ESLint warnings or errors`) |
| `NEXT_DIST_DIR=.next-readiness-build npm run build` | passed (Next.js 15.5.28). Next auto-added `.next-readiness-build/types` to `apps/web/tsconfig.json`; that include was reverted. Isolated dirs are gitignored. |

Working tree: **dirty** (this work plus earlier uncommitted HUD/save/0013/0014/audits). Scoring/engine sources vs `HEAD` (`2727d28`): **unchanged**. Catalogue/events/rules markdown diffs are documentation alignments from earlier work, not formula changes. No secrets added to tracked env files. `.env.example` still has empty `EVENT_TICK_SECRET`.

This session also: `supabase/tests/event-readiness-drills.test.ts`; `/rules` copy aligned with organiser-only board; `.gitignore` entries for `.next-readiness/` and `.next-readiness-build/`.

---

## Remaining blockers (live event)

1. Apply and probe **`0014`** on the event database with two captain JWTs.
2. Confirm **`0013`** on that database; dummy save/resave only on an empty project, not rehearsal R1–R2.
3. Authenticated browser pass for captain + organiser against that empty/event DB.
4. Enable cron **only** after 1–3, on a competition that is meant to auto-progress.
5. Do not start automation on `fgqitafevklmuhybuwzw` (published rounds already exist).
6. Hosted 20-way concurrent save/lock: still unrun.

Until those are done, **do not run the hall.**
