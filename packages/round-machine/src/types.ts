import type { Sector } from "@langlands/sim";
import type { Snapshot, Town } from "@langlands/sim";

export const SECTOR_KEYS: Sector[] = [
  "restoration",
  "pollution_control",
  "water",
  "energy",
  "agriculture",
  "industry",
  "infrastructure",
  "public_services",
];

export type Allocations = Record<Sector, number>;

export type SubmissionProposal = {
  allocations: Allocations;
  projectStarts: string[];
  idempotencyKey: string;
  clientClaimedAt?: string | null;
};

export type LockEntry = {
  teamId: string;
  seat: number;
  teamName: string;
  disqualified: boolean;
  submissionId: string | null;
  allocations: Allocations | null;
  projectStarts: string[] | null;
};

export type TeamRoundInput = {
  teamId: string;
  seat: number;
  teamName: string;
  disqualified: boolean;
  preTown: Town;
  previousSnapshots: number[];
  allocations: Allocations | null;
  projectStarts: string[] | null;
};

export type PublicResultRow = {
  teamId: string;
  roundIndex: number;
  teamSeat: number;
  teamName: string;
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
  energyMix: "thermal-heavy" | "mixed" | "clean-leaning";
  agriculture: "intensive" | "mixed" | "regenerative";
  industry: "light" | "heavy";
  scoreBreakdown: Snapshot & { meanDamage: number };
  snapshotScore: number;
  finalScore: number;
  engineVersion: string;
};

export type TownStateRow = {
  teamId: string;
  roundIndex: number;
  state: Town;
  scoreBreakdown: Snapshot & { meanDamage: number };
  snapshotScore: number;
  finalScore: number;
  engineVersion: string;
  hash: string;
  applied: {
    allocations: Allocations;
    projectStarts: string[];
    available: number;
    spent: number;
    unspent: number;
    hold: boolean;
  };
};

export type ProcessOutput = {
  engineVersion: string;
  roundIndex: number;
  inputChecksum: string;
  replayChecksum: string;
  checksum: string;
  townStates: TownStateRow[];
  publicRows: PublicResultRow[];
};

export type QueryResult<T> = { rows: T[] };

export type Executor = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};
