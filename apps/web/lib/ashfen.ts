import { WEIGHTS, type Sector } from "@langlands/sim/public";

/**
 * Browser-safe Ashfen reference data.
 *
 * TOWN_T0 is the shared Round 0 starting template — the identical state every
 * one of the 20 towns begins from (docs/simulation/engine.py `createInitialTown`).
 * These are published spec values, not a live score or an invented board. UI that
 * shows them must label them as the starting template, never as a team result.
 */

export type IndicatorKey =
  | "air"
  | "water_q"
  | "soil"
  | "bio"
  | "pollution"
  | "health"
  | "services"
  | "jobs"
  | "economy"
  | "fiscal"
  | "energy"
  | "infra"
  | "prep"
  | "buffer";

export type EnergyMix = "thermal-heavy" | "mixed" | "clean-leaning";
export type AgriMix = "intensive" | "mixed" | "regenerative";
export type IndustryMix = "light" | "heavy";

export type TownView = {
  label: string;
  round: number;
  indicators: Record<IndicatorKey, number>;
  reserve: number;
  population: number;
  badges: { energyMix: EnergyMix; agriculture: AgriMix; industry: IndustryMix };
};

/** Round 0 — the town as every team inherits it after the disaster. */
export const TOWN_T0: TownView = {
  label: "Round 0 · shared starting template",
  round: 0,
  indicators: {
    air: 32,
    water_q: 38,
    soil: 36,
    bio: 28,
    pollution: 68,
    health: 44,
    services: 48,
    jobs: 46,
    economy: 50,
    fiscal: 52,
    energy: 42,
    infra: 46,
    prep: 30,
    buffer: 26,
  },
  reserve: 220,
  population: 50_000,
  badges: { energyMix: "thermal-heavy", agriculture: "intensive", industry: "heavy" },
};

export type Pillar = {
  key: "ecology" | "welfare" | "economy" | "resilience" | "efficiency";
  name: string;
  weight: number;
  blurb: string;
  formula: string;
  members: IndicatorKey[];
};

/** The five scored pillars (docs/scoring-system.md). Weights come from the engine. */
export const PILLARS: Pillar[] = [
  {
    key: "ecology",
    name: "Ecological recovery",
    weight: WEIGHTS.ecology,
    blurb: "Air, water, soil and habitat, less the pollution load.",
    formula: "(air + water_q + soil + bio + (100 − pollution)) / 5",
    members: ["air", "water_q", "soil", "bio", "pollution"],
  },
  {
    key: "welfare",
    name: "Public welfare",
    weight: WEIGHTS.welfare,
    blurb: "The lived experience of Ashfen's 50,000 residents.",
    formula: "(health + services + jobs) / 3",
    members: ["health", "services", "jobs"],
  },
  {
    key: "economy",
    name: "Economic stability",
    weight: WEIGHTS.economy,
    blurb: "Output, public finances and a reliable grid.",
    formula: "(economy + fiscal + energy) / 3",
    members: ["economy", "fiscal", "energy"],
  },
  {
    key: "resilience",
    name: "Crisis resilience",
    weight: WEIGHTS.resilience,
    blurb: "Preparedness and infrastructure against the next shock.",
    formula: "0.5 · (½ prep + ½ infra) + 0.5 · shock",
    members: ["prep", "infra", "buffer"],
  },
  {
    key: "efficiency",
    name: "Resource efficiency",
    weight: WEIGHTS.efficiency,
    blurb: "Spending discipline, low waste, honest yield.",
    formula: "0.40 · discipline + 0.35 · waste + 0.25 · yield",
    members: [],
  },
];

export type IndicatorMeta = {
  key: IndicatorKey;
  label: string;
  group: "Environment" | "People" | "Economy" | "Resilience";
  /** Whether a higher raw value is the healthier reading. */
  higherIsBetter: boolean;
  unit?: string;
  note: string;
};

export const INDICATORS: IndicatorMeta[] = [
  { key: "air", label: "Air quality", group: "Environment", higherIsBetter: true, note: "Breathable air index." },
  { key: "water_q", label: "Water quality", group: "Environment", higherIsBetter: true, note: "River and aquifer clarity." },
  { key: "soil", label: "Soil health", group: "Environment", higherIsBetter: true, note: "Arable soil condition." },
  { key: "bio", label: "Biodiversity", group: "Environment", higherIsBetter: true, note: "Living habitat and species." },
  { key: "pollution", label: "Pollution load", group: "Environment", higherIsBetter: false, note: "Contaminant burden — lower is better." },
  { key: "health", label: "Public health", group: "People", higherIsBetter: true, note: "Clinical capacity and outcomes." },
  { key: "services", label: "Civic services", group: "People", higherIsBetter: true, note: "Schools, utilities, administration." },
  { key: "jobs", label: "Employment", group: "People", higherIsBetter: true, note: "Secure local livelihoods." },
  { key: "economy", label: "Economic output", group: "Economy", higherIsBetter: true, note: "Productive activity." },
  { key: "fiscal", label: "Fiscal position", group: "Economy", higherIsBetter: true, note: "Public balance sheet." },
  { key: "energy", label: "Energy reliability", group: "Economy", higherIsBetter: true, note: "Grid stability and supply." },
  { key: "infra", label: "Infrastructure", group: "Resilience", higherIsBetter: true, note: "Roads, levees, utilities." },
  { key: "prep", label: "Preparedness", group: "Resilience", higherIsBetter: true, note: "Readiness for the next shock." },
  { key: "buffer", label: "Ecological buffer", group: "Resilience", higherIsBetter: true, note: "Wetlands and reserves that absorb damage." },
];

/** Normalise an indicator to a 0–100 "health" reading (pollution is inverted). */
export function healthValue(meta: IndicatorMeta, raw: number): number {
  return meta.higherIsBetter ? raw : 100 - raw;
}

export function healthBand(value: number): "critical" | "strained" | "fair" | "strong" {
  if (value < 35) return "critical";
  if (value < 50) return "strained";
  if (value < 68) return "fair";
  return "strong";
}

export type EventBrief = {
  round: number;
  code: "HEATWAVE" | "DROUGHT" | "FLOOD" | "CONTAMINATION" | null;
  name: string;
  tagline: string;
  threatens: IndicatorKey[];
  mitigations: string[];
  note: string;
};

/** Pack A — the public, predetermined schedule. Same event for all 20 towns. */
export const EVENT_SCHEDULE: EventBrief[] = [
  {
    round: 1,
    code: null,
    name: "Reconstruction year",
    tagline: "A recovery grant lands. No shock — the only clear window to plant slow projects.",
    threatens: [],
    mitigations: ["Start delayed restoration before the shocks begin", "Shore up preparedness and buffer early"],
    note: "Income carries a one-time recovery grant this round only.",
  },
  {
    round: 2,
    code: "HEATWAVE",
    name: "The long heat",
    tagline: "Weeks above tolerance strain the grid, clinics and habitat.",
    threatens: ["energy", "health", "bio", "water_q"],
    mitigations: ["Clean, reliable energy", "Clinic and service capacity", "Shade and restored habitat"],
    note: "Damage scales with the town's own fragility at lock.",
  },
  {
    round: 3,
    code: "DROUGHT",
    name: "The dry season",
    tagline: "Reservoirs fall; fields and the food economy are tested.",
    threatens: ["water_q", "soil", "economy", "bio"],
    mitigations: ["Water treatment and storage", "Regenerative agriculture", "Wetland buffer"],
    note: "Water stores and the farm economy carry the load.",
  },
  {
    round: 4,
    code: "FLOOD",
    name: "The breach",
    tagline: "The river tops weakened levees. Infrastructure and runoff are exposed.",
    threatens: ["infra", "pollution", "buffer", "health"],
    mitigations: ["Flood defences", "Wetland absorption", "Hardened infrastructure"],
    note: "Flood walls and wetlands compound — the product of their factors applies.",
  },
  {
    round: 5,
    code: "CONTAMINATION",
    name: "The spill",
    tagline: "A pollution incident reaches the water. Clinics and clean-up are decisive.",
    threatens: ["pollution", "water_q", "health", "bio"],
    mitigations: ["Emissions and wastewater control", "Public health capacity", "River cleanup"],
    note: "Residual pollution load determines how hard this lands.",
  },
  {
    round: 6,
    code: null,
    name: "Final accounting",
    tagline: "No shock. Delayed assets can still complete; the ledger closes.",
    threatens: [],
    mitigations: ["Let slow projects land", "Settle the reserve toward the fiscal target"],
    note: "The path score blends this snapshot with the six-round mean.",
  },
];

export const SECTOR_ORDER: Sector[] = [
  "restoration",
  "pollution_control",
  "water",
  "energy",
  "agriculture",
  "industry",
  "infrastructure",
  "public_services",
];
