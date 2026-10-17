import { createHash } from "node:crypto";
import { ENGINE_VERSION, INDEX_FIELDS } from "./constants.js";
import { pythonJsonNumber, pythonRound } from "./pythonCompat.js";
import type { Town } from "./types.js";

export type CanonicalState = {
  engine_version: string;
  indices: Record<string, number>;
  reserve: number;
  population: number;
  mix: {
    dirty_energy: number;
    green_energy: number;
    intensive_ag: number;
    regenerative_ag: number;
    industrial_intensity: number;
  };
  started: Record<string, number>;
  completed: Record<string, number>;
  shock_log: number[];
};

export function canonicalState(town: Town): CanonicalState {
  const indices: Record<string, number> = {};
  for (const key of INDEX_FIELDS) {
    indices[key] = pythonRound(town[key], 10);
  }
  const started: Record<string, number> = {};
  for (const key of Object.keys(town.started).sort()) {
    started[key] = town.started[key];
  }
  const completed: Record<string, number> = {};
  for (const key of Object.keys(town.completed).sort()) {
    completed[key] = town.completed[key];
  }
  return {
    engine_version: ENGINE_VERSION,
    indices,
    reserve: pythonRound(town.reserve, 10),
    population: pythonRound(town.population, 10),
    mix: {
      dirty_energy: pythonRound(town.dirty_energy, 10),
      green_energy: pythonRound(town.green_energy, 10),
      intensive_ag: pythonRound(town.intensive_ag, 10),
      regenerative_ag: pythonRound(town.regenerative_ag, 10),
      industrial_intensity: pythonRound(town.industrial_intensity, 10),
    },
    started,
    completed,
    shock_log: town.shock_log.map((x) => pythonRound(x, 10)),
  };
}

function dumpSortedObject(
  obj: Record<string, unknown>,
  valueDump: (key: string, value: unknown) => string,
): string {
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${valueDump(key, obj[key])}`).join(",")}}`;
}

export function dumpsCanonicalState(state: CanonicalState): string {
  const top: Record<string, unknown> = {
    engine_version: state.engine_version,
    indices: state.indices,
    reserve: state.reserve,
    population: state.population,
    mix: state.mix,
    started: state.started,
    completed: state.completed,
    shock_log: state.shock_log,
  };
  return dumpSortedObject(top, (key, value) => {
    if (key === "engine_version") return JSON.stringify(value);
    if (key === "indices" || key === "mix") {
      return dumpSortedObject(value as Record<string, number>, (_k, v) =>
        pythonJsonNumber(v as number),
      );
    }
    if (key === "started" || key === "completed") {
      return dumpSortedObject(value as Record<string, number>, (_k, v) =>
        pythonJsonNumber(v as number, true),
      );
    }
    if (key === "shock_log") {
      const items = value as number[];
      return `[${items.map((n) => pythonJsonNumber(n)).join(",")}]`;
    }
    return pythonJsonNumber(value as number);
  });
}

export function stateHash(town: Town): string {
  const blob = dumpsCanonicalState(canonicalState(town));
  return createHash("sha256").update(blob, "utf8").digest("hex");
}
