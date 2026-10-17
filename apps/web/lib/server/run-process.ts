import { processRound, type LockEntry, type TeamRoundInput } from "@langlands/round-machine";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loadPreTownForTeam } from "./load-town";

export async function runProcessAndMaybeSave(
  admin: SupabaseClient,
  args: { roundId: string; actorId: string; publish: boolean },
) {
  const token = randomUUID();
  const { data: claim, error: claimError } = await admin.rpc("claim_process", {
    _round_id: args.roundId,
    _actor: args.actorId,
    _token: token,
  });
  if (claimError) throw new Error(claimError.message);
  const claimed = claim as {
    ok?: boolean;
    noop?: boolean;
    status?: string;
    lock_manifest?: LockEntry[];
    round_index?: number;
    competition_id?: string;
    checksum?: string;
  };
  if (claimed.noop) {
    return { noop: true, status: claimed.status, checksum: claimed.checksum, token };
  }

  const competitionId = String(claimed.competition_id);
  const roundIndex = Number(claimed.round_index);
  const manifest = claimed.lock_manifest ?? [];
  const { data: competition } = await admin
    .from("competitions")
    .select("catalogue_hash")
    .eq("id", competitionId)
    .single();

  const teams: TeamRoundInput[] = [];
  for (const entry of manifest) {
    const loaded = await loadPreTownForTeam(admin, competitionId, entry.teamId, roundIndex);
    if (!loaded) throw new Error("previous town unpublished");
    teams.push({
      teamId: entry.teamId,
      seat: entry.seat,
      teamName: entry.teamName,
      disqualified: entry.disqualified,
      preTown: loaded.town,
      previousSnapshots: loaded.previousSnapshots,
      allocations: entry.allocations,
      projectStarts: entry.projectStarts,
    });
  }

  let output;
  try {
    output = processRound({
      roundIndex,
      catalogueHash: competition?.catalogue_hash ?? "",
      teams,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.rpc("save_process_run", {
      _round_id: args.roundId,
      _actor: args.actorId,
      _token: token,
      _ok: false,
      _checksum: null,
      _input_checksum: null,
      _replay_checksum: null,
      _engine_version: null,
      _outputs: null,
      _error: message,
    });
    throw error;
  }

  await admin.rpc("save_process_run", {
    _round_id: args.roundId,
    _actor: args.actorId,
    _token: token,
    _ok: true,
    _checksum: output.checksum,
    _input_checksum: output.inputChecksum,
    _replay_checksum: output.replayChecksum,
    _engine_version: output.engineVersion,
    _outputs: { townStates: output.townStates, publicRows: output.publicRows },
    _error: null,
  });
  await admin.rpc("audit_append", {
    _actor: args.actorId,
    _competition: competitionId,
    _team: null,
    _action: "process_round",
    _payload: { roundId: args.roundId, checksum: output.checksum },
  });

  if (args.publish) {
    const { error: pubError } = await admin.rpc("publish_round", {
      _round_id: args.roundId,
      _actor: args.actorId,
      _token: token,
      _checksum: output.checksum,
      _town_states: output.townStates.map((row) => ({
        teamId: row.teamId,
        roundIndex: row.roundIndex,
        state: row.state,
        scoreBreakdown: row.scoreBreakdown,
        snapshotScore: row.snapshotScore,
        finalScore: row.finalScore,
        engineVersion: row.engineVersion,
      })),
      _public_rows: output.publicRows,
    });
    if (pubError) throw new Error(pubError.message);
    await admin.rpc("audit_append", {
      _actor: args.actorId,
      _competition: competitionId,
      _team: null,
      _action: "publish_round",
      _payload: { roundId: args.roundId, checksum: output.checksum },
    });
  }

  return { noop: false, status: args.publish ? "published" : "processing", checksum: output.checksum, token, output };
}
