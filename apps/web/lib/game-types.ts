import type { Sector } from "@langlands/sim/public";
import type { TownView } from "./ashfen";
import type { BoardSeat as RankedSeat } from "./ranking";
import type { ScoreBreakdown as DisplayBreakdown } from "./score-display";

/**
 * Serialisable game state handed from the server (play/page.tsx) to the
 * client GameScreen. Everything here is plain JSON — no engine objects, no
 * functions. The server stays authoritative; this is only what the player is
 * allowed to see and propose against.
 */

export type RoundPhase =
  | "scheduled"
  | "open"
  | "locked"
  | "processing"
  | "published"
  | "void"
  | "none";

export type EventCode = "HEATWAVE" | "DROUGHT" | "FLOOD" | "CONTAMINATION";

export type RoundInfo = {
  id: string | null;
  index: number;
  status: RoundPhase;
  opensAt: string | null;
  closesAt: string | null;
  eventCode: EventCode | null;
  serverNow: string;
};

export type Budget = {
  /** Spendable this round = max(0, reserve + income − maintenance). */
  available: number;
  income: number;
  maintenance: number;
  /** Credits carried in from the previous round. */
  reserve: number;
};

export type ExistingSubmission = {
  allocations: Partial<Record<Sector, number>>;
  projectStarts: string[];
  status: string;
} | null;

export type ScoreBreakdown = DisplayBreakdown;
export type BoardSeat = RankedSeat;
export type LeaderRow = RankedSeat;

export type OwnPublishedRound = {
  roundIndex: number;
  snapshot: number;
  final: number | null;
  penalty: number | null;
  breakdown: ScoreBreakdown | null;
  ecology: number | null;
  reserve: number;
  population: number;
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
  badges: {
    energyMix: "thermal-heavy" | "mixed" | "clean-leaning";
    agriculture: "intensive" | "mixed" | "regenerative";
    industry: "light" | "heavy";
  };
};

export type RoundSummary = {
  index: number;
  id: string | null;
  status: RoundPhase;
};

export type GameContext = {
  /** "live" = seated in a real competition. "preview" = inspect-only, no submit. */
  mode: "live" | "preview";
  configured: boolean;
  signedIn: boolean;
  /** Public player label such as `Team 004`. Never an Auth email. */
  email: string | null;
  isOrganiser: boolean;
  team: { id: string; name: string; seat: number; loginId: string | null } | null;
  competition: { id: string; title: string; roundCount: number } | null;
  round: RoundInfo | null;
  /** The town state the player is deciding against (end of previous round). */
  town: TownView;
  budget: Budget;
  /** Codes already started in prior rounds (cannot be started again). */
  startedCodes: string[];
  /** Codes already completed (satisfy prerequisites, drive event mitigation). */
  completedCodes: string[];
  submission: ExistingSubmission;
  /** Latest published board, or null when no round has been published. */
  leaderboard: BoardSeat[] | null;
  /** Ranked public boards keyed by published round index. */
  boardByRound: Record<number, BoardSeat[]>;
  ownHistory: OwnPublishedRound[];
  publishedRoundIndex: number | null;
  publishedRounds: number[];
  roundSummaries: RoundSummary[];
  /** Honest status line, e.g. why the round is not submittable. */
  notice: string | null;
};

/** The eight player-facing categories map 1:1 onto the engine's eight sectors. */
export type Category = {
  sector: Sector;
  label: string;
  short: string;
};

export const CATEGORIES: Category[] = [
  { sector: "restoration", label: "Habitat & biodiversity", short: "Habitat" },
  { sector: "pollution_control", label: "Pollution & emissions", short: "Pollution" },
  { sector: "water", label: "Water & wastewater", short: "Water" },
  { sector: "energy", label: "Energy & electricity", short: "Energy" },
  { sector: "agriculture", label: "Agriculture & soil", short: "Farming" },
  { sector: "industry", label: "Industry & jobs", short: "Industry" },
  { sector: "public_services", label: "Health & services", short: "Services" },
  { sector: "infrastructure", label: "Flood & resilience", short: "Resilience" },
];

const CATEGORY_BY_SECTOR: Record<Sector, Category> = Object.fromEntries(
  CATEGORIES.map((category) => [category.sector, category]),
) as Record<Sector, Category>;

/** Player-facing sector names used on the map, HUD, and decision desk. */
export function playerSector(sector: Sector): Category {
  return CATEGORY_BY_SECTOR[sector];
}

export const MAX_STARTS_PER_ROUND = 2;
export const TOTAL_ROUNDS = 6;
