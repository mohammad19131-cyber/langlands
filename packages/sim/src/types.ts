import type { Sector } from "./constants.js";

export type MixField =
  | "dirty_energy"
  | "green_energy"
  | "intensive_ag"
  | "regenerative_ag"
  | "industrial_intensity";

export type TownField =
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
  | "buffer"
  | MixField;

export type EventCode = "HEATWAVE" | "DROUGHT" | "FLOOD" | "CONTAMINATION";

export type Project = {
  code: string;
  name: string;
  sector: Sector;
  cost: number;
  buildRounds: number;
  maintenance: number;
  prerequisites: readonly string[];
  mutexGroup: string | null;
  immediate: Record<string, number>;
  delayed: Record<number, Record<string, number>>;
  ongoing: Record<string, number>;
  eventMult: Record<string, number>;
};

export type PendingEffect = {
  landRound: number;
  deltas: Record<string, number>;
  completeCode: string | null;
};

export type Town = {
  air: number;
  water_q: number;
  soil: number;
  bio: number;
  pollution: number;
  health: number;
  services: number;
  jobs: number;
  economy: number;
  fiscal: number;
  energy: number;
  infra: number;
  prep: number;
  buffer: number;
  reserve: number;
  population: number;
  dirty_energy: number;
  green_energy: number;
  intensive_ag: number;
  regenerative_ag: number;
  industrial_intensity: number;
  delayed: Record<string, number>;
  pending: PendingEffect[];
  started: Record<string, number>;
  completed: Record<string, number>;
  shock_log: number[];
  dropped_log: { code: string; reason: string }[];
};

export type Submission = {
  allocations: Partial<Record<Sector, number>>;
  projectStarts: string[];
};

export type Snapshot = {
  ecology: number;
  welfare: number;
  economy: number;
  resilience: number;
  efficiency: number;
  penalty: number;
  snapshot: number;
};

export type RoundResult = {
  roundIndex: number;
  income: number;
  maintenance: number;
  available: number;
  projectCost: number;
  acceptedStarts: string[];
  dropped: { code: string; reason: string }[];
  sectorSpend: Record<string, number>;
  unspent: number;
  eventCode: EventCode | null;
  damage: number;
  snapshot: Snapshot;
};

export type PlayResult = {
  engine_version: string;
  score: number;
  snaps: number[];
  categories: Snapshot;
  ecology: number;
  mean_damage: number;
  reserve: number;
  population: number;
  started: Record<string, number>;
  completed: Record<string, number>;
  dropped: { code: string; reason: string }[];
  shock_log: number[];
  hash: string;
  rounds: RoundResult[];
  town: Town;
};
