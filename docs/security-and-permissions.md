# Security and permissions

Status: canonical. Matches `docs/schema.sql` plus `0002`–`0006`. Isolation and round-machine tests: `npm run test:db` (PGlite, locally verified). Hosted re-test is still required after `supabase db push`.

## Trust boundary

Everything the browser sends is a **proposal**. The server decides:

- whether the round is open (`now()` vs `opens_at` / `closes_at`)
- how many credits the town actually has
- which catalogue codes exist
- what the new town state is
- what the score is

Rejected as authoritative input: scores, remaining budget, timestamps, map-derived outcomes, “predicted damage”.

## Roles

| Role | Scope |
| --- | --- |
| `member` | Play on one team |
| `captain` | Same play rights as member (last accepted write wins). No extra secrets. |
| `judge` | Read published outcomes and own-competition towns; no live rival budgets |
| `organiser` | Round machine, support view (audited), DQ flag, pause |

There is no “admin edits the score” role.

## Permission matrix

| Action | Member | Captain | Judge | Organiser |
| --- | --- | --- | --- | --- |
| Sign in | yes | yes | yes | yes |
| Read rulebook / catalogue | yes | yes | yes | yes |
| Read own town | yes | yes | yes | yes |
| Write allocations / starts | yes | yes | no | no |
| Read rival live submission | no | no | no | yes, audited |
| Read rival published pillars | after publish | after publish | yes | yes |
| Open / lock / process / publish | no | no | no | yes |
| Change `closes_at` | no | no | no | only while `open` |
| Disqualify | no | no | note only | yes |
| Override `final_score` | never | never | never | never |

## RLS (enforced in Postgres, not only in Next.js)

- `submissions_team_insert`: membership + round open + time window. Client INSERT is limited to proposal columns.
- `submissions_team_read`: own team or **organiser** (not judge).
- `town_states`: own team or organiser. Rivals never. Judges never.
- `published_results`: same-competition participants, judges, and organisers, and only when `rounds.status = 'published'`.
- `town_states` / `published_results` insert/update/delete **revoked** from `authenticated`.
- `audit_logs` insert revoked from `authenticated`; organisers select.
- Profile update cannot change `role` (column grant + trigger). Signup always inserts `member`.

Next.js still checks session and team on every action so error messages are clean. RLS is the backstop.

## Submissions

`POST` with header `Idempotency-Key` (UUID).

- Same key + same body → 200, same row.
- Same key + different body → 409, no change.
- New key while open → previous `accepted` becomes `superseded`, new `accepted` row.
- After close → 403; if stored, `late`.

`client_claimed_at` is logged and ignored.

## Round processor

- Service role only, from the server runtime, after `pg_advisory_xact_lock`.
- CAS on `round.status` plus process claim token.
- Replay engine twice; publish iff 20 rows and checksums match.
- Failed `save_process_run` reverts to `locked` and deletes partial rows. A crash after claim with no successful run stays `processing` and is safe to reclaim. Never half-published.

## Isolation tests that must exist

- Team A `select` on team B submission → 0 rows. **Done locally** (`npm run test:db`).
- Rewound client clock cannot insert after `closes_at`. **Done locally**.
- Two members concurrent save → one `accepted`. Unique index plus `submit_decision` supersede. Parallel HTTP against hosted Postgres is unrun.
- `authenticated` insert into `town_states` fails. **Done locally**.
- Processor called twice → second attempt no-ops if a successful run exists. **Done locally** (sequential CAS on PGlite; not a multi-connection hosted race).
- Organiser support GET writes `audit_logs.action = support_read`. **Done locally**.

## Auth recommendation (frozen unless ops objects)

Team ID (seat `01`–`20`) **and password**. No Google, no magic-link email in the player UI. No public sign-up. No 21st team. Auth users are `seat-NN@teams.langlands.app`, linked to seats via `team_members`.

## Secrets

Service role key: server env only, never `NEXT_PUBLIC_*`. Anon key is fine in the browser with RLS on.
