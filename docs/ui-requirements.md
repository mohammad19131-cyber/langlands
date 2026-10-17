# UI requirements (Claude Opus contract)

Status: canonical frontend contract. Opus implements this file. Opus does not change mechanics.

If a screen needs a field that is not listed, open a review with Grok. Do not invent a parallel JSON shape.

## Product tone

Editorial, cartographic, quiet. Deep ink, paper, one bronze/green accent. No gamified streaks, no fake live tickers, no invented scores. Empty states must be true (“Round 2 processing 20 towns”).

## Routes

| Route | Role | Purpose |
| --- | --- | --- |
| `/` | public | Briefing only |
| `/sign-in` | all | Supabase auth |
| `/play` | team | Map + five category bars + countdown |
| `/play/decide` | team | Sectors, interventions, save |
| `/play/history` | team | Own published rounds |
| `/board` | team after publish, judge, organiser | 20-team pillars |
| `/rules` | signed-in | Frozen rulebook |
| `/room` | organiser | Control room |
| `/room/team/[seat]` | organiser | Support view (audited) |
| `/judge` | judge | Read-only outcomes |

## Server data the UI may read

Use these TypeScript types. Field names are frozen.

```ts
export type Sector =
  | "restoration"
  | "pollution_control"
  | "water"
  | "energy"
  | "agriculture"
  | "industry"
  | "infrastructure"
  | "public_services";

export type RoundStatus =
  | "scheduled"
  | "open"
  | "locked"
  | "processing"
  | "published"
  | "void";

export type ScoreBreakdown = {
  ecology: number;
  welfare: number;
  economy: number;
  resilience: number;
  efficiency: number;
  penalty: number;
  snapshot: number;
};

export type TownPublic = {
  teamSeat: number;
  teamName: string;
  roundIndex: number;
  air: number;
  water_q: number;
  soil: number;
  bio: number;
  pollution: number;
  health: number;
  services: number;
  jobs: number;
  economy: number;
  fiscal: number;
  energy: number;
  infra: number;
  prep: number;
  buffer: number;
  reserve: number;
  population: number;
  badges: {
    energyMix: "thermal-heavy" | "mixed" | "clean-leaning";
    agriculture: "intensive" | "mixed" | "regenerative";
    industry: "light" | "heavy";
  };
  breakdown: ScoreBreakdown;
  finalScore: number | null; // running official score after this published round
};

export type TownPrivate = TownPublic & {
  ownedProjects: string[];
  building: { code: string; completesRound: number }[];
  lastApplied: {
    allocations: Record<Sector, number>;
    projectStarts: string[];
    available: number;
    spent: number;
    unspent: number;
  };
};

export type RoundClock = {
  roundIndex: number;
  status: RoundStatus;
  opensAt: string; // ISO, display only
  closesAt: string;
  serverNow: string;
  eventCode: "HEATWAVE" | "DROUGHT" | "FLOOD" | "CONTAMINATION" | null;
};

export type CatalogueProject = {
  code: string;
  name: string;
  sector: Sector;
  cost: number;
  buildRounds: 0 | 1 | 2;
  maintenancePerRound: number;
  prerequisites: string[];
  mutexGroup: string | null;
  summary: string; // from catalogue, not invented
};

export type SubmissionInput = {
  allocations: Record<Sector, number>;
  projectStarts: string[]; // max 2
  idempotencyKey: string;
};

export type SubmissionResult =
  | { ok: true; status: "accepted" | "duplicate"; applied: TownPrivate["lastApplied"] }
  | { ok: false; error: "closed" | "invalid" | "unauthorized" | "conflict"; message: string };
```

`available` in `lastApplied` is **server** money. Never display a client-sum as cash on hand.

## Actions the UI may call

| Action | Who | Result |
| --- | --- | --- |
| `saveSubmission(input)` | team | `SubmissionResult` |
| `loadPlay()` | team | `{ clock, town: TownPrivate, catalogue, unofficialPreview }` |
| `loadBoard()` | signed-in | 20 × `TownPublic` only if round published; else 409 |
| `organiserLock/Process/Publish` | organiser | round status |

No `setScore`, no `setReserve`, no `setNow`.

## Unofficial preview

`unofficialPreview: ScoreBreakdown | null` may be computed client-side with `packages/sim` **or** returned from a preview endpoint that does not persist.

Always render a banner:

> Unofficial preview. Official results publish when all 20 towns are processed.

Never copy preview numbers into a ranking table.

## Loading, empty, error

| State | UI |
| --- | --- |
| Session missing | redirect `/sign-in` |
| Round `scheduled` | “Round N opens at …” — controls disabled |
| Round `open` | countdown from `serverNow` vs `closesAt`, refreshed on poll |
| Save in flight | button pending, keep last good form |
| Save `closed` | freeze form, “Deadline passed. Waiting for results.” |
| Round `locked` / `processing` | full-screen wait, no new edits |
| Round `published` | replace preview with official `TownPrivate` |
| Round `void` | organiser message, not a fake board |
| Network retry | same idempotency key |
| RLS / 403 | generic “not available”, never leak rival payload |

Poll `clock.status` every 5 seconds while not `published`. Do not use optimistic town mutation except in the labelled preview.

## Decision screen

- Eight integer sector controls.
- Running total vs server `available`.
- Catalogue cards grouped by sector, showing cost, build time, prereq met/unmet from **server** `ownedProjects`, mutex lock.
- Disable a third start.
- Autosave with a new idempotency key per distinct payload; retries reuse the key.

## Map (SVG isometric, not WebGL)

Districts (fixed layout, same for all teams): river, wetlands, grid, industry, farms, civic, hills, harbour.

Tile density/haze/water fill is a pure function of `TownPublic` fields:

| Visual | Driver |
| --- | --- |
| Haze | `pollution`, `air` |
| River clarity | `water_q` |
| Wetland fill | `buffer`, `bio` |
| Factory stacks | `economy`, industrial badge |
| Fields | agri badge, `soil` |
| Flood walls | owned `FLOOD_WALL` (from `ownedProjects` on private view; public view may show a “defences” tile if `infra` and `prep` high — **do not** infer rival projects). Public map uses only public fields. |
| Clinics | `health`, `services` |

The map never spends money and never runs `stepRound`.

## Organiser control room

20-seat grid: `missing | saved | accepted | late | dq`.

Buttons: lock, process, publish — each confirm + audit. Show `engine_version` and `catalogue_hash`. Cannot reopen a published round.

## Accessibility

Keyboard on all controls. Category bars have numeric text. Contrast AA. Map has a table alternative (`TownPublic` numbers).

## Forbidden frontend work

- Recolouring the board from localStorage “scores”
- Hiding the unofficial banner
- Adding chat, trading, or extra mini-games
- Fetching `submissions` for other seats
- Installing a 3D engine
