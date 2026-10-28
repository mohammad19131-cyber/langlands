# Langlands R3 — local six-round rehearsal and hosted resave gate

**Date:** 2026-10-28  
**Continues:** `docs/audits/LANGLANDS_FINAL_READINESS_AUDIT.md`  
**Tree:** local working tree. Not committed, pushed, or deployed.  
**Production:** `npwgkqfljrqhvuiateqk` — not written. CLI still linked there. `supabase db push` not run.

Engine: `py-ref-1.1.0`. Scoring, catalogue, grants, Pack A, and gameplay rules were not changed.

**Verdict: GO for local / PGlite six-round rehearsal. NO-GO for hosted dummy save/resave. NO-GO for a hosted hall.**

---

## 1. Six-round local / PGlite results

Disposable PGlite fixtures only (`createPglite` applies `0001`–`0013`). Two independent suites:

| Suite | What it walked |
| --- | --- |
| `event-day-dress-rehearsal.test.ts` | 20 seats, 5 distinct captains, 15 holds, all 6 rounds |
| `rehearsal.test.ts` | 20 seats, 2 spenders, 18 holds, all 6 rounds |

### Pack A

Dress rehearsal timeline events:

`null → HEATWAVE → DROUGHT → FLOOD → CONTAMINATION → null`

Each open window was 18 minutes. Six distinct process checksums (no replay of the same round). Holds at R6 still score the silent golden **6.42**.

### Save and resave

`submit-supersede.test.ts`: first accepted save, second distinct payload accepted, first row **superseded**. Isolated schema includes 0013 (`pg_get_functiondef` contains `old.status = 'accepted' and new.status = 'superseded'`).

Dress rehearsal also retries the same idempotency key (`duplicate`) and rejects post-lock saves (`closed`).

### Credits: save vs process vs publish

| Stage | `town_states` | `published_results` | Cash |
| --- | ---: | ---: | --- |
| After save / resave | 0 | 0 | not charged |
| After successful process | 0 | 0 | deducted in the engine output; stored on the process run |
| After retry process | still 0 | still 0 | no second apply (`noop`) |
| After publish | 20 | 20 | persisted town + reserve |

That is the intended gate: browsers propose; process computes; publish is when towns and official rows appear. Failed process (`round-machine.test.ts`) leaves status `locked`, deletes any partial town/public rows, `_ok: false`. Interrupted claim can be recovered without a double apply; second process is `noop`.

### Next-round order

Dress rehearsal: round N+1 `open_round` is `invalid_transition` until N is `published`. After R6, all six rows are `published`. Reopen after process is refused.

### Ranking and leaderboard

After each publish, `boardForRound` / `compareOfficial` rank by score, ecology, mean event damage, then seat. `meanDamage` is present on processed breakdowns. Unpublished rounds return `{ ok: false, error: "unpublished" }`.

Delegates: `mayReadOfficialBoard(false) === false`; play payloads strip `leaderboard` / `boardByRound`. Organisers: helper allows access; `/api/play/board` stays 403 for non-organisers (web tests). PGlite captains cannot read rival `town_states` or rival submissions under RLS.

Dress rehearsal R6 path scores (first eight seats): 58.98, 55.79, 55.00, 53.85, 7.98, then three silent 6.42 holds in seat order.

---

## 2. Test counts (this pass)

| Command | Result |
| --- | --- |
| `npm run test:db` | **45** passed / 6 files / **0 failed** |
| `npm run test:web` | **103** passed / 18 files / **0 failed** |

`test:db` breakdown: dress rehearsal 2, round-machine 15, isolation 15, rehearsal 4, team-credentials 6, submit-supersede **3** (was 2; added credit/process-hidden and 0013 function fingerprint).

No typecheck/lint/build re-run in this pass (they passed in the readiness audit). No hosted browser tests.

Added local regression: save does not write town/public rows; process writes a successful run without publishing; retry is a no-op.

---

## 3. Migration 0013 status and evidence

**What 0013 does:** `CREATE OR REPLACE` of `public.submissions_before_write`. The only behavioural add is: when `auth.uid()` is set, an UPDATE from `accepted` → `superseded` is allowed (the `submit_decision` autosave path). Direct clients still cannot UPDATE submissions and still cannot set `status` on INSERT.

**Local fixture:** applied. Function body matches the supersede branch.

**Hosted rehearsal `fgqitafevklmuhybuwzw`:** **not confirmed.**

| Check | Evidence |
| --- | --- |
| `apps/web/.env.local` URL ref | `fgqitafevklmuhybuwzw` (verified before the REST read) |
| CLI `supabase/.temp/project-ref` | `npwgkqfljrqhvuiateqk` (production) — writes via CLI refused |
| Postgres URL / management token in env | **absent** — cannot `pg_get_functiondef` from this machine |
| PostgREST `schema_migrations` | **404** (public and `supabase_migrations` schema) |
| Function source via REST | not exposed |

This environment cannot see the live trigger body. Status is **unknown**, not “missing” and not “applied”. 0013 was **not applied** from here.

### SQL Editor steps (operator, rehearsal project only)

1. Open the Supabase dashboard and confirm the project ref in the URL is **`fgqitafevklmuhybuwzw`**. If it is `npwgkqfljrqhvuiateqk`, stop.
2. SQL Editor, read-only:

```sql
select pg_get_functiondef('public.submissions_before_write'::regproc);
```

3. **Already applied** if the definition contains:

```sql
old.status = 'accepted' and new.status = 'superseded'
```

Do nothing further.

4. **Missing** if that line is absent. Paste and run once, on this project only, the contents of `supabase/migrations/0013_submit_supersede_with_auth.sql`. It replaces one trigger function. Do not use the CLI. Do not run it on production. Do not paste passwords into chat.

---

## 4. Hosted dummy save / resave

**Not run.** Two independent stop conditions:

1. **0013 status unknown** — Task 3 is only after confirmation.
2. **No safe open round.** Read-only live slug `langlands-r3` (`b0fc0c90-…`), status **`ready`**, Pack A codes intact:

| Round | Status | Event |
| ---: | --- | --- |
| 1 | published | none |
| 2 | published | HEATWAVE |
| 3 | published | DROUGHT |
| 4 | scheduled (opens 2099-06-01) | FLOOD |
| 5 | scheduled | CONTAMINATION |
| 6 | scheduled | none |

R1–R3 are closed and already have real published results. Saving on them would be late or rejected. Opening R4 would start a round for all 20 live seats. Automatic progression was not started from this session.

There is no isolated dummy competition. Using seats 001–020 would mutate real rehearsal submissions.

**Do not lock or process hosted rounds to test save.**

---

## 5. Remaining risks

| Risk | Severity | Notes |
| --- | --- | --- |
| Hosted second-save still depends on 0013 | High for `/play` autosave | Unknown on rehearsal until SQL Editor check |
| Hosted R1–R3 already published | Timing | Hall has moved; R4 is the next live round and is parked in 2099 |
| These UI/API changes are un-deployed | High for a hosted hall | Local tree only |
| CLI linked to production | Operational | Any `db push` is a production incident |
| Published rows without `meanDamage` | Ranking | Older hosted publishes skip that tie-break until a new process writes the extra key. Do not rewrite old scores |
| Save API still rejects illegal starts wholesale | Documented | Process-time engine would drop them; live save is stricter |

---

## 6. Local vs hosted claims

**Verified locally (PGlite / unit tests)**

- Full six-round loop with Pack A, 18-minute windows, save, resave, lock, process, hidden results, publish, next-round gating.
- Credits unchanged at save; engine charges at process; public rows appear at publish.
- Failed and retried process do not double-apply.
- Official ranking order including mean damage.
- Delegates denied board helper and stripped play payload; organisers retain the helper.

**Verified hosted (read-only REST, rehearsal URL only)**

- Project ref `fgqitafevklmuhybuwzw`.
- Live competition `langlands-r3` is `ready`; R1–R3 published; R4–R6 scheduled in 2099.
- CLI still production.
- Migration catalogues not readable via PostgREST.

**Not verified hosted**

- 0013 function body.
- Dummy save / resave / `/play` reload.
- Lock, process, publish, tick.
- Browser leaderboard 403 against the deployed origin.

---

## 7. GO / NO-GO

| Scope | Recommendation |
| --- | --- |
| Local / PGlite six-round rehearsal | **GO** |
| Hosted dummy save/resave on live `langlands-r3` | **NO-GO** (0013 unknown; no safe open dummy round) |
| Hosted hall with automatic progression | **NO-GO** — keep tick disabled |
| Production database | **Do not touch** |

After an operator confirms 0013 on the rehearsal SQL Editor, the dummy save still needs a **non-live** open round (throwaway competition or a dedicated dummy event), not R4 of the current 20-team hall.
