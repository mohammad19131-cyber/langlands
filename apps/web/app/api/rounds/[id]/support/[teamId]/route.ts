import { createServiceRoleClient } from "../../../../../../lib/supabase/admin";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../../lib/server/authz";
import { jsonError } from "../../../../../../lib/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; teamId: string }> },
) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });
  const { id: roundId, teamId } = await context.params;
  const admin = createServiceRoleClient();
  const { data: round } = await admin
    .from("rounds")
    .select("id, competition_id, round_index, status")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return jsonError(404, "invalid", "unknown round");
  if (!(await requireOrganiser(authed.user.userId, round.competition_id))) {
    return jsonError(403, "unauthorized");
  }

  const { data: submission } = await admin
    .from("submissions")
    .select("id, allocations, project_starts, status, server_received_at")
    .eq("round_id", roundId)
    .eq("team_id", teamId)
    .eq("status", "accepted")
    .maybeSingle();
  const { data: town } = await admin
    .from("town_states")
    .select("id, snapshot_score, final_score, engine_version")
    .eq("round_id", roundId)
    .eq("team_id", teamId)
    .maybeSingle();

  await admin.rpc("audit_append", {
    _actor: authed.user.userId,
    _competition: round.competition_id,
    _team: teamId,
    _action: "support_read",
    _payload: {
      roundId,
      teamId,
      readSubmission: Boolean(submission),
      readTown: Boolean(town),
    },
  });

  return Response.json({
    ok: true,
    round: { id: round.id, index: round.round_index, status: round.status },
    submission,
    town,
  });
}
