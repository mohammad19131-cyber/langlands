# Langlands R3 — agent contract

This repository is a **planning-first** environmental strategy competition for exactly 20 teams.

Grok 4.6 owns game mechanics, simulation, scoring, schema, security, and technical planning.
Claude Opus owns visual design and frontend implementation against the UI contract.

Do not build the website, install dependencies, or generate application code until `docs/development-roadmap.md` Phase 0 is explicitly started.

## Source of truth

| Concern | Canonical file | Who may change it |
| --- | --- | --- |
| Product intent | `docs/product-specification.md` | Grok, after review |
| Player rules | `docs/game-rules.md` | Grok, after review |
| Town physics | `docs/simulation-model.md`, `docs/simulation/score_lab.py` | Grok |
| Official score | `docs/scoring-system.md`, `docs/simulation/official_score.py` | Grok |
| Interventions | `docs/interventions-catalogue.md` | Grok |
| Events | `docs/environmental-events.md` | Grok |
| Schema / RLS | `docs/database-schema.md`, `docs/schema.sql` | Grok |
| Permissions | `docs/security-and-permissions.md` | Grok |
| Architecture | `docs/technical-architecture.md` | Grok |
| UI contract | `docs/ui-requirements.md` | Grok defines; Opus implements |
| Tests / balance | `docs/testing-and-game-balance.md` | Grok |
| Live event | `docs/deployment-and-event-runbook.md` | Grok |
| Build order | `docs/development-roadmap.md` | Grok |

If two documents disagree, stop and fix the documents before writing code. Do not “pick one” silently.

## Hard rules

1. This is a **pedagogical game**, not a validated Earth-system model. Label coefficients as assumptions.
2. All 20 towns start identical. Events are predetermined and identical. Never add hidden per-team randomness.
3. The server is authoritative. Browsers must not submit scores, remaining budgets, clocks, or simulation outcomes as truth.
4. No mock data presented as live functionality.
5. Teams must not read each other’s private submissions or unpublished states.
6. Nobody may override a numeric score, including organisers. Disqualification is a flag, not a rewritten formula.
7. Engine code must stay pure and testable without React, Tailwind, or a browser.
8. Preserve existing files unless a change is intentional, documented, and reviewed.

## Opus must not change

Claude Opus must not independently alter:

- scoring weights, formulas, floors, or tie-breaks
- town update order or coefficients
- intervention costs, effects, or prerequisites
- event schedule or damage formulas
- database tables, constraints, or RLS
- round lock / process / publish behaviour
- authentication or role checks

If a UI need requires a mechanics change, Opus documents a proposal in the PR description and waits for Grok review. Until then, implement against the current contract.

## Grok must not

- Invent scientific claims (“this restores a real aquifer by 12%”).
- Put official scoring in client components.
- Expand the catalogue or round count without updating every spec file and re-running `official_score.py`.
- Start the Next.js app during a planning-only request.

## Implementation notes (when coding starts)

- Port `score_lab.py` physics and `official_score.py` scoring to `packages/sim` with golden tests (±0.01 score).
- Client may import the engine only behind an **Unofficial preview** banner.
- Official writes use the service role after an advisory lock; publish only if 20/20 checksums match.
- Maximum two new interventions per round, eight sector allocations, remainder is reserve.

## Current freeze

- Teams: 20. Rounds: 6. Decision window: 18 minutes.
- Score: ecology 40, welfare 25, economy 15, resilience 10, efficiency 10.
- Scenario pack A: heatwave, drought, flood, contamination.
- Town: Ashfen. Currency: credits.
- Engine lab: `python3 docs/simulation/official_score.py`
