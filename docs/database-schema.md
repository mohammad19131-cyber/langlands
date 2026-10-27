# Database schema

Status: specification. SQL draft: `docs/schema.sql` (preserved). Forward migrations: `0001`–`0006` in `supabase/migrations`. Phase 2 adds `published_results`, a six-round check, and an idempotent seed. Phase 3 adds lock-manifest / process-claim columns and round-machine RPCs. Audit: `supabase/SECURITY-AUDIT.md`.

## Principles

- Postgres 15+ / Supabase.
- `authenticated` never writes `town_states`, scores, process runs, or audit rows.
- One competition row, exactly 20 teams (`team_count = 20`, unique `seat` 1–20).
- One accepted submission per team per round (partial unique index).
- Idempotency: unique `(round_id, team_id, idempotency_key)`.

## Entities

```
profiles ──< team_members >── teams >── competitions
                │                           │
                │                           ├── rounds
                │                           ├── catalogue_projects
                │                           ├── town_templates
                │                           └── competition_staff
                │
                └── submissions (round, team)
                └── town_states (round, team)          -- private; own team + organiser
                └── published_results (round, team)    -- TownPublic; after publish
```

Also: `round_process_runs`, `audit_logs`. `competitions.round_count` is exactly 6. `created_by` may be null when the row is system-seeded.

Column-level detail is in `docs/schema.sql`. Do not fork a second schema in application code.

## Official-score deltas (not yet in `schema.sql`)

1. `town_states.score_breakdown` JSON **must** contain:

```json
{
  "ecology": 0,
  "welfare": 0,
  "economy": 0,
  "resilience": 0,
  "efficiency": 0,
  "penalty": 0,
  "snapshot": 0
}
```

2. `town_states.final_score` is the path blend after that round (running official score). After round 6 this is the ranking number.

3. Check constraint on submissions: `cardinality(project_starts) <= 2`.

4. `rounds.event_code` allowed values: `NULL`, `HEATWAVE`, `DROUGHT`, `FLOOD`, `CONTAMINATION`.

5. `catalogue_projects` seeded with the 15 codes in `interventions-catalogue.md`. `competitions.catalogue_hash` is SHA-256 of canonical JSON of that seed.

6. Add `submissions.checksum` of the normalised allocations the server actually applied (after scaling / dropped starts).

## Constraints worth repeating

- `closes_at > opens_at`
- Submission **insert** allowed only if round `status = open` AND `now() < closes_at` AND `now() >= opens_at` (database `now()`, not browser time)
- `profiles.role` cannot be self-promoted (update policy keeps role unchanged)
- `disqualified` on teams does not delete them; processor still writes their state

## Row level security

Full policies: `docs/schema.sql` and `security-and-permissions.md`.

Summary: teams read own submissions and own `town_states`; rivals never read `town_states`. After the round is `published`, participants and judges read `published_results` (TownPublic columns only). Organisers may read live submissions and private states (support view). **No** authenticated insert on scores or `published_results`.

## Migrations

Forward-only. Catalogue freeze is a data migration with hash stored on `competitions`. Never edit published `town_states` in place; void the round instead (`deployment-and-event-runbook.md`).

`0009` stores full lock captures in `round_lock_private` (no browser GRANT) and keeps a public seat summary on `rounds.lock_manifest`. It also copies any pre-0009 full JSON into the private table and strips the public column. `0010` stamps an 18-minute window on `open_round`, adds `set_round_window` (organiser, while `open`), and `reopen_round` (unpublished `locked` only, before `town_states`). `0011` lets an organiser restore an unpublished `void` round to `scheduled` so the same round index can be opened again. Void does not count as published and does not skip Pack A. `0012` replaces table-level `GRANT SELECT` on `teams` with column grants so `authenticated` cannot read `password_hash`.
