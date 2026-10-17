import { createHash } from "node:crypto";
import { dumpsCanonicalState, canonicalState, stateHash } from "@langlands/sim";
import type { Town } from "@langlands/sim";
import type { Allocations } from "./types.js";
import { SECTOR_KEYS } from "./types.js";

export function townChecksum(town: Town): string {
  return stateHash(town);
}

export function canonicalTownBlob(town: Town): string {
  return dumpsCanonicalState(canonicalState(town));
}

export function allocationsChecksum(
  allocations: Allocations,
  projectStarts: string[],
): string {
  const body = {
    allocations: Object.fromEntries(SECTOR_KEYS.map((k) => [k, allocations[k] ?? 0])),
    projectStarts: [...projectStarts],
  };
  return createHash("sha256").update(JSON.stringify(body), "utf8").digest("hex");
}

export function roundChecksum(input: {
  engineVersion: string;
  catalogueHash: string;
  roundIndex: number;
  seats: { seat: number; hash: string }[];
}): string {
  const seats = [...input.seats].sort((a, b) => a.seat - b.seat);
  const blob = [
    `catalogue_hash:${input.catalogueHash}`,
    `engine_version:${input.engineVersion}`,
    `round_index:${input.roundIndex}`,
    ...seats.map((s) => `${s.seat}:${s.hash}`),
  ].join("|");
  return createHash("sha256").update(blob, "utf8").digest("hex");
}

export function inputChecksum(manifest: { seat: number; submissionId: string | null }[]): string {
  const blob = [...manifest]
    .sort((a, b) => a.seat - b.seat)
    .map((m) => `${m.seat}:${m.submissionId ?? "hold"}`)
    .join("|");
  return createHash("sha256").update(blob, "utf8").digest("hex");
}
