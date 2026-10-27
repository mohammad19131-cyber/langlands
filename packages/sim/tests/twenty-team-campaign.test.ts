import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CATALOGUE,
  EQUAL,
  GREEN,
  GROW_EARLY,
  PACK_A,
  RESTORE_EARLY,
  ROUNDS,
  SECTORS,
  WEIGHTS,
  createInitialTown,
  playInteractive,
  splitAll,
  stepRound,
  tieBreakTuple,
} from "../src/index.js";
import type { PlayResult, Submission, Town } from "../src/types.js";

const goldenPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/simulation/goldens/py_ref_1_1_0.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as {
  silent: { score: number; hash: string };
  balanced: { score: number; hash: string };
};

const T0_AIR = 32;
const PRUDENT_SHARES = {
  restoration: 0.14,
  pollution_control: 0.14,
  water: 0.12,
  energy: 0.12,
  agriculture: 0.1,
  industry: 0.1,
  infrastructure: 0.16,
  public_services: 0.12,
} as const;

type Chooser = (roundNo: number, town: Town, available: number) => Submission;

function hold(): Submission {
  return { allocations: {}, projectStarts: [] };
}

function mix(shares: Record<string, number>, starts: (roundNo: number) => string[] = () => []): Chooser {
  return (roundNo, _town, available) => ({
    allocations: splitAll(available, shares),
    projectStarts: starts(roundNo),
  });
}

function industryAll(available: number): Submission {
  const allocations = splitAll(available, Object.fromEntries(SECTORS.map((k) => [k, 0])));
  allocations.industry = available;
  return { allocations, projectStarts: [] };
}

function prudentBuffer(_n: number, _t: Town, available: number): Submission {
  const keep = Math.min(300, Math.max(0, available - 520));
  const spendable = Math.max(0, available - keep);
  return { allocations: splitAll(spendable, PRUDENT_SHARES), projectStarts: [] };
}

function cashConserved(result: PlayResult): boolean {
  return result.rounds.every(
    (round) =>
      Math.abs(round.projectCost + round.sectorSpend._spent + round.unspent - round.available) < 1e-6,
  );
}

function rankTwenty(results: PlayResult[]): number[] {
  const tuples = results.map((result, index) => ({
    seat: index + 1,
    key: tieBreakTuple(
      result.town,
      result.rounds.map((round) => round.snapshot.snapshot),
      index + 1,
    ),
  }));
  tuples.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    }
    return 0;
  });
  const rank = Array(20).fill(0);
  tuples.forEach((row, index) => {
    rank[row.seat - 1] = index + 1;
  });
  return rank;
}

function playTwenty(choosers: Chooser[]): PlayResult[] {
  expect(choosers).toHaveLength(20);
  const t0 = createInitialTown();
  const results = choosers.map((choose) => playInteractive(choose));
  expect(createInitialTown().air).toBe(t0.air);
  expect(results).toHaveLength(20);
  return results;
}

/** Run A: allocations only. Seats 17–18 are silent holds (unchanged in Run B). */
function runA(): Chooser[] {
  return [
    mix(RESTORE_EARLY),
    mix(RESTORE_EARLY),
    mix(RESTORE_EARLY),
    mix(RESTORE_EARLY),
    mix(EQUAL),
    mix(EQUAL),
    mix(EQUAL),
    mix(EQUAL),
    mix(GROW_EARLY),
    mix(GROW_EARLY),
    mix(GROW_EARLY),
    (_n, _t, a) => industryAll(a),
    (_n, _t, a) => industryAll(a),
    (_n, _t, a) => industryAll(a),
    prudentBuffer,
    prudentBuffer,
    () => hold(),
    () => hold(),
    mix(GREEN),
    mix(GREEN),
  ];
}

/** Run B: same silent seats; projects and retimed spend on the others. */
function runB(): Chooser[] {
  return [
    mix(RESTORE_EARLY, (n) => (n === 1 ? ["WETLAND", "FLOOD_WALL"] : [])),
    mix(RESTORE_EARLY, (n) => (n === 1 ? ["WETLAND", "FLOOD_WALL"] : [])),
    mix(RESTORE_EARLY, (n) => (n === 1 ? ["WETLAND"] : [])),
    mix(RESTORE_EARLY, (n) => (n === 1 ? ["REFOREST"] : [])),
    mix(EQUAL, (n) => (n === 1 ? ["CLINICS"] : n === 3 ? ["WATER_TREAT"] : [])),
    mix(EQUAL, (n) => (n === 1 ? ["CLINICS"] : n === 3 ? ["WATER_TREAT"] : [])),
    mix(EQUAL, (n) => (n === 1 ? ["RIVER"] : [])),
    mix(EQUAL),
    mix(GROW_EARLY, (n) => (n === 1 ? ["GRID"] : n === 2 ? ["COAL"] : [])),
    mix(GROW_EARLY, (n) => (n === 1 ? ["GRID"] : n === 2 ? ["RENEWABLES"] : [])),
    mix(GROW_EARLY, (n) => (n === 1 ? ["GRID", "CLINICS"] : [])),
    (_n, _t, a) => industryAll(a),
    (n, _t, a) => ({ ...industryAll(a), projectStarts: n === 1 ? ["FACTORIES"] : [] }),
    (n, _t, a) => ({ ...industryAll(a), projectStarts: n === 1 ? ["INTENSE_AG"] : [] }),
    (n, t, a) => ({ ...prudentBuffer(n, t, a), projectStarts: n === 1 ? ["RIVER"] : [] }),
    prudentBuffer,
    () => hold(),
    () => hold(),
    mix(GREEN, (n) => (n === 1 ? ["GRID"] : n === 2 ? ["RENEWABLES"] : [])),
    mix(GREEN, (n) => (n === 1 ? ["EMISSIONS"] : n === 2 ? ["WASTEWATER"] : [])),
  ];
}

function runC(): Chooser[] {
  return [
    () => hold(),
    (_n, _t, a) => ({
      allocations: splitAll(10_000, EQUAL),
      projectStarts: [],
    }),
    (_n, _t, a) => ({
      allocations: {},
      projectStarts: ["RIVER", "CLINICS", "WATER_TREAT"],
    }),
    (_n, _t) => ({ allocations: {}, projectStarts: ["NOT_A_PROJECT"] }),
    (_n, _t) => ({ allocations: {}, projectStarts: ["COAL"] }),
    (n, _t, a) => ({
      allocations: splitAll(a, EQUAL),
      projectStarts: n === 6 ? ["GREEN_MFG"] : [],
    }),
    (n, _t, a) => ({
      allocations: splitAll(a, EQUAL),
      projectStarts:
        n === 1 ? ["GRID", "CLINICS"] : n === 2 ? ["EMISSIONS", "FACTORIES"] : n === 5 ? ["GREEN_MFG"] : [],
    }),
    (_n, _t) => ({ allocations: {}, projectStarts: ["RIVER", "RIVER"] }),
    (_n, _t) => ({ allocations: {}, projectStarts: ["INTENSE_AG", "REGEN_AG"] }),
    (n, _t, a) => ({
      allocations: splitAll(a, EQUAL),
      projectStarts: n === 1 ? ["REFOREST"] : [],
    }),
    mix(EQUAL),
    mix(EQUAL),
    mix(EQUAL),
    mix(EQUAL),
    mix(EQUAL),
    () => hold(),
    mix(EQUAL, (n) => (n === 1 ? ["WETLAND", "FLOOD_WALL"] : [])),
    mix(EQUAL, (n) => (n === 3 ? ["WATER_TREAT"] : [])),
    (n, _t, a) => ({
      allocations: splitAll(Math.max(0, a - (n === 1 ? CATALOGUE.GRID.cost : 0)), EQUAL),
      projectStarts: n === 1 ? ["GRID"] : [],
    }),
    mix(RESTORE_EARLY),
  ];
}

describe("twenty-team six-round campaigns", () => {
  it("keeps published weights and Pack A before any campaign", () => {
    expect(WEIGHTS).toEqual({
      ecology: 0.4,
      welfare: 0.25,
      economy: 0.15,
      resilience: 0.1,
      efficiency: 0.1,
    });
    expect(PACK_A).toEqual({
      1: null,
      2: "HEATWAVE",
      3: "DROUGHT",
      4: "FLOOD",
      5: "CONTAMINATION",
      6: null,
    });
    expect(ROUNDS).toBe(6);
    expect(createInitialTown().air).toBe(T0_AIR);
    expect(createInitialTown().reserve).toBe(220);
  });

  it("Run A: 20 teams, replay-stable, silent and balanced match frozen goldens", () => {
    const first = playTwenty(runA());
    const second = playTwenty(runA());
    const t0 = createInitialTown();

    expect(first.every(cashConserved)).toBe(true);
    expect(first.every((row) => row.engine_version === "py-ref-1.1.0")).toBe(true);
    expect(first.map((row) => row.rounds.map((r) => r.eventCode))).toEqual(
      first.map(() => [null, "HEATWAVE", "DROUGHT", "FLOOD", "CONTAMINATION", null]),
    );
    expect(first.every((row) => row.score > 0 && row.score < 100)).toBe(true);

    for (let seat = 0; seat < 20; seat++) {
      expect(first[seat].hash).toBe(second[seat].hash);
      expect(first[seat].score).toBe(second[seat].score);
      expect(first[seat].town.air).not.toBeUndefined();
    }
    expect(t0.air).toBe(T0_AIR);

    expect(first[4].score).toBe(golden.balanced.score);
    expect(first[4].hash).toBe(golden.balanced.hash);
    expect(first[16].score).toBe(golden.silent.score);
    expect(first[16].hash).toBe(golden.silent.hash);
    expect(first[16].hash).toBe(first[17].hash);
    expect(first[0].hash).toBe(first[1].hash);
    expect(first[0].score).toBeGreaterThan(first[11].score);
    expect(first[14].score).toBe(58.41);

    const ranks = rankTwenty(first);
    expect(ranks).toHaveLength(20);
    expect(new Set(ranks).size).toBe(20);
    const winner = ranks.indexOf(1);
    expect(first[winner].score).toBe(Math.max(...first.map((row) => row.score)));

    expect(first[0].rounds[0].acceptedStarts).toEqual([]);
    expect(first[16].rounds.every((round) => round.acceptedStarts.length === 0)).toBe(true);
  });

  it("Run B: silent seats are unchanged; projects change flood/drought damage and hashes", () => {
    const a = playTwenty(runA());
    const b = playTwenty(runB());

    expect(b[16].hash).toBe(a[16].hash);
    expect(b[17].hash).toBe(a[17].hash);
    expect(b[16].score).toBe(a[16].score);

    expect(b[0].hash).not.toBe(a[0].hash);
    expect(b[0].started.WETLAND).toBe(1);
    expect(b[0].started.FLOOD_WALL).toBe(1);
    expect(b[0].rounds[3].eventCode).toBe("FLOOD");
    expect(b[0].rounds[3].damage).toBeLessThan(a[0].rounds[3].damage);

    expect(b[4].rounds[2].eventCode).toBe("DROUGHT");
    expect(b[4].started.WATER_TREAT).toBe(3);
    expect(b[4].rounds[2].damage).toBeLessThan(a[4].rounds[2].damage);

    expect(b[8].started.GRID).toBe(1);
    expect(b[8].started.COAL).toBe(2);
    expect(b[9].started.RENEWABLES).toBe(2);
    expect(b[9].started.COAL).toBeUndefined();

    expect(b[3].started.REFOREST).toBe(1);
    expect(b[3].rounds[0].snapshot.ecology).toBeLessThanOrEqual(a[3].rounds[0].snapshot.ecology + 1e-9);

    expect(b.every(cashConserved)).toBe(true);
    expect(createInitialTown().air).toBe(T0_AIR);
  });

  it("Run C: invalid starts drop, overspend scales, delays land later, ties break by seat", () => {
    const c = playTwenty(runC());
    const equal = playInteractive(mix(EQUAL));

    expect(c[0].score).toBe(golden.silent.score);
    expect(c[1].rounds[0].sectorSpend._spent).toBeLessThanOrEqual(c[1].rounds[0].available + 1e-9);
    expect(c[2].rounds[0].acceptedStarts).toEqual(["RIVER", "CLINICS"]);
    expect(c[2].dropped.some((row) => row.code === "WATER_TREAT" && row.reason === "max_starts")).toBe(true);
    expect(c[3].dropped.some((row) => row.reason === "unknown")).toBe(true);
    expect(c[4].dropped.some((row) => row.code === "COAL")).toBe(true);
    expect(c[5].completed.GREEN_MFG).toBeUndefined();
    expect(c[6].completed.GREEN_MFG).toBeDefined();
    expect(c[7].rounds[0].acceptedStarts).toEqual(["RIVER"]);
    expect(c[7].dropped.some((row) => row.reason === "duplicate")).toBe(true);
    expect(c[8].rounds[0].acceptedStarts).toEqual(["INTENSE_AG"]);
    expect(c[8].dropped.some((row) => row.reason === "mutex")).toBe(true);

    const withForest = createInitialTown();
    stepRound(withForest, { allocations: {}, projectStarts: ["REFOREST"] }, 1);
    const silentR1 = createInitialTown();
    stepRound(silentR1, { allocations: {}, projectStarts: [] }, 1);
    expect(withForest.air).toBeCloseTo(silentR1.air, 9);
    expect(c[9].started.REFOREST).toBe(1);
    expect(c[9].rounds[0].acceptedStarts).toContain("REFOREST");
    expect(c[9].town.air).toBeGreaterThan(c[0].town.air);

    for (const seat of [10, 11, 12, 13, 14]) {
      expect(c[seat].hash).toBe(equal.hash);
      expect(c[seat].score).toBe(equal.score);
    }
    const ranks = rankTwenty(c);
    expect(ranks[10]).toBeLessThan(ranks[14]);

    expect(c[18].started.GRID).toBe(1);
    expect(c[16].rounds[3].damage).toBeLessThan(equal.rounds[3].damage);
    expect(c[17].rounds[2].damage).toBeLessThan(equal.rounds[2].damage);
    expect(c.every(cashConserved)).toBe(true);

    const replay = playTwenty(runC());
    expect(replay.map((row) => row.hash)).toEqual(c.map((row) => row.hash));
  });
});
