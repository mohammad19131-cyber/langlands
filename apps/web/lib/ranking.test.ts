import { describe, expect, it } from "vitest";
import {
  assertNoPrivateBoardFields,
  boardForRound,
  compareOfficial,
  publicBoardPayload,
  selectPublishedRound,
  TEAM_SEATS,
} from "./ranking";
import { formatDelta, formatScore, parseBreakdown, PILLAR_WEIGHT_PCT, rankingScore } from "./score-display";

function breakdown(ecology: number, snapshot = 50) {
  return {
    ecology,
    welfare: 40,
    economy: 40,
    resilience: 40,
    efficiency: 40,
    penalty: 0,
    snapshot,
  };
}

function teams() {
  return TEAM_SEATS.map((seat) => ({
    seat,
    name: `Seat ${String(seat).padStart(2, "0")}`,
    disqualified: false,
  }));
}

describe("official score display", () => {
  it("uses the frozen pillar weights", () => {
    expect(PILLAR_WEIGHT_PCT).toEqual({
      ecology: 40,
      welfare: 25,
      economy: 15,
      resilience: 10,
      efficiency: 10,
    });
  });

  it("renders unavailable scores as an em dash, including when the value is 0 vs missing", () => {
    expect(formatScore(0)).toBe("0.00");
    expect(formatScore(null)).toBe("—");
    expect(formatScore(undefined)).toBe("—");
    expect(formatScore(Number.NaN)).toBe("—");
    expect(formatScore(58.41)).toBe("58.41");
  });

  it("rejects incomplete score_breakdown objects instead of filling zeros", () => {
    expect(parseBreakdown({ ecology: 12 })).toBeNull();
    expect(parseBreakdown(null)).toBeNull();
    expect(parseBreakdown(breakdown(33.2, 41.5))?.ecology).toBe(33.2);
  });

  it("prefers the stored path score over the round snapshot", () => {
    expect(rankingScore({ snapshot: 40, final: 51.25 })).toBe(51.25);
    expect(rankingScore({ snapshot: 40, final: null })).toBe(40);
    expect(rankingScore({ snapshot: null, final: null })).toBeNull();
  });
});

describe("publication gating and ranking", () => {
  it("refuses to build a board for an unpublished round", () => {
    const unpublished = boardForRound({
      roundStatus: "processing",
      teams: teams(),
      results: [{ seat: 1, name: "A", snapshot: 50, final: 50, breakdown: breakdown(40) }],
    });
    expect(unpublished).toEqual({ ok: false, error: "unpublished" });
    expect(boardForRound({ roundStatus: "open", teams: teams(), results: [] }).ok).toBe(false);
    expect(boardForRound({ roundStatus: null, teams: teams(), results: [] }).ok).toBe(false);
    expect(selectPublishedRound([], 1)).toBeNull();
    expect(selectPublishedRound([1, 2], 3)).toBe(2);
    expect(selectPublishedRound([1, 2], 1)).toBe(1);
  });

  it("keeps a published round with no stored rows empty rather than filling zeros", () => {
    const built = boardForRound({
      roundStatus: "published",
      teams: teams(),
      results: [],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.seats).toHaveLength(20);
    expect(built.seats.every((row) => row.rank == null && row.rankingScore == null && !row.published)).toBe(
      true,
    );
  });

  it("ranks 20 seats, leaves missing results unranked, and does not invent zeros", () => {
    const built = boardForRound({
      roundStatus: "published",
      teams: teams(),
      results: [
        { seat: 4, name: "Team 004", snapshot: 50, final: 50.1, breakdown: breakdown(40, 50) },
        { seat: 7, name: "Team 007", snapshot: 48, final: 48.2, breakdown: breakdown(42, 48) },
      ],
      viewerSeat: 4,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.seats).toHaveLength(20);
    const you = built.seats.find((row) => row.seat === 4);
    const missing = built.seats.find((row) => row.seat === 1);
    expect(you?.rank).toBe(1);
    expect(you?.isYou).toBe(true);
    expect(you?.published).toBe(true);
    expect(missing?.published).toBe(false);
    expect(missing?.rank).toBeNull();
    expect(missing?.rankingScore).toBeNull();
    expect(missing?.breakdown).toBeNull();
    expect(formatScore(missing?.rankingScore)).toBe("—");
  });

  it("tie-breaks higher ecology then lower seat, never a fabricated rule", () => {
    expect(
      compareOfficial(
        { seat: 2, rankingScore: 50, ecology: 40 },
        { seat: 1, rankingScore: 50, ecology: 41 },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareOfficial(
        { seat: 1, rankingScore: 50, ecology: 40 },
        { seat: 8, rankingScore: 50, ecology: 40 },
      ),
    ).toBeLessThan(0);

    const built = boardForRound({
      roundStatus: "published",
      teams: teams(),
      results: [
        { seat: 8, name: "B", snapshot: 50, final: 50, breakdown: breakdown(40) },
        { seat: 3, name: "A", snapshot: 50, final: 50, breakdown: breakdown(40) },
      ],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.seats.find((row) => row.seat === 3)?.rank).toBe(1);
    expect(built.seats.find((row) => row.seat === 8)?.rank).toBe(2);
  });

  it("removes disqualified teams from ranking but still lists the seat", () => {
    const roster = teams().map((team) => (team.seat === 2 ? { ...team, disqualified: true } : team));
    const built = boardForRound({
      roundStatus: "published",
      teams: roster,
      results: [
        { seat: 1, name: "A", snapshot: 40, final: 40, breakdown: breakdown(30) },
        { seat: 2, name: "B", snapshot: 90, final: 90, breakdown: breakdown(90) },
      ],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.seats.find((row) => row.seat === 2)?.rank).toBeNull();
    expect(built.seats.find((row) => row.seat === 2)?.disqualified).toBe(true);
    expect(built.seats.find((row) => row.seat === 1)?.rank).toBe(1);
  });

  it("shows rank changes only when a previous published ranking exists", () => {
    const first = boardForRound({
      roundStatus: "published",
      teams: teams(),
      results: [
        { seat: 1, name: "A", snapshot: 40, final: 40, breakdown: breakdown(30) },
        { seat: 2, name: "B", snapshot: 60, final: 60, breakdown: breakdown(40) },
      ],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.seats.find((row) => row.seat === 1)?.rankDelta).toBeNull();

    const second = boardForRound({
      roundStatus: "published",
      teams: teams(),
      results: [
        { seat: 1, name: "A", snapshot: 70, final: 70, breakdown: breakdown(50) },
        { seat: 2, name: "B", snapshot: 60, final: 60, breakdown: breakdown(40) },
      ],
      previous: first.seats,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.seats.find((row) => row.seat === 1)?.rank).toBe(1);
    expect(second.seats.find((row) => row.seat === 1)?.rankDelta).toBe(1);
    expect(second.seats.find((row) => row.seat === 2)?.rankDelta).toBe(-1);
  });
});

describe("board privacy", () => {
  it("strips private gameplay fields from the public payload", () => {
    const built = boardForRound({
      roundStatus: "published",
      teams: teams(),
      results: [{ seat: 1, name: "A", snapshot: 50, final: 50, breakdown: breakdown(40) }],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const payload = publicBoardPayload(built.seats);
    expect(assertNoPrivateBoardFields(payload)).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(/allocations|projectStarts|password|team_id/);
  });
});

describe("round comparison copy", () => {
  it("does not treat a missing previous round as a zero change", () => {
    expect(formatDelta(50, null)).toBe("—");
    expect(formatDelta(50, 48)).toBe("+2.00");
    expect(formatDelta(40, 41.5)).toBe("-1.50");
  });
});
