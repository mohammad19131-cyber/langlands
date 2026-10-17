import { processRound, type LockEntry, type TeamRoundInput } from "@langlands/round-machine";
import { createServiceRoleClient } from "../../../../../lib/supabase/admin";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../lib/server/authz";
import { jsonError } from "../../../../../lib/server/json";
import { loadPreTownForTeam } from "../../../../../lib/server/load-town";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });
  const { id: roundId } = await context.params;
  const admin = createServiceRoleClient();
  const { data: round } = await admin
    .from("rounds")
    .select("id, competition_id, round_index, status, lock_manifest, process_checksum, process_claim_token")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return jsonError(404, "invalid", "unknown round");
  if (!(await requireOrganiser(authed.user.userId, round.competition_id))) {
    return jsonError(403, "unauthorized");
  }
  if (round.status === "published") {
    return Response.json({ ok: true, status: "published", idempotent: true });
  }
  if (round.status !== "processing" || !round.lock_manifest || !round.process_checksum) {
    return jsonError(409, "invalid_transition", "process has not completed");
  }

  const { data: competition } = await admin
    .from("competitions")
    .select("catalogue_hash")
    .eq("id", round.competition_id)
    .single();
  const manifest = round.lock_manifest as LockEntry[];
  const teams: TeamRoundInput[] = [];
  for (const entry of manifest) {
    const loaded = await loadPreTownForTeam(admin, round.competition_id, entry.teamId, round.round_index);
    if (!loaded) return jsonError(409, "invalid_transition", "previous town unpublished");
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
  const output = processRound({
    roundIndex: round.round_index,
    catalogueHash: competition?.catalogue_hash ?? "",
    teams,
  });
  if (output.checksum !== round.process_checksum) {
    return jsonError(409, "checksum", "checksum mismatch");
  }
  const { data, error } = await admin.rpc("publish_round", {
    _round_id: roundId,
    _actor: authed.user.userId,
    _token: round.process_claim_token,
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
  if (error) return jsonError(409, "invalid_transition", error.message);
  await admin.rpc("audit_append", {
    _actor: authed.user.userId,
    _competition: round.competition_id,
    _team: null,
    _action: "publish_round",
    _payload: { roundId, checksum: output.checksum },
  });
  return Response.json(data);
}
