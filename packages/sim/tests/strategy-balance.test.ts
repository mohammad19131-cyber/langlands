import { describe, expect, it } from "vitest";
import {
  EQUAL,
  GREEN,
  GROW_EARLY,
  GROW_LATE,
  PACK_A,
  RESTORE_EARLY,
  RESTORE_LATE,
  createInitialTown,
  play,
  playInteractive,
  splitAll,
  stepRound,
} from "../src/index.js";
import type { Submission } from "../src/types.js";

function spend(weights: Record<string, number>, starts: string[] = []): (n: number, _t: unknown, a: number) => Submission {
  return (_n, _t, a) => ({
    allocations: splitAll(a, weights),
    projectStarts: starts,
  });
}

describe("credit identity and Pack A sequence", () => {
  it("reproduces Round 1 available 1154.06 before any spend", () => {
    const town = createInitialTown();
    const r1 = stepRound(town, { allocations: {}, projectStarts: [] }, 1);
    expect(r1.available).toBeCloseTo(1154.06, 2);
    expect(r1.income).toBeCloseTo(934.06, 2);
    expect(r1.eventCode).toBeNull();
    expect(r1.projectCost).toBe(0);
  });

  it("reproduces silent hold 3815 remaining credits and score 6.42", () => {
    const silent = play();
    expect(silent.score).toBe(6.42);
    expect(silent.reserve).toBeCloseTo(3815.05, 2);
    expect(silent.rounds.every((round) => round.projectCost === 0 && round.acceptedStarts.length === 0)).toBe(true);
  });

  it("reproduces equal-split operating score 55.92", () => {
    const equal = playInteractive((_n, _t, a) => ({
      allocations: splitAll(a, EQUAL),
      projectStarts: [],
    }));
    expect(equal.score).toBe(55.92);
    expect(equal.reserve).toBeCloseTo(0, 2);
  });

  it("applies Pack A shocks once, in order, with no R1 or R6 shock", () => {
    expect(PACK_A).toEqual({
      1: null,
      2: "HEATWAVE",
      3: "DROUGHT",
      4: "FLOOD",
      5: "CONTAMINATION",
      6: null,
    });
    const silent = play();
    expect(silent.rounds.map((round) => round.eventCode)).toEqual([
      null,
      "HEATWAVE",
      "DROUGHT",
      "FLOOD",
      "CONTAMINATION",
      null,
    ]);
    expect(silent.shock_log[0]).toBe(0);
    expect(silent.shock_log[5]).toBe(0);
    expect(silent.shock_log.slice(1, 5).every((d) => d > 0)).toBe(true);
  });
});

describe("six strategy comparison (evidence only, no rebalance)", () => {
  const strategies = {
    balanced: playInteractive(spend(EQUAL)),
    ecology: playInteractive((n, _t, a) => ({
      allocations: splitAll(a, n <= 3 ? RESTORE_EARLY : RESTORE_LATE),
      projectStarts: n === 1 ? ["WETLAND", "REFOREST"] : n === 2 ? ["RIVER"] : [],
    })),
    economy: playInteractive((n, _t, a) => ({
      allocations: splitAll(a, n <= 3 ? GROW_EARLY : GROW_LATE),
      projectStarts: n === 1 ? ["GRID", "INTENSE_AG"] : n === 2 ? ["COAL", "FACTORIES"] : [],
    })),
    saveThenInvest: playInteractive((n, _t, a) => {
      if (n <= 3) return { allocations: {}, projectStarts: [] };
      return {
        allocations: splitAll(a, RESTORE_LATE),
        projectStarts: n === 4 ? ["WETLAND", "WATER_TREAT"] : n === 5 ? ["CLINICS"] : [],
      };
    }),
    earlyLongTerm: playInteractive((n, _t, a) => ({
      allocations: splitAll(a, n <= 3 ? RESTORE_EARLY : GREEN),
      projectStarts:
        n === 1 ? ["WETLAND", "REFOREST"] : n === 2 ? ["GRID", "FLOOD_WALL"] : n === 3 ? ["EMISSIONS"] : [],
    })),
    crisisPrep: playInteractive((n, _t, a) => ({
      allocations: splitAll(a, GREEN),
      projectStarts:
        n === 1
          ? ["GRID", "CLINICS"]
          : n === 2
            ? ["WATER_TREAT", "FLOOD_WALL"]
            : n === 3
              ? ["WASTEWATER"]
              : n === 4
                ? ["WETLAND"]
                : [],
    })),
  };

  it("does not let unused credits or a single pillar sweep the board", () => {
    const rows = Object.entries(strategies).map(([name, result]) => ({
      name,
      score: result.score,
      reserve: Number(result.reserve.toFixed(2)),
      ecology: Number(result.categories.ecology.toFixed(2)),
      welfare: Number(result.categories.welfare.toFixed(2)),
      economy: Number(result.categories.economy.toFixed(2)),
      resilience: Number(result.categories.resilience.toFixed(2)),
      efficiency: Number(result.categories.efficiency.toFixed(2)),
      starts: Object.keys(result.started).sort(),
      shock: result.shock_log.map((d) => Number(d.toFixed(2))),
    }));

    const silent = play();
    expect(silent.score).toBeLessThan(Math.min(...rows.map((row) => row.score)));
    expect(rows.every((row) => row.ecology < 90 && row.welfare < 90 && row.economy < 90)).toBe(true);

    const ecology = rows.find((row) => row.name === "ecology")!;
    const economy = rows.find((row) => row.name === "economy")!;
    expect(ecology.ecology).toBeGreaterThan(economy.ecology);
    expect(economy.economy).toBeGreaterThan(ecology.economy);

    console.log(JSON.stringify(rows, null, 2));
  });
});
