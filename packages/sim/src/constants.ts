export const ENGINE_VERSION = "py-ref-1.1.0";
export const ROUNDS = 6;
export const SECTORS = [
  "restoration",
  "pollution_control",
  "water",
  "energy",
  "agriculture",
  "industry",
  "infrastructure",
  "public_services",
] as const;

export type Sector = (typeof SECTORS)[number];

export const STARTING_RESERVE = 220.0;
export const IDEAL_RESERVE = 300.0;
export const SAT_SCALE = 340.0;
export const SAT_MAGNITUDE = 12.0;
export const NEGLECT_SHARE = 0.16;
export const EVENT_SCALE = 1.0;
export const WEIGHTS = {
  ecology: 0.4,
  welfare: 0.25,
  economy: 0.15,
  resilience: 0.1,
  efficiency: 0.1,
} as const;
export const DYS_ECOLOGY = 36.0;
export const DYS_WELFARE = 40.0;
export const DYS_ECONOMY = 40.0;
export const DYS_PREP_INFRA = 32.0;
export const MAX_STARTS = 2;

export const MIX_COAL_DIRTY_IMMEDIATE = 0.25;
export const MIX_COAL_DIRTY_ONGOING = 0.05;
export const MIX_RENEW_GREEN = 0.4;
export const MIX_REGEN = 0.3;
export const MIX_INTENSE_IMMEDIATE = 0.3;
export const MIX_INTENSE_ONGOING = 0.05;
export const MIX_FACTORIES_INTENSITY = 0.2;
export const MIX_GREEN_INTENSITY = -0.15;

export const INDEX_FIELDS = [
  "air",
  "water_q",
  "soil",
  "bio",
  "pollution",
  "health",
  "services",
  "jobs",
  "economy",
  "fiscal",
  "energy",
  "infra",
  "prep",
  "buffer",
] as const;

export type IndexField = (typeof INDEX_FIELDS)[number];

export const PACK_A: Record<number, "HEATWAVE" | "DROUGHT" | "FLOOD" | "CONTAMINATION" | null> = {
  1: null,
  2: "HEATWAVE",
  3: "DROUGHT",
  4: "FLOOD",
  5: "CONTAMINATION",
  6: null,
};

export const EQUAL: Record<Sector, number> = {
  restoration: 0.125,
  pollution_control: 0.125,
  water: 0.125,
  energy: 0.125,
  agriculture: 0.125,
  industry: 0.125,
  infrastructure: 0.125,
  public_services: 0.125,
};

export const GREEN: Record<Sector, number> = {
  restoration: 0.12,
  pollution_control: 0.16,
  water: 0.12,
  energy: 0.16,
  agriculture: 0.08,
  industry: 0.12,
  infrastructure: 0.14,
  public_services: 0.1,
};

export const RESTORE_EARLY: Record<Sector, number> = {
  restoration: 0.26,
  pollution_control: 0.22,
  water: 0.18,
  energy: 0.08,
  agriculture: 0.06,
  industry: 0.04,
  infrastructure: 0.1,
  public_services: 0.06,
};

export const GROW_EARLY: Record<Sector, number> = {
  restoration: 0.04,
  pollution_control: 0.06,
  water: 0.08,
  energy: 0.16,
  agriculture: 0.12,
  industry: 0.28,
  infrastructure: 0.16,
  public_services: 0.1,
};

export const RESTORE_LATE: Record<Sector, number> = {
  restoration: 0.22,
  pollution_control: 0.2,
  water: 0.16,
  energy: 0.08,
  agriculture: 0.08,
  industry: 0.06,
  infrastructure: 0.1,
  public_services: 0.1,
};

export const GROW_LATE: Record<Sector, number> = {
  restoration: 0.1,
  pollution_control: 0.1,
  water: 0.1,
  energy: 0.14,
  agriculture: 0.12,
  industry: 0.18,
  infrastructure: 0.14,
  public_services: 0.12,
};
