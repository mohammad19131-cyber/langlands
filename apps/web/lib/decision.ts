import { CATALOGUE, SECTORS, type Sector } from "@langlands/sim/public";
import { MAX_STARTS_PER_ROUND } from "./game-types";

export type DecisionPayload = {
  allocations: Record<Sector, number>;
  projectStarts: string[];
};

export function emptyAllocations(): Record<Sector, number> {
  const out = {} as Record<Sector, number>;
  for (const sector of SECTORS) out[sector] = 0;
  return out;
}

export function fullAllocations(partial: Partial<Record<Sector, number>>): Record<Sector, number> {
  const out = emptyAllocations();
  for (const sector of SECTORS) out[sector] = Math.max(0, Math.round(partial[sector] ?? 0));
  return out;
}

export function sumAllocations(alloc: Record<Sector, number>): number {
  return SECTORS.reduce((acc, sector) => acc + (alloc[sector] ?? 0), 0);
}

export function projectCost(starts: string[]): number {
  return starts.reduce((acc, code) => acc + (CATALOGUE[code]?.cost ?? 0), 0);
}

export function canonicalizeDecision(payload: DecisionPayload): {
  allocations: Record<Sector, number>;
  projectStarts: string[];
} {
  return {
    allocations: fullAllocations(payload.allocations),
    projectStarts: payload.projectStarts.filter((code) => Boolean(CATALOGUE[code])).slice(0, MAX_STARTS_PER_ROUND),
  };
}

export function decisionsEqual(a: DecisionPayload, b: DecisionPayload): boolean {
  const left = canonicalizeDecision(a);
  const right = canonicalizeDecision(b);
  for (const sector of SECTORS) {
    if (left.allocations[sector] !== right.allocations[sector]) return false;
  }
  if (left.projectStarts.length !== right.projectStarts.length) return false;
  return left.projectStarts.every((code, index) => code === right.projectStarts[index]);
}

export function budgetCheck(
  payload: DecisionPayload,
  available: number,
): {
  projectSpend: number;
  sectorSpend: number;
  committed: number;
  remainder: number;
  projectsExceedAvailable: boolean;
  sectorsWillScale: boolean;
} {
  const canonical = canonicalizeDecision(payload);
  const projectSpend = projectCost(canonical.projectStarts);
  const sectorSpend = sumAllocations(canonical.allocations);
  const committed = projectSpend + sectorSpend;
  const remainder = available - committed;
  return {
    projectSpend,
    sectorSpend,
    committed,
    remainder,
    projectsExceedAvailable: projectSpend > available + 0.5,
    sectorsWillScale: projectSpend <= available + 0.5 && committed > available + 0.5,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stable ≥8-char key for a distinct decision. Retries of the same payload reuse it. */
export async function idempotencyKeyFor(
  roundId: string,
  payload: DecisionPayload,
): Promise<string> {
  const canonical = canonicalizeDecision(payload);
  const body = JSON.stringify({
    roundId,
    allocations: canonical.allocations,
    projectStarts: canonical.projectStarts,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return `sub-${toHex(digest).slice(0, 24)}`;
}

export type SaveKind = "draft" | "accepted" | "closed" | "preview";

export function saveKind(args: {
  live: boolean;
  roundStatus: string;
  dirty: boolean;
  accepted: boolean;
}): SaveKind {
  if (!args.live) return "preview";
  if (args.roundStatus !== "open") return args.accepted ? "accepted" : "closed";
  if (args.dirty) return "draft";
  return args.accepted ? "accepted" : "draft";
}
