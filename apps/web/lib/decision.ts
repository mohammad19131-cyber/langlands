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

/** Primary save control. Never says “saved” until a server-accepted row exists. */
export function saveButtonLabel(args: {
  saving: boolean;
  live: boolean;
  roundOpen: boolean;
  dirty: boolean;
  serverAccepted: boolean;
}): string {
  if (args.saving) return "Saving…";
  if (!args.live) return "Preview only";
  if (!args.roundOpen) return args.serverAccepted ? "Saved on server" : "Not saved";
  if (args.dirty || !args.serverAccepted) return "Save to server";
  return "Saved on server";
}

export function saveStatusLabel(args: {
  saving: boolean;
  live: boolean;
  roundStatus: string;
  dirty: boolean;
  serverAccepted: boolean;
}): string {
  if (args.saving) return "Saving to server…";
  if (!args.live) return "Preview — not submitted";
  if (args.roundStatus === "scheduled") return "Round not open · no save";
  if (args.roundStatus !== "open") {
    return args.serverAccepted ? "Saved on server" : "Round closed · no save";
  }
  if (args.dirty) return "Unsaved draft";
  return args.serverAccepted ? "Saved on server" : "No server save yet";
}

/** Empty start chips describe this round's staging, not a previous published decision. */
export function emptyStartsCopy(roundStatus: string): string {
  if (roundStatus === "scheduled") {
    return "No starts staged for this round · up to 2 when it opens";
  }
  if (roundStatus === "open") return "No projects chosen · up to 2 starts";
  return "No starts staged for this round";
}

/** Engine default when the round locks with no accepted submission. */
export function silentHoldNotice(args: {
  live: boolean;
  roundOpen: boolean;
  serverAccepted: boolean;
}): string | null {
  if (!args.live || !args.roundOpen || args.serverAccepted) return null;
  return "No server save yet. If the round locks this way, the town starts nothing, spends nothing, and holds remaining credits as reserve.";
}
