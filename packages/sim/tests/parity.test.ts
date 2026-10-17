import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  SECTORS,
  WEIGHTS,
  createInitialTown,
  dumpsCanonicalState,
  canonicalState,
  play,
  playInteractive,
  stateHash,
} from "../src/index.js";
import type { Submission, Town } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = resolve(here, "../../../docs/simulation/goldens/py_ref_1_1_0.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as {
  engine_version: string;
  weights: Record<string, number>;
  silent: { hash: string; score: number; snaps: number[]; shock_log: number[] };
  balanced: { hash: string; score: number; snaps: number[] };
  grid_then_coal: {
    hash: string;
    score: number;
    started: Record<string, number>;
    completed: Record<string, number>;
  };
};

const T0_HASH = "e0cfd3ee36b2edbeb965c9d4a4afa8f500c9cd0a92260964d4d23f28ccae2eba";
const T0_JSON =
  '{"completed":{},"engine_version":"py-ref-1.1.0","indices":{"air":32.0,"bio":28.0,"buffer":26.0,"economy":50.0,"energy":42.0,"fiscal":52.0,"health":44.0,"infra":46.0,"jobs":46.0,"pollution":68.0,"prep":30.0,"services":48.0,"soil":36.0,"water_q":38.0},"mix":{"dirty_energy":1.0,"green_energy":0.0,"industrial_intensity":0.45,"intensive_ag":0.4,"regenerative_ag":0.1},"population":50000.0,"reserve":220.0,"shock_log":[],"started":{}}';

const SILENT_JSON =
  '{"completed":{},"engine_version":"py-ref-1.1.0","indices":{"air":20.7000079803,"bio":10.3700094611,"buffer":20.8836718096,"economy":12.350087338,"energy":32.6782290794,"fiscal":37.5346538247,"health":19.5549126298,"infra":31.9253832239,"jobs":22.6246183865,"pollution":100.0,"prep":25.5,"services":39.9126916119,"soil":24.794643128,"water_q":8.9005849055},"mix":{"dirty_energy":1.0,"green_energy":0.0,"industrial_intensity":0.45,"intensive_ag":0.4,"regenerative_ag":0.1},"population":48419.0978048,"reserve":3815.0545407404,"shock_log":[0.0,45.272136507,45.4851782246,48.5913548507,44.2374044824,0.0],"started":{}}';

function equalAlloc(available: number): Submission {
  const allocations = {} as Submission["allocations"];
  for (const k of SECTORS) allocations[k] = available * 0.125;
  return { allocations, projectStarts: [] };
}

describe("frozen golden py_ref_1_1_0", () => {
  it("keeps the Python engine version string in the hash contract", () => {
    expect(ENGINE_VERSION).toBe("py-ref-1.1.0");
    expect(golden.engine_version).toBe(ENGINE_VERSION);
    expect(WEIGHTS.ecology).toBe(golden.weights.ecology);
    expect(WEIGHTS.welfare).toBe(golden.weights.welfare);
    expect(WEIGHTS.economy).toBe(golden.weights.economy);
    expect(WEIGHTS.resilience).toBe(golden.weights.resilience);
    expect(WEIGHTS.efficiency).toBe(golden.weights.efficiency);
  });

  it("matches silent score, snaps, shock_log and SHA-256", () => {
    const silent = play();
    expect(silent.score).toBe(golden.silent.score);
    expect(silent.hash).toBe(golden.silent.hash);
    expect(silent.snaps).toEqual(golden.silent.snaps);
    for (let i = 0; i < 6; i++) {
      expect(silent.shock_log[i]).toBeCloseTo(golden.silent.shock_log[i], 9);
    }
  });

  it("matches the Python canonical JSON blob for silent play", () => {
    const silent = play();
    expect(dumpsCanonicalState(canonicalState(silent.town))).toBe(SILENT_JSON);
  });

  it("matches balanced equal-split score, snaps and hash", () => {
    const balanced = playInteractive((_n, _t, a) => equalAlloc(a));
    expect(balanced.score).toBe(golden.balanced.score);
    expect(balanced.hash).toBe(golden.balanced.hash);
    expect(balanced.snaps).toEqual(golden.balanced.snaps);
  });

  it("matches GRID then COAL started/completed and hash", () => {
    const gtc = playInteractive((n, _t, a) => ({
      allocations: Object.fromEntries(SECTORS.map((k) => [k, a * 0.1])),
      projectStarts: n === 1 ? ["GRID", "CLINICS"] : n === 2 ? ["COAL"] : [],
    }));
    expect(gtc.score).toBe(golden.grid_then_coal.score);
    expect(gtc.hash).toBe(golden.grid_then_coal.hash);
    expect(gtc.started).toEqual(golden.grid_then_coal.started);
    expect(gtc.completed).toEqual(golden.grid_then_coal.completed);
  });
});

describe("canonical encoding", () => {
  it("emits Python-style .0 for integer-valued floats on a fresh town", () => {
    const town = createInitialTown();
    expect(dumpsCanonicalState(canonicalState(town))).toBe(T0_JSON);
    expect(stateHash(town)).toBe(T0_HASH);
  });
});
