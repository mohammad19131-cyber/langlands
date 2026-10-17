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
  isYou: boolean;
};

export type Rankable = {
  seat: number;
  rankingScore: number;
  ecology: number;
};

/**
 * Official public order (docs/scoring-system.md, game-rules.md):
 * 1. higher official score
 * 2. higher ecology category
 * 3. lower mean event damage — not present on TownPublic, so it cannot be applied here
 * 4. lower seat number
 */
export function compareOfficial(a: Rankable, b: Rankable): number {
  if (a.rankingScore !== b.rankingScore) return b.rankingScore - a.rankingScore;
  if (a.ecology !== b.ecology) return b.ecology - a.ecology;
  return a.seat - b.seat;
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
      isYou: args.viewerSeat === seat,
    };
  });

  const ranked = draft
    .filter((row) => row.published && !row.disqualified && row.rankingScore != null && row.breakdown)
    .sort((a, b) =>
      compareOfficial(
        { seat: a.seat, rankingScore: a.rankingScore as number, ecology: a.breakdown?.ecology ?? 0 },
        { seat: b.seat, rankingScore: b.rankingScore as number, ecology: b.breakdown?.ecology ?? 0 },
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
