# Langlands R3 — full launch audit

**Date:** 2026-10-28  
**Auditor:** Grok 4.6  
**Rehearsal project (authorised writes only after isolated tests):** `fgqitafevklmuhybuwzw`  
**Production (never modified):** `npwgkqfljrqhvuiateqk`  
**Git at audit start:** `main` @ `2727d28`. Uncommitted tracked diff: none. Pre-existing untracked: `docs/audits/*`, `supabase/tests/event-day-dress-rehearsal.test.ts`.

This file is updated at the end of the same session. The **initial** findings below were recorded before code changes.

---

## Working-tree record

| Path | At audit start |
| --- | --- |
| Tracked unstaged | none |
| Staged | none |
| Untracked (pre-existing, preserve) | `docs/audits/`, `supabase/tests/event-day-dress-rehearsal.test.ts` |

New work in this session is additive. No git reset, stash, commit, push, or deploy.

---

## Confirmed defect: player save

**Symptom:** `clients may only insert accepted or late proposals`

**Source:** trigger `public.submissions_before_write` (`0004`, replaced in `0006` line 106). Fires `BEFORE INSERT OR UPDATE` on `public.submissions`.

**Path:** browser `GameScreen.persist` → `POST /api/rounds/:id/submissions` → `submit_decision` (SECURITY DEFINER, `GRANT` to `authenticated`) → `UPDATE … SET status = 'superseded'` on the previous accepted row → **then** `INSERT` accepted.

`submit_decision` keeps `auth.uid()` as the captain (required for `is_team_member`). The trigger treats any non-null `auth.uid()` as a browser write and allows only `accepted` or `late`. **Supersede is neither.**

| Save | Result |
| --- | --- |
| First accepted insert | Succeeds |
| Identical retry (same idempotency key) | Duplicate, no UPDATE |
| Second distinct plan (autosave hashes a new key) | UPDATE superseded → **exception** |

Isolated tests never issued a second distinct `submit_decision` as `authenticated`, so the suite stayed green.

**Security model is otherwise correct:**

- Column GRANT omits `status`; clients cannot forge it on INSERT.
- No UPDATE/DELETE policy for `authenticated`.
- Scores, budgets, locks, and publication stay server-owned.
- The failure is the trigger blocking the **authorised RPC** supersede, not a missing RLS hole.

**UI inconsistency (same bug family):** autosave fails; local Review still shows staged starts and spend; ActionBar can read “No server save yet” / `0/2 starts` after reload because `ctx.submission` never updated. `serverAccepted` also ORs `submit.status === "success"` with `ctx.submission`, so a failed replacement can disagree with Review.

**Fix (planned, smallest):** allow `accepted → superseded` on UPDATE inside the existing trigger when that is the only status change `submit_decision` performs. Do not grant client UPDATE. Do not weaken INSERT rules. Add a regression that reproduces the second save as `authenticated` **before** asserting the fix.

---

## Player UI (implementation leakage)

Visible copy that does not belong in a finished hall game:

- `Ashfen · shared starting template` (`game-context.ts`, `ashfen.ts`)
- Header control **Desk** / panel **Command desk**
- Save strings: `No server save yet`, `Held if accepted`, checksum-like organiser copy leaking into player adjacent screens
- Map caption uses the town label directly (`GameScreen`)

Keep: round, timer, available credits, two-start limit, overspend warning, official vs unofficial distinction.

---

## Organiser `/room`

Works, but it is a round-machine console: Open / Lock / Process / Publish / Reopen / Void / Restore, plus engine/catalogue hashes. A non-technical operator cannot see a single “next step” story. After Round *n* is published, `nextRoomAction` returns `none` on that row — the operator must click Round *n+1* to open it.

No unattended runner. Process **must** run in Next.js (`runProcessAndMaybeSave` + frozen engine). SQL/`pg_cron` cannot publish scores.

---

## Automation feasibility

| Piece | Existing? | Safe to automate? |
| --- | --- | --- |
| Open + 18-minute stamp | `open_round` | Yes, after predecessor published |
| Lock at `closes_at` | `lock_round` (does not wait for clock today) | Yes, if tick only locks when `now() >= closes_at` |
| Process | Next.js + `claim_process` | Yes, idempotent claim |
| Publish | `publish_round` 20/20 checksum | Yes, after successful process |
| Next open | predecessor gate | Yes |
| Durable scheduler | **No** `vercel.json` cron, no `pg_cron` in repo | Must not pretend |

**Plan:** `competitions.status = live` means automatic progression; `paused` already blocks `open_round`; `closed` after Round 6 publish. `POST /api/event/tick` performs **one** idempotent step. Vercel Cron is documented if `CRON_SECRET` is set; without it, the organiser (or a local poll) must hit tick. Manual `/room` remains the fallback. Do not claim press-once-and-forget until cron + failure tests exist.

---

## Current rehearsal event (read-only at audit start)

Prior session left a **new** `langlands-r3` with Round 1 opened and a Team 001 draft. Window extends were applied. This audit does **not** lock, process, republish, or re-seed that event.

Archived (preserved):

- `langlands-r3-archive-r1r2-20261028` — original R1–R2 published
- `langlands-r3-archive-verify-cycle-20261028` — verification cycle

---

## Prioritised repair plan

1. **P0** Trigger: allow RPC supersede; regression test; map the SQL error to plain language.
2. **P0** Player save UX: one plan object for map bar + Review; never “Saved” without server OK; keep unsaved edits on failure.
3. **P1** Player copy + budget/timer clarity.
4. **P1** Organiser single-path control room + next-round after publish.
5. **P1** Event tick + start/pause using existing status enum; cron documented, not faked.
6. **P1** Security regressions already covered in isolation tests; add second-save + rival checks if missing.
7. Isolated six-round + typecheck/lint/web/sim/db/build.
8. Hosted: apply **0013 only** if SQL path exists; smoke save/reload **without** restarting the live round. Ask before lock/process.

---

## Initial verdict

**NO-GO** for 200 delegates until the save supersede bug is fixed and verified. The hall cannot run if the second save fails.

*(Final verdict is at the bottom of this file after implementation and tests.)*

---

## Final findings (same session)

### Root cause of the player save error

The hall error `clients may only insert accepted or late proposals` is **not** an RLS hole and **not** a missing INSERT grant.

1. Browser `GameScreen.persist` → `POST /api/rounds/:id/submissions`.
2. Server calls `submit_decision` (SECURITY DEFINER, captain JWT still present).
3. On a second distinct plan, the RPC `UPDATE`s the previous row to `superseded`, then `INSERT`s `accepted`.
4. Trigger `submissions_before_write` (from `0006`) treats any non-null `auth.uid()` write as a client write and rejects `superseded`.
5. First save works. Identical retry (same idempotency key) is a no-op. The **second different save** fails. Review kept local staged starts; the map bar showed no server save.

**Fix:** `supabase/migrations/0013_submit_supersede_with_auth.sql` allows only `accepted → superseded` on UPDATE while `auth.uid()` is set. Clients still have no UPDATE policy, no `status` column GRANT, and cannot insert other statuses. Trusted server code still assigns status. Isolated test `supabase/tests/submit-supersede.test.ts` reproduces the second authenticated save and asserts the forged `rejected` UPDATE still fails.

**Hosted:** 0013 is in the repo. It is **not confirmed applied** on rehearsal `fgqitafevklmuhybuwzw`. There is no `DATABASE_URL` in `.env.local`. The Supabase CLI is linked to **production** `npwgkqfljrqhvuiateqk` — `supabase db push` must not be used. Applying 0013 requires the rehearsal SQL editor (or another rehearsal-only SQL path) with operator approval.

### Player UI

Removed player-facing implementation copy (`Ashfen · shared starting template`, Desk / Command desk, `No server save yet`). Map label is `Ashfen`. Header control is **Plan**. Save never says saved until the server confirms. ActionBar and Review share one payload. Failed saves keep the draft and show plain-language errors, including the old trigger message.

Not claimed: a live browser pass of the new `/play` chrome. The existing local `npm run dev` process is serving `/play` as 500 (`ENOENT` under `.next`). No Playwright suite exists in the repo.

### Organiser `/room`

Control room now shows event mode, current round, clock, seated teams, saved plans, not-yet-saved, official holds, next permitted action, and why a step is blocked. Primary actions: Start/Pause automatic, Close submissions, Score, Publish, Open next, Add 5 minutes. Recovery (reopen / void / restore) is behind a disclosure. Confirmations wrap consequential steps.

Official holds now count **lock-manifest holds only**. Unsaved seats during an open round are “not yet saved”, not holds.

### Automation

`competitions.status = live` means automatic tick; `ready` / default is manual; `paused` blocks `open_round`; `closed` after Round 6 publish.

`POST /api/event/tick` (also GET for cron) performs **one** idempotent step: lock after `closes_at`, process, publish, open successor, then mark complete. Organiser `/room` pings tick every 20s while automatic. `apps/web/vercel.json` schedules `* * * * *` on `/api/event/tick`. Cron is inert without `CRON_SECRET` or `EVENT_TICK_SECRET` on the **deployed** Next.js host, and without the site actually being deployed with that file.

**One-start six-round unattended automation is not verified** and must not be promised. Isolated PGlite walks six rounds. There is no hosted cron, no failure-injection of a deployed tick, and the rehearsal competition is currently `ready` (manual). Closing the organiser tab stops the 20s backup ping.

### Security (code review + isolated tests)

Preserved: no client score/budget/lock/publish writes; no `status` GRANT; unpublished towns stay off the public board; password_hash column grants (0012); archived slugs are not `langlands-r3`. Tick without cron secret requires an organiser session. Do not weaken RLS; 0013 does not.

Not verified on the hosted project: authenticated rival-team reads, or a live 200-seat concurrency test.

### Isolated tests run this session (working tree, not hosted)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 warnings) |
| `npm run test:web` | **99 passed** / 17 files |
| `npm run test:sim` | **58 passed** / 4 files |
| `npm run test:db` | **44 passed** / 6 files (includes supersede + six-round dress rehearsal) |
| `npm run build` | pass (Next.js 15.5.28) |

These do **not** prove hosted browser reliability or 200-delegate load.

### Hosted rehearsal (read-only, 2026-10-28)

**Target confirmed:** `NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local` → `fgqitafevklmuhybuwzw`. Production `npwgkqfljrqhvuiateqk` was not written.

| Fact | Value |
| --- | --- |
| Live slug | `langlands-r3` (`b0fc0c90-…`) |
| Competition status | `ready` (manual; automatic off) |
| `current_round_index` | `0` (updated on publish, expected while R1 is unpublished) |
| Round 1 | `open`, no shock, id `8f4a92a0-…` |
| R1 `closes_at` | `2026-10-28T05:34:47.156Z` (**already past**) |
| Rounds 2–6 | `scheduled` (HEATWAVE, DROUGHT, FLOOD, CONTAMINATION, none) |
| Seats | 20, none disqualified |
| R1 accepted saves | 2 (seats 1 and 2). 18 teams have no save |
| Town states / published results | none for this R1 |
| Archives | `langlands-r3-archive-r1r2-20261028`, `langlands-r3-archive-verify-cycle-20261028` |
| `.env.local` cron secret | absent |
| 0013 on hosted | **not confirmed** |

No lock, process, publish, reseed, Team save, or schema apply was performed in this hosted pass. A player save on this open round would rewrite seats 1–2 or create late rows for others — skipped pending approval.

### Unresolved / blocked

1. Apply **0013** on rehearsal SQL only; never `db push` while CLI is linked to production.
2. Hosted second-save / reload still unverified.
3. R1 clock has expired while status remains `open` — lock will hold 18 teams unless the window is extended first.
4. Automatic tick needs a deployed Next.js host + cron secret, or `/room` left open after **Start automatic event**.
5. Local `/play` 500 from a corrupted `.next` cache — restart `npm run dev` before a browser dress rehearsal.
6. No commit / push / deploy was made (as instructed).
7. Production project must stay untouched.

### Release decision

**CONDITIONAL GO** for a **limited rehearsal** on `fgqitafevklmuhybuwzw` after 0013 is applied and the Round 1 window is extended (or the round is deliberately closed with 18 holds). Manual `/room` is the supported hall path today.

**NO-GO** for ~200 delegates / production `npwgkqfljrqhvuiateqk`: hosted second-save is unverified, 0013 is not on the live rehearsal database, unattended six-round automation is not proven, and there is no hosted concurrency or browser evidence.

Do not treat isolated unit tests as a GO.
