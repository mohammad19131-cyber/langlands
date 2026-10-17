# Product specification

Status: canonical planning spec. Not implemented.

## Product

**Langlands R3 Environmental Strategy Challenge** is a premium website-based competition. Exactly 20 teams each manage a copy of the fictional town **Ashfen** after a major environmental disaster. They restore ecological health without collapsing public welfare or the local economy.

It is a live science-olympiad game, not a research model of a real place.

## Goals

1. Reward long-term planning: delayed restoration, sequencing, and preparation for known shocks.
2. Prevent a single fixed strategy from guaranteeing first place.
3. Keep the build small enough for a student developer: one Next.js app, one Supabase project, one pure TypeScript engine.
4. Survive 20 simultaneous teams, retries, disconnections, and organiser recovery.

## Non-goals

- Real-time combat, chat diplomacy, or trading between towns.
- Procedural or random events that differ by team.
- Scientific certification of policies.
- Judge-entered numeric scores.
- A 21st team, spectator betting, or post-event sandbox ranked on the same board.

## Audience

- 20 student teams (2–5 people, organiser-seeded).
- One organiser (plus a deputy).
- One or two judges (read-only).
- Optional hall screen showing only **published** pillars.

## Fairness contract

All teams begin with identical:

- Town layout and infrastructure
- Population 50,000 and public-service demand
- Budget, reserve (220 credits), and income rule
- Environmental damage and starting indicators
- Rules, catalogue, and pack A event schedule

Private decisions are submitted before a server deadline and resolved together.

## Success criteria for the live event

- 20/20 towns processed each round, same checksum on replay.
- No team can read another team’s live budget.
- Rankings reproduce from stored `town_states` + `engine_version`.
- First, second, and third are the top three `final_score` values after round 6, using the published tie-break.

## Presentation vs engineering

Presentation may be premium (editorial type, isometric map, control room). Engineering stays boring: deterministic engine, row-level security, idempotent posts, atomic publish.

## Related files

Rules: `game-rules.md`. Physics: `simulation-model.md`. Score: `scoring-system.md`. UI: `ui-requirements.md`.
