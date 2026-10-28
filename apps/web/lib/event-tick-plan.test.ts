import { describe, expect, it } from "vitest";
import { planEventTick, publicTickResult, type TickRound } from "./event-tick-plan";

function r(partial: Partial<TickRound> & Pick<TickRound, "round_index" | "status">): TickRound {
  return {
    id: `r${partial.round_index}`,
    closes_at: "2026-10-28T12:18:00.000Z",
    process_checksum: null,
    ...partial,
  };
}

describe("planEventTick", () => {
  it("does not auto-advance unless the competition is live", () => {
    const rounds = [r({ round_index: 1, status: "scheduled" })];
    expect(planEventTick({ competitionStatus: "ready", nowMs: 1, rounds }).step).toBe("idle");
    expect(planEventTick({ competitionStatus: "paused", nowMs: 1, rounds }).step).toBe("idle");
  });

  it("still processes and publishes in-flight rounds while paused", () => {
    expect(
      planEventTick({
        competitionStatus: "paused",
        nowMs: 1,
        rounds: [r({ round_index: 1, status: "locked" })],
      }).step,
    ).toBe("process");
    expect(
      planEventTick({
        competitionStatus: "paused",
        nowMs: 1,
        rounds: [r({ round_index: 1, status: "processing", process_checksum: "abc" })],
      }).step,
    ).toBe("publish");
    expect(
      planEventTick({
        competitionStatus: "paused",
        nowMs: Date.parse("2026-10-28T12:19:00.000Z"),
        rounds: [r({ round_index: 1, status: "open" })],
      }).step,
    ).toBe("idle");
  });

  it("locks only after the official close, then processes, publishes, and opens the next", () => {
    const close = Date.parse("2026-10-28T12:18:00.000Z");
    const open = [r({ round_index: 1, status: "open", closes_at: "2026-10-28T12:18:00.000Z" })];
    expect(planEventTick({ competitionStatus: "live", nowMs: close - 1, rounds: open }).step).toBe("idle");
    expect(planEventTick({ competitionStatus: "live", nowMs: close, rounds: open })).toMatchObject({
      step: "lock",
      roundId: "r1",
    });
    expect(
      planEventTick({
        competitionStatus: "live",
        nowMs: close + 1,
        rounds: [r({ round_index: 1, status: "locked" })],
      }).step,
    ).toBe("process");
    expect(
      planEventTick({
        competitionStatus: "live",
        nowMs: close + 1,
        rounds: [r({ round_index: 1, status: "processing", process_checksum: "abc" })],
      }).step,
    ).toBe("publish");
    expect(
      planEventTick({
        competitionStatus: "live",
        nowMs: close + 1,
        rounds: [
          r({ round_index: 1, status: "published" }),
          r({ round_index: 2, status: "scheduled" }),
        ],
      }),
    ).toMatchObject({ step: "open", roundId: "r2" });
  });

  it("does not open a successor while the predecessor is unpublished", () => {
    const plan = planEventTick({
      competitionStatus: "live",
      nowMs: Date.now(),
      rounds: [r({ round_index: 1, status: "void" }), r({ round_index: 2, status: "scheduled" })],
    });
    expect(plan.step).toBe("blocked");
  });

  it("completes after round 6 is published", () => {
    const rounds = [1, 2, 3, 4, 5, 6].map((round_index) => r({ round_index, status: "published" }));
    expect(planEventTick({ competitionStatus: "live", nowMs: 1, rounds }).step).toBe("complete");
  });

  it("strips lock payloads and town states from scheduler responses", () => {
    expect(
      publicTickResult({
        noop: false,
        status: "processing",
        checksum: "abc",
        output: { townStates: [{ allocations: { water: 9 } }] },
        lock_manifest: [{ allocations: { water: 9 } }],
      }),
    ).toEqual({ noop: false, status: "processing", checksum: "abc" });
  });
});
