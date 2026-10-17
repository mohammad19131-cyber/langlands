# Deployment and event runbook

Status: canonical ops. No production app exists yet.

## Environments

| Name | Use |
| --- | --- |
| Local | Engine tests, RLS via Supabase local (Phase 2+) |
| Preview | PRs; must not be confused with the live board |
| Staging | 20 dummy teams, rehearsal |
| Production | Pinned git SHA, PITR on |

`ENGINE_VERSION` = git SHA + `packages/sim` semver field + catalogue hash prefix.

## Deploy steps (when the app exists)

1. Golden tests green.
2. Migrate staging, seed 20 dummy teams, run one compressed 6-round script.
3. Promote the same SHA to production.
4. Freeze catalogue; refuse late “just one project tweak”.

Service role on the server only. No demo flags in the production build.

## Failure table

| Failure | Response |
| --- | --- |
| Submit 5xx while `open` | Client retries **same** idempotency key |
| Processor crash | If claim never succeeded, round stays `locked`. If claim succeeded with no successful run, status is `processing`; retry `POST .../process` retakes the token. Failed `save_process_run` deletes partial rows and reverts to `locked`. Never publish 19 towns |
| Checksum mismatch | Stay locked; dump both replays; do not hand-edit JSON |
| Auth outage | Pause competition; do not silently extend after the fact |
| Need more time | Organiser updates `closes_at` **only while `open`**, audited |
| Lab Wi‑Fi down 5 minutes | If still `open`, extend `closes_at`. If `locked` unpublished, wait and process. If `published`, do not rewind |
| Wrong catalogue after publish | `void` the round, restore previous states as current, new engine version. Never patch published rows |
| Abandoned team | Default hold (rules §6) |
| Organiser misclick lock | If unpublished and before process, deputy may `open` again with audit. After `town_states` exist, no reopen |
| Tie | Scoring tie-break; no organiser vote on the number |

## Recovery

- PITR enabled before rehearsal.
- Snapshot after every `published` round.
- Export `audit_logs` after the event.

## 20-team rehearsal

| When | Work |
| --- | --- |
| T−14d | Freeze rules, catalogue, pack A, golden tests |
| T−10d | Provision 20 dummy teams, 1 organiser, 1 deputy, 1 judge |
| T−7d | Six rounds at 5 minutes each |
| T−7d checks | 20/20 process, checksum, rival-account RLS probe, late reject, silent hold, map updates only on publish, audit export |
| T−3d | Restore from backup; prove processor retry |
| T−1d | Production pin, paper rulebook, status contact |
| T0 | Live. No engine change |

Compressed rehearsal timings are ops-only; live windows stay 18 minutes unless the organiser publishes a change before the event.

## Hall screen

Read `/board` after publish. If a round is processing, show the wait state, not the last board labelled as current.

## After the event

Release a debrief pack: catalogue, pack A, engine version, each team’s own submission history, published pillars. Rival full allocations only if the organiser opted into that in the briefing.
