import { describe, expect, it } from "vitest";
import { ownTownRead } from "./own-town-source";

const rounds = [
  { id: "r1", round_index: 1, status: "published" },
  { id: "r2", round_index: 2, status: "published" },
  { id: "r3", round_index: 3, status: "scheduled" },
];

describe("ownTownRead", () => {
  it("uses the template before round 1 has a previous published state", () => {
    expect(
      ownTownRead({
        activeRound: { id: "r1", round_index: 1, status: "open" },
        rounds: [{ id: "r1", round_index: 1, status: "open" }],
      }),
    ).toEqual({ kind: "template" });
  });

  it("reads the previous published town while a later round is scheduled", () => {
    expect(ownTownRead({ activeRound: rounds[2] ?? null, rounds })).toEqual({
      kind: "state",
      roundId: "r2",
    });
  });

  it("reads the published round itself when the game is complete", () => {
    expect(
      ownTownRead({
        activeRound: { id: "r2", round_index: 2, status: "published" },
        rounds: rounds.slice(0, 2),
      }),
    ).toEqual({ kind: "state", roundId: "r2" });
  });

  it("returns none when the previous round is unpublished", () => {
    expect(
      ownTownRead({
        activeRound: { id: "r2", round_index: 2, status: "open" },
        rounds: [
          { id: "r1", round_index: 1, status: "locked" },
          { id: "r2", round_index: 2, status: "open" },
        ],
      }),
    ).toEqual({ kind: "none" });
  });
});
