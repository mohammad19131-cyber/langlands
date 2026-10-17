import { describe, expect, it } from "vitest";
import {
  CATALOGUE,
  EQUAL,
  PACK_A,
  SECTORS,
  WEIGHTS,
  clamp,
  createInitialTown,
  finalScore,
  play,
  playInteractive,
  sat,
  stepRound,
  tieBreakTuple,
} from "../src/index.js";
import {
  DYS_ECOLOGY,
  DYS_ECONOMY,
  DYS_PREP_INFRA,
  DYS_WELFARE,
  MAX_STARTS,
} from "../src/constants.js";
import { cloneTown, maintenanceDue, stepRoundPy } from "../src/engine.js";
import type { Submission, Town } from "../src/types.js";

function equalAlloc(available: number): Submission {
  const allocations = {} as Submission["allocations"];
  for (const k of SECTORS) allocations[k] = available * 0.125;
  return { allocations, projectStarts: [] };
}

function balancedChoose(_n: number, _t: Town, available: number): Submission {
  return equalAlloc(available);
}

describe("bounds", () => {
  it("keeps indices in 0–100 and population in band after six silent rounds", () => {
    const result = play([null, null, null, null, null, null]);
    const town = result.town;
    for (const key of [
      "air",
      "water_q",
      "soil",
      "bio",
      "pollution",
      "health",
      "services",
      "jobs",
      "economy",
      "fiscal",
      "energy",
      "infra",
      "prep",
      "buffer",
    ] as const) {
      expect(town[key]).toBeGreaterThanOrEqual(0);
      expect(town[key]).toBeLessThanOrEqual(100);
    }
    expect(town.population).toBeGreaterThanOrEqual(42_000);
    expect(town.population).toBeLessThanOrEqual(56_000);
  });

  it("sat() has diminishing returns", () => {
    expect(sat(800)).toBeLessThan(sat(400) + sat(400) - 1e-9);
  });
});

describe("budget", () => {
  it("conserves cash for a silent team", () => {
    const town = createInitialTown();
    const result = stepRound(town, null, 1);
    expect(result.projectCost + result.sectorSpend._spent + result.unspent).toBeCloseTo(
      result.available,
      9,
    );
    expect(result.acceptedStarts).toEqual([]);
    expect(result.unspent).toBeCloseTo(result.available, 9);
  });

  it("scales overspend", () => {
    const town = createInitialTown();
    const huge = {} as Submission["allocations"];
    for (const k of SECTORS) huge[k] = 10_000;
    const result = stepRound(town, { allocations: huge, projectStarts: [] }, 1);
    expect(result.sectorSpend._spent).toBeLessThanOrEqual(result.available + 1e-9);
    expect(result.sectorSpend._spent + result.unspent).toBeCloseTo(result.available, 9);
  });

  it("charges starts before sectors", () => {
    const town = createInitialTown();
    const result = stepRound(town, { allocations: { ...EQUAL }, projectStarts: ["GRID"] }, 1);
    expect(result.acceptedStarts).toContain("GRID");
    expect(result.projectCost).toBe(200);
    expect(result.projectCost + result.sectorSpend._spent + result.unspent).toBeCloseTo(
      result.available,
      9,
    );
  });
});

describe("project limits", () => {
  it("drops a third start", () => {
    const town = createInitialTown();
    const result = stepRound(
      town,
      { allocations: {}, projectStarts: ["RIVER", "CLINICS", "WATER_TREAT"] },
      1,
    );
    expect(result.acceptedStarts).toEqual(["RIVER", "CLINICS"]);
    expect(result.dropped.some((d) => d.code === "WATER_TREAT" && d.reason === "max_starts")).toBe(
      true,
    );
    expect(MAX_STARTS).toBe(2);
  });

  it("drops unknown codes", () => {
    const town = createInitialTown();
    const result = stepRound(town, { allocations: {}, projectStarts: ["NOT_A_PROJECT"] }, 1);
    expect(result.acceptedStarts).toEqual([]);
    expect(result.dropped[0].reason).toBe("unknown");
  });

  it("blocks COAL without GRID", () => {
    const town = createInitialTown();
    const result = stepRound(town, { allocations: {}, projectStarts: ["COAL"] }, 1);
    expect(result.acceptedStarts).toEqual([]);
    expect(result.dropped[0].reason.startsWith("prereq")).toBe(true);
  });

  it("rejects COAL in the same list as GRID", () => {
    const town = createInitialTown();
    const result = stepRound(town, { allocations: {}, projectStarts: ["GRID", "COAL"] }, 1);
    expect(result.acceptedStarts).toEqual(["GRID"]);
    expect(result.dropped.some((d) => d.code === "COAL")).toBe(true);
  });

  it("enforces ENERGY_BASELOAD mutex", () => {
    const result = playInteractive((roundNo, _town, available) => {
      if (roundNo === 1) return { allocations: {}, projectStarts: ["GRID", "CLINICS"] };
      if (roundNo === 2) return { allocations: {}, projectStarts: ["COAL", "RENEWABLES"] };
      return equalAlloc(available);
    });
    expect(result.started.COAL).toBeDefined();
    expect(result.started.RENEWABLES).toBeUndefined();
    expect(result.dropped.some((d) => d.code === "RENEWABLES")).toBe(true);
  });

  it("enforces AGRI_PUSH mutex", () => {
    const town = createInitialTown();
    const result = stepRound(
      town,
      { allocations: {}, projectStarts: ["INTENSE_AG", "REGEN_AG"] },
      1,
    );
    expect(result.acceptedStarts).toEqual(["INTENSE_AG"]);
    expect(result.dropped.some((d) => d.reason === "mutex")).toBe(true);
  });

  it("drops duplicate codes", () => {
    const town = createInitialTown();
    const result = stepRound(town, { allocations: {}, projectStarts: ["RIVER", "RIVER"] }, 1);
    expect(result.acceptedStarts).toEqual(["RIVER"]);
    expect(result.dropped.some((d) => d.reason === "duplicate")).toBe(true);
  });
});

describe("delays", () => {
  it("does not apply REFOREST air immediately", () => {
    const withP = stepRound(createInitialTown(), { allocations: {}, projectStarts: ["REFOREST"] }, 1);
    const without = stepRound(createInitialTown(), { allocations: {}, projectStarts: [] }, 1);
    expect(withP.snapshot.ecology).toBeCloseTo(without.snapshot.ecology, 4);

    const planted = playInteractive((n, _t, _a) => ({
      allocations: {},
      projectStarts: n === 1 ? ["REFOREST"] : [],
    }));
    const silent = playInteractive(() => ({ allocations: {}, projectStarts: [] }));
    expect(planted.town.bio).toBeGreaterThan(silent.town.bio);
    expect(planted.town.air).toBeGreaterThan(silent.town.air);
  });

  it("applies RIVER immediately before the event", () => {
    const a = stepRound(createInitialTown(), { allocations: {}, projectStarts: ["RIVER"] }, 1);
    const b = stepRound(createInitialTown(), { allocations: {}, projectStarts: [] }, 1);
    expect(a.snapshot.ecology).toBeGreaterThan(b.snapshot.ecology);
  });

  it("cannot complete GREEN_MFG started in round 6", () => {
    const result = playInteractive((n) => {
      if (n === 1) return { allocations: {}, projectStarts: ["GRID", "EMISSIONS"] };
      if (n === 2) return { allocations: {}, projectStarts: ["FACTORIES"] };
      if (n === 6) return { allocations: {}, projectStarts: ["GREEN_MFG"] };
      return { allocations: Object.fromEntries(SECTORS.map((k) => [k, 0.1])), projectStarts: [] };
    });
    expect(result.started.GREEN_MFG).toBeDefined();
    expect(result.completed.GREEN_MFG).toBeUndefined();
  });

  it("can complete GREEN_MFG started in round 5", () => {
    const result = playInteractive((n) => {
      if (n === 1) return { allocations: {}, projectStarts: ["GRID", "EMISSIONS"] };
      if (n === 2) return { allocations: {}, projectStarts: ["FACTORIES"] };
      if (n === 5) return { allocations: {}, projectStarts: ["GREEN_MFG"] };
      return { allocations: Object.fromEntries(SECTORS.map((k) => [k, 0.1])), projectStarts: [] };
    });
    expect(result.completed.GREEN_MFG).toBe(6);
  });
});

describe("events", () => {
  it("runs pack A in order", () => {
    const result = play();
    const codes = result.rounds.map((r) => r.eventCode);
    expect(codes).toEqual([null, "HEATWAVE", "DROUGHT", "FLOOD", "CONTAMINATION", null]);
    expect(PACK_A[2]).toBe("HEATWAVE");
    expect(result.rounds[0].damage).toBe(0);
    expect(result.rounds[5].damage).toBe(0);
    for (const i of [1, 2, 3, 4]) {
      expect(result.rounds[i].damage).toBeGreaterThan(0);
    }
  });

  it("stacks flood modifiers", () => {
    const stacked = playInteractive((n, _t, a) => ({
      allocations: Object.fromEntries(SECTORS.map((k) => [k, a * 0.1])),
      projectStarts: n === 1 ? ["WETLAND", "FLOOD_WALL"] : [],
    }));
    const base = playInteractive((n, _t, a) => ({
      allocations: Object.fromEntries(SECTORS.map((k) => [k, a * 0.1])),
      projectStarts: [],
    }));
    expect(stacked.completed.WETLAND).toBeDefined();
    expect(stacked.completed.FLOOD_WALL).toBeDefined();
    expect(stacked.rounds[3].damage).toBeLessThan(base.rounds[3].damage);
  });

  it("lets WATER_TREAT reduce the same-round drought", () => {
    const treated = playInteractive((n, _t, a) => ({
      allocations: Object.fromEntries(SECTORS.map((k) => [k, a * 0.1])),
      projectStarts: n === 3 ? ["WATER_TREAT"] : [],
    }));
    const base = playInteractive((_n, _t, a) => ({
      allocations: Object.fromEntries(SECTORS.map((k) => [k, a * 0.1])),
      projectStarts: [],
    }));
    expect(treated.rounds[2].damage).toBeLessThan(base.rounds[2].damage);
  });
});

describe("scoring", () => {
  it("keeps published weights and floors", () => {
    expect(WEIGHTS.ecology + WEIGHTS.welfare + WEIGHTS.economy + WEIGHTS.resilience + WEIGHTS.efficiency).toBeCloseTo(
      1,
      9,
    );
    expect(WEIGHTS.ecology).toBe(0.4);
    expect(WEIGHTS.welfare).toBe(0.25);
    expect(WEIGHTS.economy).toBe(0.15);
    expect(WEIGHTS.resilience).toBe(0.1);
    expect(WEIGHTS.efficiency).toBe(0.1);
    expect(DYS_ECOLOGY).toBe(36);
    expect(DYS_WELFARE).toBe(40);
    expect(DYS_ECONOMY).toBe(40);
    expect(DYS_PREP_INFRA).toBe(32);
  });

  it("keeps scores in (0, 100) for balanced play", () => {
    const result = playInteractive(balancedChoose);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBe(finalScore(result.rounds.map((r) => r.snapshot.snapshot)));
  });

  it("ranks industry dump below balanced", () => {
    const industry = playInteractive((_n, _t, a) => ({
      allocations: {
        restoration: 0,
        pollution_control: a * 0.04,
        water: a * 0.04,
        energy: a * 0.22,
        agriculture: a * 0.08,
        industry: a * 0.42,
        infrastructure: a * 0.14,
        public_services: a * 0.06,
      },
      projectStarts: [],
    }));
    expect(playInteractive(balancedChoose).score).toBeGreaterThan(industry.score);
  });

  it("tie-breaks lower seats first", () => {
    const a = playInteractive(balancedChoose);
    const snaps = a.rounds.map((r) => r.snapshot.snapshot);
    const k1 = tieBreakTuple(a.town, snaps, 1);
    const k2 = tieBreakTuple(a.town, snaps, 2);
    expect(k1[3]).toBeLessThan(k2[3]);
  });
});

describe("reproducibility", () => {
  it("gives 20 silent teams the same hash", () => {
    const hashes = Array.from({ length: 20 }, () => play().hash);
    expect(new Set(hashes).size).toBe(1);
  });

  it("replays balanced play byte-stably", () => {
    const a = playInteractive(balancedChoose);
    const b = playInteractive(balancedChoose);
    expect(a.hash).toBe(b.hash);
    expect(a.score).toBe(b.score);
  });

  it("cloneTown is independent", () => {
    const r = playInteractive(balancedChoose);
    const t1 = cloneTown(r.town);
    t1.air = 0;
    expect(r.town.air).not.toBe(0);
  });
});

describe("maintenance and neglect", () => {
  it("bills maintenance the round after a start", () => {
    const r1 = stepRoundPy(createInitialTown(), 1, { allocations: {}, projectStarts: ["RIVER"] });
    expect(r1.maintenance).toBe(0);
    const town = createInitialTown();
    stepRoundPy(town, 1, { allocations: {}, projectStarts: ["RIVER"] });
    expect(maintenanceDue(town, 2)).toBe(6);
    const r2 = stepRoundPy(town, 2, { allocations: {}, projectStarts: [] });
    expect(r2.maintenance).toBe(6);
  });

  it("does not fire productive neglect at 16.0%", () => {
    function atShare(share: number) {
      const rest = 1 - share;
      const env = rest * 0.5;
      const other = rest * 0.5;
      return playInteractive((_n, _t, a) => ({
        allocations: {
          restoration: (a * env) / 3,
          pollution_control: (a * env) / 3,
          water: (a * env) / 3,
          energy: (a * share) / 3,
          agriculture: (a * share) / 3,
          industry: (a * share) / 3,
          infrastructure: (a * other) / 2,
          public_services: (a * other) / 2,
        },
        projectStarts: [],
      }));
    }
    const low = atShare(0.159);
    const high = atShare(0.16);
    expect(high.categories.economy).toBeGreaterThanOrEqual(low.categories.economy - 1e-6);
  });
});

describe("catalogue contract", () => {
  it("has 15 interventions with A-CAT-1.1 numbers", () => {
    expect(Object.keys(CATALOGUE)).toHaveLength(15);
    expect(CATALOGUE.WETLAND.cost).toBe(280);
    expect(CATALOGUE.WETLAND.maintenance).toBe(6);
    expect(CATALOGUE.WETLAND.delayed[1].bio).toBe(10);
    expect(CATALOGUE.WETLAND.eventMult.FLOOD).toBe(0.85);
    expect(CATALOGUE.FLOOD_WALL.eventMult.FLOOD).toBe(0.75);
    expect(CATALOGUE.WATER_TREAT.eventMult.DROUGHT).toBe(0.9);
    expect(CATALOGUE.CLINICS.eventMult.CONTAMINATION).toBe(0.85);
    expect(CATALOGUE.GREEN_MFG.buildRounds).toBe(1);
    expect(CATALOGUE.GREEN_MFG.prerequisites).toEqual(["EMISSIONS", "FACTORIES"]);
    expect(CATALOGUE.FACTORIES.delayed[1].pollution).toBe(2);
    expect(CATALOGUE.GREEN_MFG.delayed[1].pollution).toBe(-10);
    expect(CATALOGUE.GRID.cost).toBe(200);
  });
});

describe("clamp", () => {
  it("bounds to 0–100 by default", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(101)).toBe(100);
    expect(clamp(50)).toBe(50);
  });
});

describe("operating prudent_buffer", () => {
  it("matches official_score.py 58.41", () => {
    const weights = {
      restoration: 0.14,
      pollution_control: 0.14,
      water: 0.12,
      energy: 0.12,
      agriculture: 0.1,
      industry: 0.1,
      infrastructure: 0.16,
      public_services: 0.12,
    };
    const result = playInteractive((_n, _t, available) => {
      const keep = Math.min(300, Math.max(0, available - 520));
      const spendable = Math.max(0, available - keep);
      const allocations = {} as Submission["allocations"];
      for (const k of SECTORS) allocations[k] = spendable * weights[k];
      return { allocations, projectStarts: [] };
    });
    expect(result.score).toBe(58.41);
  });
});
