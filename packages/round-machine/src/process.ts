import {
  cloneTown,
  ENGINE_VERSION,
  finalScore,
  pythonRound,
  stepRound,
  type Submission,
  type Town,
} from "@langlands/sim";
import { townBadges } from "./badges.js";
import { inputChecksum, roundChecksum, townChecksum } from "./checksum.js";
import type {
  Allocations,
  ProcessOutput,
  PublicResultRow,
  TeamRoundInput,
  TownStateRow,
} from "./types.js";
import { SECTOR_KEYS } from "./types.js";
import { sectorSpendOnly } from "./validate.js";

function holdSubmission(): Submission {
  return { allocations: {}, projectStarts: [] };
}

function asSubmission(allocations: Allocations | null, projectStarts: string[] | null): Submission {
  if (!allocations && (!projectStarts || projectStarts.length === 0)) {
    return holdSubmission();
  }
  return {
    allocations: allocations ?? {},
    projectStarts: projectStarts ?? [],
  };
}

function runOnce(input: TeamRoundInput, roundIndex: number): TownStateRow {
  const town = cloneTown(input.preTown);
  const hold = input.allocations === null && (input.projectStarts === null || input.projectStarts.length === 0);
  const submission = asSubmission(input.allocations, input.projectStarts);
  const result = stepRound(town, submission, roundIndex);
  const snaps = [...input.previousSnapshots, result.snapshot.snapshot];
  const spend = sectorSpendOnly(result.sectorSpend);
  const spentSectors = SECTOR_KEYS.reduce((sum, key) => sum + spend[key], 0);
  return {
    teamId: input.teamId,
    roundIndex,
    state: town,
    scoreBreakdown: {
      ecology: result.snapshot.ecology,
      welfare: result.snapshot.welfare,
      economy: result.snapshot.economy,
      resilience: result.snapshot.resilience,
      efficiency: result.snapshot.efficiency,
      penalty: result.snapshot.penalty,
      snapshot: result.snapshot.snapshot,
    },
    snapshotScore: pythonRound(result.snapshot.snapshot, 2),
    finalScore: finalScore(snaps),
    engineVersion: ENGINE_VERSION,
    hash: townChecksum(town),
    applied: {
      allocations: spend,
      projectStarts: result.acceptedStarts,
      available: result.available,
      spent: result.projectCost + spentSectors,
      unspent: result.unspent,
      hold,
    },
  };
}

function toPublic(row: TownStateRow, input: TeamRoundInput): PublicResultRow {
  const badges = townBadges(row.state);
  const town: Town = row.state;
  return {
    teamId: row.teamId,
    roundIndex: row.roundIndex,
    teamSeat: input.seat,
    teamName: input.teamName,
    air: town.air,
    water_q: town.water_q,
    soil: town.soil,
    bio: town.bio,
    pollution: town.pollution,
    health: town.health,
    services: town.services,
    jobs: town.jobs,
    economy: town.economy,
    fiscal: town.fiscal,
    energy: town.energy,
    infra: town.infra,
    prep: town.prep,
    buffer: town.buffer,
    reserve: town.reserve,
    population: town.population,
    energyMix: badges.energyMix,
    agriculture: badges.agriculture,
    industry: badges.industry,
    scoreBreakdown: row.scoreBreakdown,
    snapshotScore: row.snapshotScore,
    finalScore: row.finalScore,
    engineVersion: row.engineVersion,
  };
}

export class ProcessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessError";
  }
}

/**
 * Process all 20 teams twice. Does not write to the database.
 * Uses only packages/sim stepRound (frozen py-ref-1.1.0).
 */
export function processRound(args: {
  roundIndex: number;
  catalogueHash: string;
  teams: TeamRoundInput[];
}): ProcessOutput {
  if (args.teams.length !== 20) {
    throw new ProcessError(`exactly 20 teams required, got ${args.teams.length}`);
  }
  const seats = new Set(args.teams.map((t) => t.seat));
  if (seats.size !== 20) {
    throw new ProcessError("seats must be unique 1–20");
  }
  for (const team of args.teams) {
    if (team.seat < 1 || team.seat > 20) {
      throw new ProcessError(`invalid seat ${team.seat}`);
    }
  }

  const pass = (label: string): TownStateRow[] => {
    const rows = args.teams
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((team) => runOnce(team, args.roundIndex));
    if (rows.length !== 20) throw new ProcessError(`${label}: expected 20 outputs`);
    return rows;
  };

  const orderedTeams = args.teams.slice().sort((a, b) => a.seat - b.seat);
  const first = pass("pass-1");
  const second = pass("pass-2");
  for (let i = 0; i < 20; i++) {
    if (first[i].hash !== second[i].hash) {
      throw new ProcessError(`replay mismatch at seat ${orderedTeams[i]?.seat ?? i}`);
    }
  }

  const checksum = roundChecksum({
    engineVersion: ENGINE_VERSION,
    catalogueHash: args.catalogueHash,
    roundIndex: args.roundIndex,
    seats: first.map((row, i) => ({
      seat: args.teams.slice().sort((a, b) => a.seat - b.seat)[i].seat,
      hash: row.hash,
    })),
  });
  const replayChecksum = roundChecksum({
    engineVersion: ENGINE_VERSION,
    catalogueHash: args.catalogueHash,
    roundIndex: args.roundIndex,
    seats: second.map((row, i) => ({
      seat: args.teams.slice().sort((a, b) => a.seat - b.seat)[i].seat,
      hash: row.hash,
    })),
  });
  if (checksum !== replayChecksum) {
    throw new ProcessError("round checksum replay mismatch");
  }

  const publicRows = first.map((row, i) => toPublic(row, orderedTeams[i]));

  return {
    engineVersion: ENGINE_VERSION,
    roundIndex: args.roundIndex,
    inputChecksum: inputChecksum(
      orderedTeams.map((t) => ({
        seat: t.seat,
        submissionId: t.allocations === null && t.projectStarts === null ? null : t.teamId,
      })),
    ),
    replayChecksum,
    checksum,
    townStates: first,
    publicRows,
  };
}

export function publicHasPrivateKeys(row: PublicResultRow): string[] {
  const banned = ["state", "ownedProjects", "allocations", "projectStarts", "pending", "started", "completed"];
  return banned.filter((key) => Object.prototype.hasOwnProperty.call(row, key));
}
