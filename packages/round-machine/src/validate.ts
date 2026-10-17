import {
  CATALOGUE,
  cloneTown,
  SECTORS,
  stepRound,
  type Submission,
  type Town,
} from "@langlands/sim";
import type { Allocations, SubmissionProposal } from "./types.js";
import { SECTOR_KEYS } from "./types.js";

const SECTOR_SET = new Set<string>(SECTORS);

export class InvalidProposalError extends Error {
  readonly code = "invalid" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidProposalError";
  }
}

export function parseAllocations(raw: unknown): Allocations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidProposalError("allocations must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 8 || keys.some((k) => !SECTOR_SET.has(k))) {
    throw new InvalidProposalError("allocations must include exactly the eight sectors");
  }
  const out = {} as Allocations;
  for (const key of SECTOR_KEYS) {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new InvalidProposalError("allocation values must be non-negative numbers");
    }
    out[key] = value;
  }
  return out;
}

export function parseProjectStarts(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new InvalidProposalError("projectStarts must be an array");
  }
  if (raw.length > 2) {
    throw new InvalidProposalError("at most two intervention starts");
  }
  const starts: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item) {
      throw new InvalidProposalError("intervention codes must be strings");
    }
    if (!CATALOGUE[item]) {
      throw new InvalidProposalError(`unknown intervention code ${item}`);
    }
    if (starts.includes(item)) {
      throw new InvalidProposalError("duplicate intervention starts are not allowed");
    }
    starts.push(item);
  }
  if (starts.includes("COAL") && starts.includes("RENEWABLES")) {
    throw new InvalidProposalError("ENERGY_BASELOAD mutex: COAL and RENEWABLES cannot start together");
  }
  if (starts.includes("REGEN_AG") && starts.includes("INTENSE_AG")) {
    throw new InvalidProposalError("AGRI_PUSH mutex: REGEN_AG and INTENSE_AG cannot start together");
  }
  return starts;
}

export function parseProposal(body: unknown, idempotencyKey: string): SubmissionProposal {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidProposalError("body must be an object");
  }
  const obj = body as Record<string, unknown>;
  const allowed = new Set([
    "allocations",
    "projectStarts",
    "idempotencyKey",
    "clientClaimedAt",
    "notes",
    "teamId",
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new InvalidProposalError(`unknown field ${key}`);
    }
  }
  if (!idempotencyKey || idempotencyKey.trim().length < 8) {
    throw new InvalidProposalError("idempotency key required");
  }
  return {
    allocations: parseAllocations(obj.allocations),
    projectStarts: parseProjectStarts(obj.projectStarts ?? []),
    idempotencyKey: idempotencyKey.trim(),
    clientClaimedAt:
      typeof obj.clientClaimedAt === "string" || obj.clientClaimedAt === null
        ? (obj.clientClaimedAt as string | null)
        : null,
  };
}

/** Dry-run the frozen engine on a clone. Rejects starts the engine would drop. */
export function assertAuthoritativeStarts(
  preTown: Town,
  roundIndex: number,
  allocations: Allocations,
  projectStarts: string[],
): Submission {
  const submission: Submission = { allocations, projectStarts };
  const probe = cloneTown(preTown);
  const result = stepRound(probe, submission, roundIndex);
  const dropped = result.dropped.filter((d) =>
    ["unknown", "prereq", "mutex", "budget", "max_starts", "already_started", "duplicate"].some(
      (prefix) => d.reason === prefix || d.reason.startsWith(`${prefix}:`) || d.reason.startsWith("prereq:"),
    ),
  );
  if (dropped.length) {
    throw new InvalidProposalError(
      `starts rejected: ${dropped.map((d) => `${d.code} (${d.reason})`).join(", ")}`,
    );
  }
  return submission;
}

export function sectorSpendOnly(spend: Record<string, number>): Allocations {
  const out = {} as Allocations;
  for (const key of SECTOR_KEYS) out[key] = spend[key] ?? 0;
  return out;
}
