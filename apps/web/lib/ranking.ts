import {
  parseBreakdown,
  rankingScore,
  type ScoreBreakdown,
} from "./score-display";

export const TEAM_SEATS = Array.from({ length: 20 }, (_, index) => index + 1);

/** TownPublic-shaped payload. Never include allocations, starts, or credentials. */
export const PUBLIC_BOARD_KEYS = [
  "seat",
  "name",
  "disqualified",
  "published",
  "rank",
  "rankDelta",
  "snapshot",
  "final",
  "rankingScore",
  "breakdown",
  "meanDamage",
  "isYou",
] as const;

export type PublishedResultInput = {
  seat: number;
  name: string;
  snapshot: number | null;
  final: number | null;
  breakdown: ScoreBreakdown | null | unknown;
};

export type TeamSeatInput = {
  seat: number;
  name: string;
  disqualified: boolean;
};

export type BoardSeat = {
  seat: number;
  name: string;
  disqualified: boolean;
  published: boolean;
  rank: number | null;
  rankDelta: number | null;
  snapshot: number | null;
  final: number | null;
  rankingScore: number | null;
  breakdown: ScoreBreakdown | null;
  meanDamage: number | null;
  isYou: boolean;
};

export type Rankable = {
  seat: number;
  rankingScore: number;
  ecology: number;
  /** Mean of shock_log entries > 0. Null when the persisted value is unavailable. */
  meanDamage?: number | null;
};

/**
 * Official public order (docs/scoring-system.md §Tie-break, docs/game-rules.md):
 * 1. higher official score
 * 2. higher ecology index E
 * 3. lower mean event damage (rounds 2–5 / shock_log entries > 0)
 * 4. lower seat number
 *
 * Missing mean-damage on either side skips that step and uses seat.
 * Do not invent a default of 0 for unavailable data.
 */
export function compareOfficial(a: Rankable, b: Rankable): number {
  if (a.rankingScore !== b.rankingScore) return b.rankingScore - a.rankingScore;
  if (a.ecology !== b.ecology) return b.ecology - a.ecology;
  const aDamage = a.meanDamage;
  const bDamage = b.meanDamage;
  if (aDamage != null && bDamage != null && aDamage !== bDamage) {
    return aDamage - bDamage;
  }
  return a.seat - b.seat;
}

/** Extra score_breakdown key written at process time. Not a scoring pillar. */
export function meanDamageFromBreakdown(raw: unknown): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const value = source.meanDamage ?? source.mean_event_damage ?? source.mean_damage;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function boardForRound(args: {
  roundStatus: string | null | undefined;
  teams: TeamSeatInput[];
  results: PublishedResultInput[];
  viewerSeat?: number | null;
  previous?: BoardSeat[] | null;
}): { ok: true; seats: BoardSeat[] } | { ok: false; error: "unpublished" } {
  if (args.roundStatus !== "published") {
    return { ok: false, error: "unpublished" };
  }

  const bySeat = new Map<number, PublishedResultInput>();
  for (const row of args.results) {
    if (row.seat >= 1 && row.seat <= 20) bySeat.set(row.seat, row);
  }

  const teams = new Map<number, TeamSeatInput>();
  for (const team of args.teams) {
    if (team.seat >= 1 && team.seat <= 20) teams.set(team.seat, team);
  }

  const previousRank = new Map<number, number>();
  for (const row of args.previous ?? []) {
    if (row.rank != null) previousRank.set(row.seat, row.rank);
  }

  const draft: BoardSeat[] = TEAM_SEATS.map((seat) => {
    const team = teams.get(seat);
    const published = bySeat.get(seat);
    const breakdown = published ? parseBreakdown(published.breakdown) : null;
    const snapshot = published && Number.isFinite(Number(published.snapshot)) ? Number(published.snapshot) : null;
    const final =
      published && published.final != null && Number.isFinite(Number(published.final))
        ? Number(published.final)
        : null;
    const disqualified = Boolean(team?.disqualified);
    return {
      seat,
      name: published?.name || team?.name || `Seat ${String(seat).padStart(2, "0")}`,
      disqualified,
      published: Boolean(published),
      rank: null,
      rankDelta: null,
      snapshot,
      final,
      rankingScore: published ? rankingScore({ snapshot, final }) : null,
      breakdown,
      meanDamage: published ? meanDamageFromBreakdown(published.breakdown) : null,
      isYou: args.viewerSeat === seat,
    };
  });

  const ranked = draft
    .filter((row) => row.published && !row.disqualified && row.rankingScore != null && row.breakdown)
    .sort((a, b) =>
      compareOfficial(
        {
          seat: a.seat,
          rankingScore: a.rankingScore as number,
          ecology: a.breakdown?.ecology ?? 0,
          meanDamage: a.meanDamage,
        },
        {
          seat: b.seat,
          rankingScore: b.rankingScore as number,
          ecology: b.breakdown?.ecology ?? 0,
          meanDamage: b.meanDamage,
        },
      ),
    );

  ranked.forEach((row, index) => {
    row.rank = index + 1;
    const prior = previousRank.get(row.seat);
    row.rankDelta = prior == null ? null : prior - row.rank;
  });

  return { ok: true, seats: draft };
}

export function selectPublishedRound(
  published: number[],
  requested?: number | null,
): number | null {
  if (requested != null && published.includes(requested)) return requested;
  return published.at(-1) ?? null;
}

export const UNPUBLISHED_STANDINGS_COPY =
  "No round has been published yet. Official standings appear here once results are published for all 20 towns. Missing is not a score of zero.";

export function hasPublishedStandings(publishedRounds: readonly number[]): boolean {
  return publishedRounds.length > 0;
}

export type PlayStandingResult = PublishedResultInput & { roundIndex: number };

/**
 * Official standings for a seated player or unseated staff viewer.
 * Only `published` round summaries are included. Viewer seat is optional;
 * staff have none and must not be marked as a team.
 */
export function playStandingsFrom(args: {
  roundSummaries: Array<{ index: number; status: string }>;
  teams: TeamSeatInput[];
  results: PlayStandingResult[];
  viewerSeat?: number | null;
}): {
  publishedRounds: number[];
  boardByRound: Record<number, BoardSeat[]>;
  publishedRoundIndex: number | null;
  leaderboard: BoardSeat[] | null;
} {
  const publishedRounds = args.roundSummaries
    .filter((row) => row.status === "published")
    .map((row) => row.index)
    .filter((index, i, all) => all.indexOf(index) === i)
    .sort((a, b) => a - b);

  const byRound = new Map<number, PublishedResultInput[]>();
  for (const row of args.results) {
    if (!publishedRounds.includes(row.roundIndex)) continue;
    const list = byRound.get(row.roundIndex) ?? [];
    list.push({
      seat: row.seat,
      name: row.name,
      snapshot: row.snapshot,
      final: row.final,
      breakdown: row.breakdown,
    });
    byRound.set(row.roundIndex, list);
  }

  const boardByRound: Record<number, BoardSeat[]> = {};
  let previous: BoardSeat[] | null = null;
  for (const index of publishedRounds) {
    const built = boardForRound({
      roundStatus: "published",
      teams: args.teams,
      results: byRound.get(index) ?? [],
      viewerSeat: args.viewerSeat,
      previous,
    });
    if (built.ok) {
      boardByRound[index] = built.seats;
      previous = built.seats;
    }
  }

  const publishedRoundIndex = publishedRounds.at(-1) ?? null;
  return {
    publishedRounds,
    boardByRound,
    publishedRoundIndex,
    leaderboard: publishedRoundIndex != null ? (boardByRound[publishedRoundIndex] ?? null) : null,
  };
}

export function publicBoardPayload(seats: BoardSeat[]): Array<Record<string, unknown>> {
  return seats.map((seat) => {
    const out: Record<string, unknown> = {};
    for (const key of PUBLIC_BOARD_KEYS) out[key] = seat[key];
    return out;
  });
}

export function assertNoPrivateBoardFields(payload: unknown): string[] {
  const forbidden =
    /allocations|projectStarts|project_starts|password|password_hash|login_id|teamId|team_id|idempotency|available|unspent|ownedProjects|building|state\b|shock_log/i;
  const blob = JSON.stringify(payload);
  return blob.match(forbidden) ?? [];
}
