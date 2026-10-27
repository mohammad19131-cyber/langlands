import { ENGINE_VERSION, type Town } from "@langlands/sim";
import { processRound, ProcessError } from "./process.js";
import { parseTown } from "./town.js";
import type {
  Allocations,
  Executor,
  LockEntry,
  ProcessOutput,
  PublicResultRow,
  TeamRoundInput,
} from "./types.js";
import { SECTOR_KEYS } from "./types.js";
import {
  assertAuthoritativeStarts,
  InvalidProposalError,
  parseProposal,
  sectorSpendOnly,
} from "./validate.js";
import { cloneTown, stepRound } from "@langlands/sim";

export class RoundMachineError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "RoundMachineError";
  }
}

function mapSqlError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const text = message.toLowerCase();
  if (
    text.includes("unauthorized") ||
    text.includes("42501") ||
    text.includes("permission denied")
  ) {
    throw new RoundMachineError("unauthorized", 403, "unauthorized");
  }
  if (text.includes("conflict") || text.includes("23505")) {
    throw new RoundMachineError("idempotency key reused with a different body", 409, "conflict");
  }
  if (text.includes("checksum mismatch")) {
    throw new RoundMachineError("checksum mismatch", 409, "checksum");
  }
  if (
    text.includes("invalid transition") ||
    text.includes("predecessor") ||
    text.includes("paused") ||
    text.includes("cannot reopen") ||
    text.includes("cannot restore") ||
    text.includes("cannot void")
  ) {
    throw new RoundMachineError(message.replace(/^error:\s*/i, ""), 409, "invalid_transition");
  }
  if (text.includes("exactly 20")) {
    throw new RoundMachineError("exactly 20 teams required", 409, "count");
  }
  throw new RoundMachineError(message.replace(/^error:\s*/i, ""), 400, "invalid");
}

async function scalar<T>(db: Executor, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}

export async function submitDecision(
  db: Executor,
  args: {
    roundId: string;
    teamId: string;
    body: unknown;
    idempotencyKey: string;
    preTown: Town;
    roundIndex: number;
  },
): Promise<{
  ok: boolean;
  status?: "accepted" | "duplicate";
  error?: "closed" | "invalid" | "unauthorized" | "conflict";
  message?: string;
  id?: string;
  applied?: {
    allocations: Allocations;
    projectStarts: string[];
    available: number;
    spent: number;
    unspent: number;
  };
}> {
  let proposal;
  try {
    proposal = parseProposal(args.body, args.idempotencyKey);
    assertAuthoritativeStarts(args.preTown, args.roundIndex, proposal.allocations, proposal.projectStarts);
  } catch (error) {
    if (error instanceof InvalidProposalError) {
      return { ok: false, error: "invalid", message: error.message };
    }
    throw error;
  }

  const dry = stepRound(cloneTown(args.preTown), {
    allocations: proposal.allocations,
    projectStarts: proposal.projectStarts,
  }, args.roundIndex);

  try {
    const row = await scalar<{ submit_decision: Record<string, unknown> }>(
      db,
      `select public.submit_decision($1::uuid, $2::uuid, $3::jsonb, $4::text[], $5, $6, $7::timestamptz) as submit_decision`,
      [
        args.roundId,
        args.teamId,
        JSON.stringify(proposal.allocations),
        proposal.projectStarts,
        proposal.idempotencyKey,
        ENGINE_VERSION,
        proposal.clientClaimedAt ?? null,
      ],
    );
    const result = row.submit_decision;
    if (!result.ok) {
      return {
        ok: false,
        error: "closed",
        message: "Deadline passed. Waiting for results.",
        id: result.id as string | undefined,
      };
    }
    const spend = sectorSpendOnly(dry.sectorSpend);
    const spentSectors = SECTOR_KEYS.reduce((sum, key) => sum + spend[key], 0);
    return {
      ok: true,
      status: result.status === "duplicate" ? "duplicate" : "accepted",
      id: result.id as string | undefined,
      applied: {
        allocations: spend,
        projectStarts: dry.acceptedStarts,
        available: dry.available,
        spent: dry.projectCost + spentSectors,
        unspent: dry.unspent,
      },
    };
  } catch (error) {
    mapSqlError(error);
  }
}

export async function openRound(db: Executor, roundId: string, actorId: string) {
  try {
    const row = await scalar<{ open_round: Record<string, unknown> }>(
      db,
      `select public.open_round($1::uuid, $2::uuid) as open_round`,
      [roundId, actorId],
    );
    await db.query(`select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'open_round', jsonb_build_object('roundId', $2::text))`, [
      actorId,
      roundId,
    ]);
    return row.open_round;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function setRoundWindow(
  db: Executor,
  roundId: string,
  closesAt: string,
  actorId: string,
) {
  try {
    const row = await scalar<{ set_round_window: Record<string, unknown> }>(
      db,
      `select public.set_round_window($1::uuid, $2::timestamptz, $3::uuid) as set_round_window`,
      [roundId, closesAt, actorId],
    );
    await db.query(
      `select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'set_round_window', jsonb_build_object('roundId', $2::text, 'closesAt', $3::text))`,
      [actorId, roundId, closesAt],
    );
    return row.set_round_window;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function reopenRound(db: Executor, roundId: string, actorId: string) {
  try {
    const row = await scalar<{ reopen_round: Record<string, unknown> }>(
      db,
      `select public.reopen_round($1::uuid, $2::uuid) as reopen_round`,
      [roundId, actorId],
    );
    await db.query(
      `select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'reopen_round', jsonb_build_object('roundId', $2::text))`,
      [actorId, roundId],
    );
    return row.reopen_round;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function lockRound(db: Executor, roundId: string, actorId: string) {
  try {
    const row = await scalar<{ lock_round: Record<string, unknown> }>(
      db,
      `select public.lock_round($1::uuid, $2::uuid) as lock_round`,
      [roundId, actorId],
    );
    await db.query(`select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'lock_round', jsonb_build_object('roundId', $2::text))`, [
      actorId,
      roundId,
    ]);
    return row.lock_round;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function loadPreTown(
  db: Executor,
  args: { competitionId: string; teamId: string; roundIndex: number },
): Promise<{ town: Town; previousSnapshots: number[] }> {
  if (args.roundIndex === 1) {
    const tpl = await scalar<{ initial_state: unknown }>(
      db,
      `select initial_state from public.town_templates where competition_id = $1`,
      [args.competitionId],
    );
    return { town: parseTown(tpl.initial_state), previousSnapshots: [] };
  }
  const prev = await scalar<{ state: unknown; snapshot_score: string }>(
    db,
    `select ts.state, ts.snapshot_score::text
       from public.town_states ts
       join public.rounds r on r.id = ts.round_id
      where ts.team_id = $1 and r.competition_id = $2 and r.round_index = $3
        and r.status = 'published'`,
    [args.teamId, args.competitionId, args.roundIndex - 1],
  );
  if (!prev) {
    throw new RoundMachineError("previous town unpublished", 409, "predecessor");
  }
  const history = await db.query<{ snapshot_score: string }>(
    `select ts.snapshot_score::text
       from public.town_states ts
       join public.rounds r on r.id = ts.round_id
      where ts.team_id = $1 and r.competition_id = $2 and r.round_index < $3
        and r.status = 'published'
      order by r.round_index`,
    [args.teamId, args.competitionId, args.roundIndex],
  );
  return {
    town: parseTown(prev.state),
    previousSnapshots: history.rows.map((r) => Number(r.snapshot_score)),
  };
}

function allocationsFromManifest(entry: LockEntry): Allocations | null {
  if (!entry.allocations) return null;
  const out = {} as Allocations;
  for (const key of SECTOR_KEYS) out[key] = Number(entry.allocations[key] ?? 0);
  return out;
}

export async function buildTeamInputs(
  db: Executor,
  args: { competitionId: string; roundIndex: number; manifest: LockEntry[] },
): Promise<TeamRoundInput[]> {
  const inputs: TeamRoundInput[] = [];
  for (const entry of args.manifest) {
    const loaded = await loadPreTown(db, {
      competitionId: args.competitionId,
      teamId: entry.teamId,
      roundIndex: args.roundIndex,
    });
    inputs.push({
      teamId: entry.teamId,
      seat: entry.seat,
      teamName: entry.teamName,
      disqualified: entry.disqualified,
      preTown: loaded.town,
      previousSnapshots: loaded.previousSnapshots,
      allocations: allocationsFromManifest(entry),
      projectStarts: entry.projectStarts,
    });
  }
  return inputs;
}

export async function processClaimedRound(
  db: Executor,
  args: { roundId: string; actorId: string; token: string },
): Promise<{ output: ProcessOutput | null; noop: boolean; status: string }> {
  let claim: Record<string, unknown>;
  try {
    const row = await scalar<{ claim_process: Record<string, unknown> }>(
      db,
      `select public.claim_process($1::uuid, $2::uuid, $3::uuid) as claim_process`,
      [args.roundId, args.actorId, args.token],
    );
    claim = row.claim_process;
  } catch (error) {
    mapSqlError(error);
  }

  if (claim.noop) {
    return { output: null, noop: true, status: String(claim.status) };
  }

  const competitionId = String(claim.competition_id);
  const roundIndex = Number(claim.round_index);
  const manifest = claim.lock_manifest as LockEntry[];
  const catalogue = await scalar<{ catalogue_hash: string }>(
    db,
    `select catalogue_hash from public.competitions where id = $1`,
    [competitionId],
  );

  let output: ProcessOutput;
  try {
    const teams = await buildTeamInputs(db, {
      competitionId,
      roundIndex,
      manifest,
    });
    output = processRound({
      roundIndex,
      catalogueHash: catalogue.catalogue_hash,
      teams,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(
      `select public.save_process_run($1::uuid, $2::uuid, $3::uuid, false, null, null, null, $4, null, $5)`,
      [args.roundId, args.actorId, args.token, ENGINE_VERSION, message],
    );
    throw error instanceof ProcessError
      ? new RoundMachineError(error.message, 409, "process")
      : error;
  }

  await db.query(
    `select public.save_process_run($1::uuid, $2::uuid, $3::uuid, true, $4, $5, $6, $7, $8::jsonb, null)`,
    [
      args.roundId,
      args.actorId,
      args.token,
      output.checksum,
      output.inputChecksum,
      output.replayChecksum,
      output.engineVersion,
      JSON.stringify({
        townStates: output.townStates,
        publicRows: output.publicRows,
      }),
    ],
  );
  await db.query(
    `select public.audit_append($1::uuid, $2::uuid, null, 'process_round', jsonb_build_object('roundId', $3::text, 'checksum', $4::text))`,
    [args.actorId, competitionId, args.roundId, output.checksum],
  );
  return { output, noop: false, status: "processing" };
}

function publicRowsForSql(rows: PublicResultRow[]) {
  return rows.map((row) => ({
    teamId: row.teamId,
    roundIndex: row.roundIndex,
    teamSeat: row.teamSeat,
    teamName: row.teamName,
    air: row.air,
    water_q: row.water_q,
    soil: row.soil,
    bio: row.bio,
    pollution: row.pollution,
    health: row.health,
    services: row.services,
    jobs: row.jobs,
    economy: row.economy,
    fiscal: row.fiscal,
    energy: row.energy,
    infra: row.infra,
    prep: row.prep,
    buffer: row.buffer,
    reserve: row.reserve,
    population: row.population,
    energyMix: row.energyMix,
    agriculture: row.agriculture,
    industry: row.industry,
    scoreBreakdown: row.scoreBreakdown,
    snapshotScore: row.snapshotScore,
    finalScore: row.finalScore,
    engineVersion: row.engineVersion,
  }));
}

function townStatesForSql(output: ProcessOutput) {
  return output.townStates.map((row) => ({
    teamId: row.teamId,
    roundIndex: row.roundIndex,
    state: row.state,
    scoreBreakdown: row.scoreBreakdown,
    snapshotScore: row.snapshotScore,
    finalScore: row.finalScore,
    engineVersion: row.engineVersion,
  }));
}

export async function publishRound(
  db: Executor,
  args: { roundId: string; actorId: string; token: string; output: ProcessOutput },
) {
  try {
    const row = await scalar<{ publish_round: Record<string, unknown> }>(
      db,
      `select public.publish_round($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6::jsonb) as publish_round`,
      [
        args.roundId,
        args.actorId,
        args.token,
        args.output.checksum,
        JSON.stringify(townStatesForSql(args.output)),
        JSON.stringify(publicRowsForSql(args.output.publicRows)),
      ],
    );
    await db.query(
      `select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'publish_round', jsonb_build_object('roundId', $2::text, 'checksum', $3::text))`,
      [args.actorId, args.roundId, args.output.checksum],
    );
    return row.publish_round;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function voidRound(db: Executor, roundId: string, actorId: string) {
  try {
    const row = await scalar<{ void_round: Record<string, unknown> }>(
      db,
      `select public.void_round($1::uuid, $2::uuid) as void_round`,
      [roundId, actorId],
    );
    await db.query(
      `select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'void_round', jsonb_build_object('roundId', $2::text))`,
      [actorId, roundId],
    );
    return row.void_round;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function restoreVoidedRound(db: Executor, roundId: string, actorId: string) {
  try {
    const row = await scalar<{ restore_voided_round: Record<string, unknown> }>(
      db,
      `select public.restore_voided_round($1::uuid, $2::uuid) as restore_voided_round`,
      [roundId, actorId],
    );
    await db.query(
      `select public.audit_append($1::uuid, (select competition_id from public.rounds where id = $2::uuid), null, 'restore_voided_round', jsonb_build_object('roundId', $2::text))`,
      [actorId, roundId],
    );
    return row.restore_voided_round;
  } catch (error) {
    mapSqlError(error);
  }
}

export async function supportRead(
  db: Executor,
  args: { actorId: string; competitionId: string; teamId: string; action: string },
) {
  await db.query(
    `select public.audit_append($1::uuid, $2::uuid, $3::uuid, $4, jsonb_build_object('teamId', $3::text))`,
    [args.actorId, args.competitionId, args.teamId, args.action],
  );
}

export async function recomputeFromManifest(
  db: Executor,
  args: { competitionId: string; roundIndex: number; catalogueHash: string; manifest: LockEntry[] },
): Promise<ProcessOutput> {
  const teams = await buildTeamInputs(db, args);
  return processRound({
    roundIndex: args.roundIndex,
    catalogueHash: args.catalogueHash,
    teams,
  });
}

/** Recompute from the frozen lock_manifest; refuse to publish on mismatch. */
export async function publishWithRecompute(
  db: Executor,
  args: { roundId: string; actorId: string; token: string },
) {
  const round = await scalar<{
    competition_id: string;
    round_index: number;
    process_checksum: string | null;
    status: string;
  }>(
    db,
    `select competition_id, round_index, process_checksum, status
       from public.rounds where id = $1`,
    [args.roundId],
  );
  if (!round) throw new RoundMachineError("unknown round", 404, "not_found");
  if (round.status === "published") {
    return { ok: true, status: "published", idempotent: true };
  }
  if (!round.process_checksum) {
    throw new RoundMachineError("process has not completed", 409, "invalid_transition");
  }
  const privateLock = await scalar<{ payload: LockEntry[] }>(
    db,
    `select payload from public.round_lock_private where round_id = $1`,
    [args.roundId],
  );
  if (!privateLock?.payload) {
    throw new RoundMachineError("process has not completed", 409, "invalid_transition");
  }
  const catalogue = await scalar<{ catalogue_hash: string }>(
    db,
    `select catalogue_hash from public.competitions where id = $1`,
    [round.competition_id],
  );
  const output = await recomputeFromManifest(db, {
    competitionId: round.competition_id,
    roundIndex: round.round_index,
    catalogueHash: catalogue.catalogue_hash,
    manifest: privateLock.payload,
  });
  if (output.checksum !== round.process_checksum) {
    throw new RoundMachineError("checksum mismatch", 409, "checksum");
  }
  return publishRound(db, {
    roundId: args.roundId,
    actorId: args.actorId,
    token: args.token,
    output,
  });
}
