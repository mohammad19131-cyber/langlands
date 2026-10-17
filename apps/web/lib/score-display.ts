import { WEIGHTS } from "@langlands/sim/public";

export type ScoreBreakdown = {
  ecology: number;
  welfare: number;
  economy: number;
  resilience: number;
  efficiency: number;
  penalty: number;
  snapshot: number;
};

export const PILLAR_KEYS = [
  "ecology",
  "welfare",
  "economy",
  "resilience",
  "efficiency",
] as const;

export type PillarKey = (typeof PILLAR_KEYS)[number];

export const PILLAR_WEIGHT_PCT: Record<PillarKey, number> = {
  ecology: Math.round(WEIGHTS.ecology * 100),
  welfare: Math.round(WEIGHTS.welfare * 100),
  economy: Math.round(WEIGHTS.economy * 100),
  resilience: Math.round(WEIGHTS.resilience * 100),
  efficiency: Math.round(WEIGHTS.efficiency * 100),
};

export const PILLAR_LABELS: Record<PillarKey, string> = {
  ecology: "Ecological recovery",
  welfare: "Public welfare",
  economy: "Economic stability",
  resilience: "Crisis resilience",
  efficiency: "Resource efficiency",
};

export const PILLAR_SHORT: Record<PillarKey, string> = {
  ecology: "Eco",
  welfare: "Wel",
  economy: "Econ",
  resilience: "Res",
  efficiency: "Eff",
};

const BREAKDOWN_KEYS: (keyof ScoreBreakdown)[] = [
  "ecology",
  "welfare",
  "economy",
  "resilience",
  "efficiency",
  "penalty",
  "snapshot",
];

/** Missing official values render as an em dash, never as a fabricated 0. */
export function formatScore(value: number | null | undefined, digits = 2): string {
  if (!isScoreAvailable(value)) return "—";
  return value.toFixed(digits);
}

export function isScoreAvailable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseBreakdown(raw: unknown): ScoreBreakdown | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const out = {} as ScoreBreakdown;
  for (const key of BREAKDOWN_KEYS) {
    const value = Number(source[key]);
    if (!Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out;
}

/** Official ranking number: running path score when stored, else that round's snapshot. */
export function rankingScore(args: {
  snapshot: number | null | undefined;
  final: number | null | undefined;
}): number | null {
  if (isScoreAvailable(args.final)) return args.final;
  if (isScoreAvailable(args.snapshot)) return args.snapshot;
  return null;
}

export function formatDelta(current: number | null | undefined, previous: number | null | undefined): string {
  if (!isScoreAvailable(current) || !isScoreAvailable(previous)) return "—";
  const delta = current - previous;
  if (Math.abs(delta) < 0.005) return "0.00";
  const formatted = delta.toFixed(2);
  return delta > 0 ? `+${formatted}` : formatted;
}
