import { afterEach, describe, expect, it } from "vitest";
import {
  CATALOGUE,
  PACK_A,
  SECTORS,
  WEIGHTS,
  cloneTown,
  createInitialTown,
  ecologyIndex,
  finalScore,
  maintenanceDue,
  playInteractive,
  stateHash,
  stepRound,
  welfareIndex,
} from "../src/index.js";
import {
  applyAllocations,
  applyDrift,
  applyOngoing,
  applyOperatingDelayed,
  applyPendingProjects,
  eventMultiplier,
  incomeFor,
  normalizeSpend,
  resolveStarts,
  startProjects,
} from "../src/engine.js";
import type { Sector } from "../src/constants.js";
import type { Submission, Town } from "../src/types.js";

/**
 * Frozen A-CAT-1.1 numbers from docs/interventions-catalogue.md.
 * Tests compare the engine to this table, not to invented scores.
 */
const SPEC = {
  WETLAND: {
    cost: 280,
    buildRounds: 1,
    maintenance: 6,
    prerequisites: [] as string[],
    mutexGroup: null as string | null,
    immediate: {},
    delayed: { 1: { water_q: 7, bio: 10, soil: 3, buffer: 8 } },
    ongoing: { water_q: 0.35, bio: 0.3, buffer: 0.2 },
    eventMult: { FLOOD: 0.85 },
  },
  REFOREST: {
    cost: 280,
    buildRounds: 2,
    maintenance: 6,
    prerequisites: [],
    mutexGroup: null,
    immediate: {},
    delayed: { 1: { air: 5 }, 2: { bio: 11, soil: 6, buffer: 6 } },
    ongoing: { air: 0.25, bio: 0.25, soil: 0.15 },
    eventMult: {},
  },
  RIVER: {
    cost: 240,
    buildRounds: 0,
    maintenance: 6,
    prerequisites: [],
    mutexGroup: null,
    immediate: { water_q: 5, pollution: -4 },
    delayed: {},
    ongoing: { pollution: -0.55 },
    eventMult: {},
  },
  EMISSIONS: {
    cost: 260,
    buildRounds: 1,
    maintenance: 10,
    prerequisites: [],
    mutexGroup: null,
    immediate: {},
    delayed: { 1: { pollution: -8, air: 4 } },
    ongoing: { pollution: -0.9, economy: -0.2 },
    eventMult: {},
  },
  WASTEWATER: {
    cost: 300,
    buildRounds: 1,
    maintenance: 8,
    prerequisites: [],
    mutexGroup: null,
    immediate: {},
    delayed: { 1: { water_q: 7, pollution: -7, health: 5 } },
    ongoing: {},
    eventMult: { CONTAMINATION: 0.9 },
  },
  WATER_TREAT: {
    cost: 200,
    buildRounds: 0,
    maintenance: 10,
    prerequisites: [],
    mutexGroup: null,
    immediate: { water_q: 6, health: 2 },
    delayed: {},
    ongoing: {},
    eventMult: { DROUGHT: 0.9 },
  },
  GRID: {
    cost: 200,
    buildRounds: 0,
    maintenance: 8,
    prerequisites: [],
    mutexGroup: null,
    immediate: { energy: 6, infra: 2 },
    delayed: {},
    ongoing: {},
    eventMult: {},
  },
  COAL: {
    cost: 280,
    buildRounds: 0,
    maintenance: 18,
    prerequisites: ["GRID"],
    mutexGroup: "ENERGY_BASELOAD",
    immediate: { energy: 8, economy: 4, pollution: 7, air: -4, dirty_energy: 0.25 },
    delayed: {},
    ongoing: { dirty_energy: 0.05, pollution: 0.8 },
    eventMult: {},
  },
  RENEWABLES: {
    cost: 360,
    buildRounds: 2,
    maintenance: 10,
    prerequisites: ["GRID"],
    mutexGroup: "ENERGY_BASELOAD",
    immediate: {},
    delayed: { 2: { energy: 7, pollution: -3, buffer: 2, green_energy: 0.4 } },
    ongoing: {},
    eventMult: {},
  },
  REGEN_AG: {
    cost: 260,
    buildRounds: 1,
    maintenance: 9,
    prerequisites: [],
    mutexGroup: "AGRI_PUSH",
    immediate: { regenerative_ag: 0.3 },
    delayed: { 1: { soil: 5, bio: 3, economy: 2 } },
    ongoing: {},
    eventMult: {},
  },
  INTENSE_AG: {
    cost: 240,
    buildRounds: 0,
    maintenance: 11,
    prerequisites: [],
    mutexGroup: "AGRI_PUSH",
    immediate: { economy: 5, jobs: 4, soil: -3, water_q: -3, pollution: 3, intensive_ag: 0.3 },
    delayed: {},
    ongoing: { intensive_ag: 0.05 },
    eventMult: {},
  },
  FACTORIES: {
    cost: 240,
    buildRounds: 1,
    maintenance: 12,
    prerequisites: ["GRID"],
    mutexGroup: null,
    immediate: {},
    delayed: { 1: { economy: 5, jobs: 4, pollution: 2, industrial_intensity: 0.2 } },
    ongoing: {},
    eventMult: {},
  },
  GREEN_MFG: {
    cost: 280,
    buildRounds: 1,
    maintenance: 10,
    prerequisites: ["EMISSIONS", "FACTORIES"],
    mutexGroup: null,
    immediate: {},
    delayed: { 1: { economy: 6, pollution: -10, jobs: 4, air: 4, industrial_intensity: -0.15 } },
    ongoing: { pollution: -0.7, economy: 0.3 },
    eventMult: { CONTAMINATION: 0.9 },
  },
  FLOOD_WALL: {
    cost: 300,
    buildRounds: 1,
    maintenance: 8,
    prerequisites: [],
    mutexGroup: null,
    immediate: { infra: 5, prep: 6 },
    delayed: { 1: { buffer: 7 } },
    ongoing: {},
    eventMult: { FLOOD: 0.75 },
  },
  CLINICS: {
    cost: 240,
    buildRounds: 0,
    maintenance: 12,
    prerequisites: [],
    mutexGroup: null,
    immediate: { health: 6, prep: 3 },
    delayed: {},
    ongoing: { health: 0.4 },
    eventMult: { CONTAMINATION: 0.85 },
  },
} as const;

const HOLD: Submission = { allocations: {}, projectStarts: [] };

type Trace = {
  town: Town;
  rounds: ReturnType<typeof stepRound>[];
  after: Town[];
};

function field(town: Town, key: string): number {
  return Number((town as unknown as Record<string, number>)[key]);
}

function runTrace(starts: Record<number, string[]>, until = 6): Trace {
  const town = createInitialTown();
  const rounds = [];
  const after: Town[] = [];
  for (let roundNo = 1; roundNo <= until; roundNo++) {
    rounds.push(
      stepRound(town, { allocations: {}, projectStarts: starts[roundNo] ?? [] }, roundNo),
    );
    after.push(cloneTown(town));
  }
  return { town, rounds, after };
}

/** Engine update order up to, but not including, Pack A. Spec: simulation-model.md. */
function townBeforeEvent(preRound: Town, roundNo: number, submission: Submission): Town {
  const town = cloneTown(preRound);
  applyDrift(town);
  applyPendingProjects(town, roundNo);
  applyOperatingDelayed(town);
  applyOngoing(town, roundNo);
  const available = Math.max(0, town.reserve + incomeFor(town, roundNo) - maintenanceDue(town, roundNo));
  const resolved = resolveStarts(town, submission.projectStarts ?? [], available);
  const spend = normalizeSpend(submission.allocations ?? {}, resolved.remaining);
  applyAllocations(town, spend);
  startProjects(town, resolved.accepted, roundNo);
  return town;
}

/** Drought formula from docs/environmental-events.md. Not an invented expectation. */
function droughtFormula(town: Town): number {
  return Math.max(
    0,
    11 + 0.24 * (100 - town.water_q) + 0.16 * (100 - town.soil) + 0.12 * (100 - town.prep) - 0.08 * town.buffer,
  );
}

function heatwaveFormula(town: Town): number {
  return Math.max(
    0,
    10 + 0.2 * (100 - town.water_q) + 0.16 * (100 - town.bio) + 0.18 * (100 - town.prep) - 0.1 * town.buffer,
  );
}

function floodFormula(town: Town): number {
  return Math.max(
    0,
    12 +
      0.2 * (100 - town.infra) +
      0.18 * (100 - town.buffer) +
      0.12 * (100 - town.soil) +
      0.1 * (town.pollution - 40) -
      0.1 * town.prep,
  );
}

function contaminationFormula(town: Town): number {
  return Math.max(
    0,
    9 + 0.24 * (town.pollution - 35) + 0.16 * (100 - town.water_q) + 0.12 * (100 - town.health) - 0.1 * town.prep,
  );
}

function earliestStartPlan(code: string): Record<number, string[]> {
  const ordered: string[] = [];
  const visit = (item: string) => {
    if (ordered.includes(item)) return;
    for (const need of CATALOGUE[item].prerequisites) visit(need);
    ordered.push(item);
  };
  visit(code);

  const plan: Record<number, string[]> = {};
  const completed: Record<string, number> = {};

  const canStart = (item: string, round: number): boolean =>
    CATALOGUE[item].prerequisites.every((need) => {
      const done = completed[need];
      if (done === undefined) return false;
      return CATALOGUE[need].buildRounds === 0 ? done < round : done <= round;
    });

  for (const item of ordered) {
    let round = 1;
    while (round <= 6 && ((plan[round] ?? []).length >= 2 || !canStart(item, round))) {
      round += 1;
    }
    if (round > 6) throw new Error(`cannot schedule ${item} for ${code}`);
    plan[round] = [...(plan[round] ?? []), item];
    completed[item] = round + CATALOGUE[item].buildRounds;
  }
  return plan;
}

describe("catalogue contract vs A-CAT-1.1", () => {
  it("exposes exactly the 15 published codes", () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual(Object.keys(SPEC).sort());
    expect(Object.keys(CATALOGUE)).toHaveLength(15);
  });

  for (const code of Object.keys(SPEC) as Array<keyof typeof SPEC>) {
    it(`${code} matches the published cost, delay, maintenance, mutex, prereqs and effects`, () => {
      const spec = SPEC[code];
      const proj = CATALOGUE[code];
      expect(proj.cost).toBe(spec.cost);
      expect(proj.buildRounds).toBe(spec.buildRounds);
      expect(proj.maintenance).toBe(spec.maintenance);
      expect(proj.prerequisites).toEqual([...spec.prerequisites]);
      expect(proj.mutexGroup).toBe(spec.mutexGroup);
      expect(proj.immediate).toEqual(spec.immediate);
      expect(proj.delayed).toEqual(spec.delayed);
      expect(proj.ongoing).toEqual(spec.ongoing);
      expect(proj.eventMult).toEqual(spec.eventMult);
    });
  }
});

describe("every catalogue project: start, persist, effects", () => {
  for (const code of Object.keys(SPEC) as Array<keyof typeof SPEC>) {
    it(`${code} is accepted once, charged once, and persists through later rounds`, () => {
      const plan = earliestStartPlan(code);
      const treated = runTrace(plan);
      const controlPlan: Record<number, string[]> = {};
      for (const [round, starts] of Object.entries(plan)) {
        controlPlan[Number(round)] = starts.filter((item) => item !== code);
      }
      const control = runTrace(controlPlan);
      const startRound = treated.town.started[code];
      expect(startRound).toBeDefined();
      expect(treated.rounds[startRound - 1].acceptedStarts).toContain(code);
      expect(treated.rounds[startRound - 1].projectCost).toBe(
        (control.rounds[startRound - 1]?.projectCost ?? 0) + CATALOGUE[code].cost,
      );
      expect(treated.rounds[startRound - 1].dropped.find((row) => row.code === code)).toBeUndefined();

      const expectComplete = startRound + CATALOGUE[code].buildRounds;
      if (expectComplete <= 6) {
        expect(treated.town.completed[code]).toBe(expectComplete);
      } else {
        expect(treated.town.completed[code]).toBeUndefined();
      }

      for (let roundNo = startRound; roundNo <= 6; roundNo++) {
        expect(treated.after[roundNo - 1].started[code]).toBe(startRound);
        if (expectComplete <= roundNo) {
          expect(treated.after[roundNo - 1].completed[code]).toBe(expectComplete);
        }
      }

      if (startRound < 6) {
        expect(maintenanceDue(treated.after[startRound - 1], startRound + 1)).toBe(
          maintenanceDue(control.after[startRound - 1], startRound + 1) + CATALOGUE[code].maintenance,
        );
      }

      const replay = runTrace(plan);
      expect(stateHash(replay.town)).toBe(stateHash(treated.town));
    });
  }

  it("rejects a repeat start and does not double-charge", () => {
    const town = createInitialTown();
    const first = stepRound(town, { allocations: {}, projectStarts: ["WATER_TREAT"] }, 1);
    expect(first.acceptedStarts).toEqual(["WATER_TREAT"]);
    expect(first.projectCost).toBe(200);
    const water = town.water_q;
    const second = stepRound(town, { allocations: {}, projectStarts: ["WATER_TREAT"] }, 2);
    expect(second.acceptedStarts).toEqual([]);
    expect(second.dropped[0]).toEqual({ code: "WATER_TREAT", reason: "already_started" });
    expect(second.projectCost).toBe(0);
    expect(town.started.WATER_TREAT).toBe(1);
    expect(town.water_q).not.toBeCloseTo(water + 6, 6);
  });

  it("drops a start that exceeds remaining credits", () => {
    const town = createInitialTown();
    const resolved = resolveStarts(town, ["WATER_TREAT"], 199);
    expect(resolved.accepted).toEqual([]);
    expect(resolved.dropped[0]).toEqual({ code: "WATER_TREAT", reason: "budget" });
    expect(resolved.remaining).toBe(199);
  });
});

describe("immediate, delayed and ongoing landings", () => {
  it("applies RIVER immediate water_q and pollution before any event, then ongoing after completion", () => {
    const treated = runTrace({ 1: ["RIVER"] }, 2);
    const control = runTrace({}, 2);
    expect(treated.after[0].water_q).toBeCloseTo(control.after[0].water_q + 5, 9);
    expect(treated.after[0].pollution).toBeCloseTo(control.after[0].pollution - 4, 9);
    expect(treated.after[0].completed.RIVER).toBe(1);
    expect(treated.rounds[0].eventCode).toBeNull();

    const afterPrefix = (withOngoing: boolean) => {
      const next = cloneTown(treated.after[0]);
      applyDrift(next);
      applyPendingProjects(next, 2);
      applyOperatingDelayed(next);
      if (withOngoing) applyOngoing(next, 2);
      return next;
    };
    expect(afterPrefix(true).pollution).toBeCloseTo(afterPrefix(false).pollution - 0.55, 9);
  });

  it("does not complete WETLAND in the start round; T+1 lands water/bio/soil/buffer then flood shield", () => {
    const treated = runTrace({ 1: ["WETLAND"] }, 4);
    const control = runTrace({}, 4);
    expect(treated.after[0].completed.WETLAND).toBeUndefined();
    expect(treated.after[0].water_q).toBeCloseTo(control.after[0].water_q, 9);
    expect(treated.after[1].completed.WETLAND).toBe(2);
    expect(treated.after[1].water_q).toBeGreaterThan(control.after[1].water_q);
    expect(treated.after[1].bio).toBeGreaterThan(control.after[1].bio);

    const beforeFlood = townBeforeEvent(treated.after[2], 4, HOLD);
    expect(eventMultiplier(beforeFlood, "FLOOD")).toBeCloseTo(0.85, 9);
    expect(treated.rounds[3].damage).toBeCloseTo(floodFormula(beforeFlood) * 0.85, 9);
    expect(treated.rounds[3].damage).toBeLessThan(control.rounds[3].damage);
  });

  it("splits REFOREST across T+1 air and T+2 bio/soil/buffer, completing only at T+2", () => {
    const treated = runTrace({ 1: ["REFOREST"] }, 3);
    const control = runTrace({}, 3);
    expect(treated.after[0].completed.REFOREST).toBeUndefined();
    expect(treated.after[0].air).toBeCloseTo(control.after[0].air, 9);
    expect(treated.after[1].air).toBeGreaterThan(control.after[1].air);
    expect(treated.after[1].completed.REFOREST).toBeUndefined();
    expect(treated.after[2].completed.REFOREST).toBe(3);
    expect(treated.after[2].bio).toBeGreaterThan(control.after[2].bio);
    expect(treated.after[2].soil).toBeGreaterThan(control.after[2].soil);
    expect(eventMultiplier(treated.after[2], "DROUGHT")).toBe(1);
  });

  it("enforces GRID before COAL, mutex against RENEWABLES, and dirty_energy mix", () => {
    const blocked = stepRound(createInitialTown(), { allocations: {}, projectStarts: ["COAL"] }, 1);
    expect(blocked.dropped[0].reason).toMatch(/^prereq:/);
    const sameList = stepRound(createInitialTown(), { allocations: {}, projectStarts: ["GRID", "COAL"] }, 1);
    expect(sameList.acceptedStarts).toEqual(["GRID"]);
    const treated = runTrace({ 1: ["GRID"], 2: ["COAL", "RENEWABLES"] });
    expect(treated.town.started.COAL).toBe(2);
    expect(treated.town.completed.COAL).toBe(2);
    expect(treated.town.started.RENEWABLES).toBeUndefined();
    expect(treated.rounds[1].dropped.some((row) => row.code === "RENEWABLES" && row.reason === "mutex")).toBe(
      true,
    );
    expect(treated.after[1].dirty_energy).toBeGreaterThan(1);
  });

  it("lands FACTORIES then GREEN_MFG on the published chain, with contamination ×0.90 after conversion completes", () => {
    const treated = runTrace({ 1: ["GRID", "EMISSIONS"], 2: ["FACTORIES"], 3: ["GREEN_MFG"] }, 5);
    expect(treated.town.started.GREEN_MFG).toBe(3);
    expect(treated.town.completed.GREEN_MFG).toBe(4);
    const beforeContam = townBeforeEvent(treated.after[3], 5, HOLD);
    expect(eventMultiplier(beforeContam, "CONTAMINATION")).toBeCloseTo(0.9, 9);
    expect(treated.rounds[4].damage).toBeCloseTo(contaminationFormula(beforeContam) * 0.9, 9);
  });
});

describe("eight sector allocations", () => {
  const probes: Array<{ sector: Sector; field: string; direction: "up" | "down" }> = [
    { sector: "restoration", field: "bio", direction: "up" },
    { sector: "pollution_control", field: "pollution", direction: "down" },
    { sector: "water", field: "water_q", direction: "up" },
    { sector: "energy", field: "energy", direction: "up" },
    { sector: "agriculture", field: "jobs", direction: "up" },
    { sector: "industry", field: "economy", direction: "up" },
    { sector: "infrastructure", field: "infra", direction: "up" },
    { sector: "public_services", field: "health", direction: "up" },
  ];

  it("lists exactly the eight published sectors", () => {
    expect([...SECTORS]).toEqual(probes.map((row) => row.sector));
  });

  for (const probe of probes) {
    it(`spending only ${probe.sector} moves ${probe.field} ${probe.direction} versus a silent hold`, () => {
      const treatedTown = createInitialTown();
      const controlTown = createInitialTown();
      const allocations = Object.fromEntries(SECTORS.map((key) => [key, 0])) as Submission["allocations"];
      const probeTown = createInitialTown();
      applyDrift(probeTown);
      applyPendingProjects(probeTown, 1);
      applyOperatingDelayed(probeTown);
      applyOngoing(probeTown, 1);
      const available = Math.max(
        0,
        probeTown.reserve + incomeFor(probeTown, 1) - maintenanceDue(probeTown, 1),
      );
      allocations[probe.sector] = available;
      const treated = stepRound(treatedTown, { allocations, projectStarts: [] }, 1);
      const control = stepRound(controlTown, HOLD, 1);
      expect(treated.acceptedStarts).toEqual([]);
      expect(treated.sectorSpend[probe.sector]).toBeGreaterThan(0);
      expect(treated.projectCost).toBe(0);
      const got = field(treatedTown, probe.field);
      const base = field(controlTown, probe.field);
      if (probe.direction === "up") expect(got).toBeGreaterThan(base);
      else expect(got).toBeLessThan(base);
      expect(control.unspent).toBeCloseTo(control.available, 9);
    });
  }

  it("scales sector spend that exceeds remaining credits after starts", () => {
    const town = createInitialTown();
    const huge = Object.fromEntries(SECTORS.map((key) => [key, 10_000])) as Submission["allocations"];
    const result = stepRound(town, { allocations: huge, projectStarts: ["GRID"] }, 1);
    expect(result.acceptedStarts).toEqual(["GRID"]);
    expect(result.projectCost).toBe(200);
    expect(result.sectorSpend._spent + result.unspent).toBeCloseTo(result.available - 200, 9);
    expect(result.projectCost + result.sectorSpend._spent + result.unspent).toBeCloseTo(result.available, 9);
  });
});

describe("WATER_TREAT water-upgrade campaign (R1 start through drought and R5)", () => {
  const treated = runTrace({ 1: ["WATER_TREAT"] }, 5);
  const control = runTrace({}, 5);

  it("saves as an immediate completion in round 1 with the published deltas and cost", () => {
    expect(treated.rounds[0].acceptedStarts).toEqual(["WATER_TREAT"]);
    expect(treated.rounds[0].projectCost).toBe(200);
    expect(treated.rounds[0].eventCode).toBeNull();
    expect(treated.rounds[0].damage).toBe(0);
    expect(treated.after[0].started.WATER_TREAT).toBe(1);
    expect(treated.after[0].completed.WATER_TREAT).toBe(1);
    expect(treated.after[0].pending.some((item) => item.completeCode === "WATER_TREAT")).toBe(false);
    expect(treated.after[0].water_q).toBeCloseTo(control.after[0].water_q + 6, 9);
    expect(treated.after[0].health).toBeCloseTo(control.after[0].health + 2, 9);
    expect(treated.after[0].reserve).toBeCloseTo(control.after[0].reserve - 200, 9);
    expect(ecologyIndex(treated.after[0])).toBeGreaterThan(ecologyIndex(control.after[0]));
    expect(welfareIndex(treated.after[0])).toBeGreaterThan(welfareIndex(control.after[0]));
  });

  it("does not bill maintenance in the start round, then bills 10 credits from round 2", () => {
    expect(treated.rounds[0].maintenance).toBe(0);
    expect(treated.rounds[1].maintenance).toBe(10);
    expect(control.rounds[1].maintenance).toBe(0);
  });

  it("has no heatwave multiplier; round 2 damage only moves via persisted water_q", () => {
    expect(PACK_A[2]).toBe("HEATWAVE");
    expect(CATALOGUE.WATER_TREAT.eventMult.HEATWAVE).toBeUndefined();
    const beforeHeat = townBeforeEvent(treated.after[0], 2, HOLD);
    expect(eventMultiplier(beforeHeat, "HEATWAVE")).toBe(1);
    expect(treated.rounds[1].damage).toBeCloseTo(heatwaveFormula(beforeHeat), 9);
    expect(treated.rounds[1].damage).toBeLessThan(control.rounds[1].damage);
  });

  it("multiplies round 3 drought damage by 0.90 after completion, matching the published formula", () => {
    expect(PACK_A[3]).toBe("DROUGHT");
    const beforeDrought = townBeforeEvent(treated.after[1], 3, HOLD);
    const controlDrought = townBeforeEvent(control.after[1], 3, HOLD);
    expect(beforeDrought.completed.WATER_TREAT).toBe(1);
    expect(eventMultiplier(beforeDrought, "DROUGHT")).toBeCloseTo(0.9, 9);
    expect(eventMultiplier(controlDrought, "DROUGHT")).toBe(1);
    const expected = droughtFormula(beforeDrought) * 0.9;
    expect(treated.rounds[2].damage).toBeCloseTo(expected, 9);
    expect(treated.rounds[2].damage).toBeLessThan(droughtFormula(beforeDrought) - 1e-9);
    expect(treated.rounds[2].damage).toBeLessThan(control.rounds[2].damage);
    expect(control.rounds[2].damage).toBeCloseTo(droughtFormula(controlDrought), 9);
  });

  it("still owns the upgrade at round 5, with no contamination multiplier (intended zero)", () => {
    expect(PACK_A[5]).toBe("CONTAMINATION");
    expect(treated.after[4].started.WATER_TREAT).toBe(1);
    expect(treated.after[4].completed.WATER_TREAT).toBe(1);
    expect(CATALOGUE.WATER_TREAT.eventMult.CONTAMINATION).toBeUndefined();
    const beforeContam = townBeforeEvent(treated.after[3], 5, HOLD);
    expect(eventMultiplier(beforeContam, "CONTAMINATION")).toBe(1);
    expect(treated.rounds[4].damage).toBeCloseTo(contaminationFormula(beforeContam), 9);
    expect(treated.after[4].water_q).toBeGreaterThan(control.after[4].water_q);
    expect(treated.rounds[4].snapshot.ecology).toBeGreaterThan(control.rounds[4].snapshot.ecology);
  });

  it("scores with the published weights and does not invent a numeric target", () => {
    expect(WEIGHTS).toEqual({
      ecology: 0.4,
      welfare: 0.25,
      economy: 0.15,
      resilience: 0.1,
      efficiency: 0.1,
    });
    const treatedScore = finalScore(treated.rounds.map((round) => round.snapshot.snapshot));
    const controlScore = finalScore(control.rounds.map((round) => round.snapshot.snapshot));
    expect(treatedScore).toBeGreaterThan(controlScore);
  });
});

describe("WATER_TREAT drought multiplier is load-bearing", () => {
  const original = CATALOGUE.WATER_TREAT.eventMult.DROUGHT;

  afterEach(() => {
    CATALOGUE.WATER_TREAT.eventMult.DROUGHT = original;
  });

  it("fails the 0.90 formula assertion when the catalogue multiplier is temporarily disabled", () => {
    expect(original).toBe(0.9);
    CATALOGUE.WATER_TREAT.eventMult.DROUGHT = 1;
    const treated = runTrace({ 1: ["WATER_TREAT"] }, 3);
    const beforeDrought = townBeforeEvent(treated.after[1], 3, HOLD);
    const raw = droughtFormula(beforeDrought);
    expect(eventMultiplier(beforeDrought, "DROUGHT")).toBe(1);
    expect(treated.rounds[2].damage).toBeCloseTo(raw, 9);
    expect(Math.abs(treated.rounds[2].damage - raw * 0.9)).toBeGreaterThan(0.5);
    CATALOGUE.WATER_TREAT.eventMult.DROUGHT = original;
    const restored = runTrace({ 1: ["WATER_TREAT"] }, 3);
    const restoredBefore = townBeforeEvent(restored.after[1], 3, HOLD);
    expect(restored.rounds[2].damage).toBeCloseTo(droughtFormula(restoredBefore) * 0.9, 9);
  });
});

describe("WASTEWATER upgrade (R1 start, drought via water_q, contamination ×0.90)", () => {
  it("completes at T+1, has no drought multiplier, and shields contamination", () => {
    const treated = runTrace({ 1: ["WASTEWATER"] }, 5);
    const control = runTrace({}, 5);
    expect(treated.after[0].completed.WASTEWATER).toBeUndefined();
    expect(treated.after[1].completed.WASTEWATER).toBe(2);
    expect(eventMultiplier(townBeforeEvent(treated.after[1], 3, HOLD), "DROUGHT")).toBe(1);
    expect(treated.rounds[2].damage).toBeLessThan(control.rounds[2].damage);

    const beforeContam = townBeforeEvent(treated.after[3], 5, HOLD);
    expect(eventMultiplier(beforeContam, "CONTAMINATION")).toBeCloseTo(0.9, 9);
    expect(treated.rounds[4].damage).toBeCloseTo(contaminationFormula(beforeContam) * 0.9, 9);
    expect(treated.rounds[4].damage).toBeLessThan(control.rounds[4].damage);
  });
});

describe("named crisis shields", () => {
  it("stacks FLOOD_WALL ×0.75 and WETLAND ×0.85 on the round-4 flood", () => {
    const stacked = runTrace({ 1: ["WETLAND", "FLOOD_WALL"] }, 4);
    const before = townBeforeEvent(stacked.after[2], 4, HOLD);
    expect(eventMultiplier(before, "FLOOD")).toBeCloseTo(0.75 * 0.85, 9);
    expect(stacked.rounds[3].damage).toBeCloseTo(floodFormula(before) * 0.75 * 0.85, 9);
  });

  it("applies CLINICS ×0.85 to contamination, including same-round completion", () => {
    const treated = playInteractive((roundNo) => ({
      allocations: {},
      projectStarts: roundNo === 5 ? ["CLINICS"] : [],
    }));
    const control = playInteractive(() => HOLD);
    expect(treated.completed.CLINICS).toBe(5);
    expect(treated.rounds[4].damage).toBeLessThan(control.rounds[4].damage);
    const prefix = runTrace({}, 4);
    const before = townBeforeEvent(prefix.after[3], 5, { allocations: {}, projectStarts: ["CLINICS"] });
    expect(eventMultiplier(before, "CONTAMINATION")).toBeCloseTo(0.85, 9);
    expect(treated.rounds[4].damage).toBeCloseTo(contaminationFormula(before) * 0.85, 9);
  });
});
