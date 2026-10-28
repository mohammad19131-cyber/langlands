# Langlands R3 — security and automation gate

**Date:** 2026-10-28  
**Hosted writes:** none. No `supabase db push`, no commit, no deploy, no round open/lock/process/publish on either cloud project.  
**Minute-cron:** not enabled on a hosted competition.

Project refs (public identifiers, not secrets):

| Role | Ref |
| --- | --- |
| Production (do not write) | `npwgkqfljrqhvuiateqk` |
| Rehearsal named by `apps/web/.env.local` | `fgqitafevklmuhybuwzw` |

## Launch decision

| Gate | Status |
| --- | --- |
| Local implementation | **GO** for the code in this tree (PGlite + unit tests) |
| Local six-round rehearsal | **GO** (PGlite scheduler walk + dress rehearsal) |
| Hosted security verification | **NO-GO** |
| Hosted automation readiness | **NO-GO** |
| Live event | **NO-GO** |

Do not run the hall on hosted data until `0013` and `0014` are applied through an authorised dashboard step, rival-JWT probes pass, and automatic progression is turned on only after that review.

---

## Workstream A — security

### Already secure (local / in-repo)

- Server-authoritative scores, budgets, clocks.
- Captains cannot read rival submissions, `town_states`, or `round_lock_private` (PGlite RLS).
- `/api/play/board` is organiser-only; play payloads strip the 20-town board.
- Next.js loads `published_results` with the **service role** and filters (`ownHistoryFrom`). Tightening authenticated RLS does not break `/api/play/context`.
- `submit_decision` requires `auth.uid()`, team membership, and an open window. Clients have no UPDATE grant on submissions.
- Anon has no `GRANT SELECT` on `published_results` in the migration chain.

### Fixed locally (not on hosted)

**`0014_published_results_own_row.sql`** (forward-only, review-only):

- Replaces `published_results_read`.
- After `rounds.status = 'published'`: own team (`is_team_member`) **or** organiser/judge of **that** competition (`is_staff`).
- No INSERT/UPDATE/DELETE grants. No score/row rewrites.
- PGlite: captain A cannot `SELECT` captain B; own row after publish works; unpublished stays hidden; uninvited authenticated sees 0; organiser/judge see published TownPublic rows; service role still loads all published rows for the app path.

**`0013_submit_supersede_with_auth.sql`** (already in tree; tests strengthened):

- Captain save then resave supersedes the previous accepted row.
- Save does not write `town_states` / `published_results`.
- Rival captain cannot submit for another team.
- Unauthenticated / uninvited `submit_decision` is rejected.
- Direct client UPDATE of `status` still fails.
- Process still charges; a second process is a no-op.

### Hosted verification actually performed

| Check | Result |
| --- | --- |
| `apps/web/.env.local` URL ref | `fgqitafevklmuhybuwzw` (rehearsal), not production |
| Anon `GET /rest/v1/published_results?select=team_seat&limit=1` | **401**. Confirms anon cannot read rows. Does **not** prove captain JWT RLS or that `0014` is applied |
| Captain-A vs captain-B PostgREST | **NOT VERIFIED** (no hosted team JWTs used; no live saves) |
| `0013` / `0014` applied on either cloud project | **NOT VERIFIED** |
| Hosted second-save | **NOT VERIFIED** (would mutate live submissions) |

PGlite stubs `auth.uid()` via `request.jwt.claims`. That is not hosted JWT/PostgREST.

### Operator: apply `0014` (authorised dashboard SQL only)

**Do not use `supabase db push` from this checkout.** The CLI remains linked to production.

1. Open the Supabase dashboard. Confirm the URL project ref is the intended target (`fgqitafevklmuhybuwzw` or `npwgkqfljrqhvuiateqk`). If it is the wrong project, stop.
2. SQL Editor, **read-only pre-check:**

```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
where polrelid = 'public.published_results'::regclass;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'published_results'
order by 1, 2;
```

Expect today’s hosted policy to still mention `is_competition_participant` if `0014` has not been applied. `authenticated` should have SELECT only. `anon` should not.

3. If the pre-check matches that hole, paste the contents of `supabase/migrations/0014_published_results_own_row.sql` and run once.
4. Re-run the policy query. `using_expr` must contain `is_team_member` and must **not** allow any competition participant.
5. Authenticated probes (use two real captain sessions; never print tokens):

- Captain A: `GET /rest/v1/published_results?select=team_seat,team_id,round_index` → only seat A, and only for `published` rounds.
- Captain B: cannot see seat A.
- Unpublished round ids → 0 rows.
- Organiser session: all published TownPublic rows for that competition.
- Anon: still 401 / empty, never rival data.

6. Recovery (only if the new policy is wrong). Recreate the Phase 2 policy from `0004` — this **re-opens** rival reads. Prefer fixing `0014` forward.

### Operator: verify `0013` without mutating the live field

Read-only:

```sql
select pg_get_functiondef('public.submissions_before_write'::regproc);
```

The body must allow `old.status = 'accepted' and new.status = 'superseded'` while `auth.uid()` is set.

Do **not** test save/resave on an in-play hosted round. Use PGlite (`npm run test:db`) or a disposable empty project created by an operator, not rehearsal seats that already have published rounds.

---

## Workstream B — six-round automation

Existing round machine is reused. There is no second lifecycle.

| Piece | Behaviour |
| --- | --- |
| Start | Organiser `POST /api/event/start` sets `competitions.status = live` and opens round 1 **only** from `scheduled`. A second start does not restamp `opens_at` / `closes_at` (`open_round` idempotent). |
| Window | 18 minutes, stamped by `open_round` (`0010`). |
| Tick | One durable step from `rounds` + `closes_at` + `process_checksum`. Lock after deadline → process → publish → open successor → close after round 6. |
| Pause | Does not lock or open. **Does** finish in-flight `locked` / `processing` so a pause cannot strand scoring. |
| Idempotency | `lock_round`, `claim_process` (advisory lock + noop), `publish_round`, `open_round` already CAS. Repeated ticks do not double-score. |
| Failure | Failed process does not publish. Status returns to `locked` when `save_process_run(..., ok=false)`. Next tick retries process. No auto-void, skip, or score edit. |
| Auth | POST tick: organiser session or Bearer `EVENT_TICK_SECRET` / `CRON_SECRET`. GET tick: **secret only** (cookie GET is 401, no mutation). |
| Response | Tick JSON is stripped to `noop` / `status` / `checksum` / `idempotent`. No lock payload, towns, or allocations. |
| Browser | `/room` still pings tick every 20s while `live` as a fallback. It is not the durability mechanism. |
| Cron | `apps/web/vercel.json` schedules `GET /api/event/tick` every minute. **Not deployed in this task.** Deploying it with a tick secret against a `live` competition **will** auto-progress. |

Durable state is `competitions.status` and `rounds.status` / `closes_at` / `process_checksum` / `round_process_runs`. There is no extra scheduler table.

### Local six-round automated rehearsal (20 seats)

PGlite only. Do not point these at rehearsal/production.

```bash
# Scheduler: start once, 18-minute window preserved, lock at deadline,
# one successful process under retry, publish then open n+1, halt after round 6.
# 20 seeded seats (1 save + 19 official holds in the scheduler walk).
npm run test:db -- --run supabase/tests/event-tick-lifecycle.test.ts

# Full 20-seat Pack A walk with five distinct captains (existing dress rehearsal).
npm run test:db -- --run supabase/tests/event-day-dress-rehearsal.test.ts

# Entire local database suite
npm run test:db
```

Do **not** run `npm run organiser:local` or `POST /api/event/start` against `fgqitafevklmuhybuwzw` from this session: rounds 1–2 are already published there; start+tick would try to open round 3.

### Organiser recovery (manual `/room`, never skip)

| Symptom | Action |
| --- | --- |
| Process error / checksum mismatch | Stay unpublished. Retry **process**. Do not publish or edit JSON. |
| `processing` with no successful run | Retry process (claim reclaim). |
| `locked` after failed save | Retry process. |
| Pause mid-open | Teams still bound by `closes_at`. Resume, then tick locks. |
| Pause mid-lock/process | Tick still processes/publishes. Then stops. |
| Predecessor not published / void | Restore the voided round. Do not open n+1. |
| After round 6 published | Competition `closed`. Automation stops. |

---

## Tests run in this session (actual)

| Command | Result |
| --- | --- |
| `npm run test:sim` | **121/121** |
| `npm run test:web` | **116/116** |
| `npm run test:db` | **60/60** |
| `python3 -m unittest discover -s docs/simulation -p 'test_*.py'` | **35/35** |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm run build` | passed |

Scoring weights, catalogue prices, Pack A, and `ENGINE_VERSION` (`py-ref-1.1.0`) were not changed.

---

## Schema limits and remaining blockers

1. **`0014` is not on hosted Postgres.** Rival captains can still `SELECT` published TownPublic rows with a team JWT until it is applied and probed.
2. **`0013` is not confirmed on hosted Postgres.** Second save may still 500 on a live window.
3. **Hosted JWT/GRANT behaviour is NOT VERIFIED.** PGlite is local evidence only.
4. **Rehearsal `fgqitafevklmuhybuwzw` already has published rounds.** Do not start automation there as a test.
5. **CLI is linked to production.** Any `supabase db push` is a production incident.
6. **Vercel cron is not on.** The browser poll is a fallback; a closed organiser tab stops that poll. Enable cron only after security apply + explicit approval.
7. No dedicated scheduler lease table. Concurrency relies on existing round-machine locks. Two Vercel instances are safe for lock/process CAS; they are not a hosted load test.
8. Unrecoverable checksum disagreement still requires a human retry of process — the scheduler will not skip the year.

---

## GO / NO-GO checklist

- [x] Local 0014 policy + PGlite privacy tests
- [x] Local 0013 save/resave/ownership tests
- [x] Local six-round scheduler + dress rehearsal
- [x] Tick GET without secret does not mutate (unit)
- [x] Tick responses no longer include private lock/town payloads
- [ ] Hosted `0014` applied on the intended project
- [ ] Hosted rival-JWT probe
- [ ] Hosted `0013` function body + dummy save on an **empty** project
- [ ] Authorised cron/secret on a dedicated event database
- [ ] Live hall

**Live event: NO-GO.**
