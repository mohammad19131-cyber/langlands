import { createInitialTown, type Town } from "@langlands/sim";

export function parseTown(raw: unknown): Town {
  if (!raw || typeof raw !== "object") {
    throw new Error("town state missing");
  }
  const base = createInitialTown();
  const src = raw as Record<string, unknown>;
  const town = { ...base, ...src } as Town;
  town.pending = Array.isArray(src.pending) ? (src.pending as Town["pending"]) : [];
  town.started = src.started && typeof src.started === "object" ? (src.started as Town["started"]) : {};
  town.completed =
    src.completed && typeof src.completed === "object" ? (src.completed as Town["completed"]) : {};
  town.delayed = src.delayed && typeof src.delayed === "object" ? (src.delayed as Town["delayed"]) : {};
  town.shock_log = Array.isArray(src.shock_log) ? (src.shock_log as number[]) : [];
  town.dropped_log = Array.isArray(src.dropped_log)
    ? (src.dropped_log as Town["dropped_log"])
    : [];
  return town;
}
