import {
  assertAuthoritativeStarts,
  InvalidProposalError,
  parseProposal,
  sectorSpendOnly,
  SECTOR_KEYS,
} from "@langlands/round-machine";
import { cloneTown, ENGINE_VERSION, stepRound } from "@langlands/sim";
import { createServiceRoleClient } from "../../../../../lib/supabase/admin";
import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireConfigured, requireTeamMember, requireUser } from "../../../../../lib/server/authz";
import { jsonError } from "../../../../../lib/server/json";
import { loadPreTownForTeam } from "../../../../../lib/server/load-town";
import { humanizeSubmitError } from "../../../../../lib/decision";
import { submissionClosedMessage } from "../../../../../lib/submission-closed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });

  const { id: roundId } = await context.params;
  const idempotencyKey =
    request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key") || "";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid", "JSON body required");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "invalid", "JSON object required");
  }
  const payload = body as Record<string, unknown>;

  // Authorization comes from the session membership, never from a client Team ID.
  const admin = createServiceRoleClient();
  const { data: membership } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", authed.user.userId)
    .limit(1)
    .maybeSingle();
  if (!membership?.team_id) return jsonError(403, "unauthorized");
  const teamId = membership.team_id as string;

  const claimedTeamId = typeof payload.teamId === "string" ? payload.teamId : "";
  if (claimedTeamId && claimedTeamId !== teamId) {
    return jsonError(403, "unauthorized");
  }
  if (!(await requireTeamMember(authed.user.userId, teamId))) {
    return jsonError(403, "unauthorized");
  }
  const { teamId: _teamId, ...proposalSource } = payload;

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, competition_id, round_index, status, opens_at, closes_at")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError || !round) return jsonError(404, "invalid", "unknown round");

  const { data: team } = await admin
    .from("teams")
    .select("id, competition_id, disqualified")
    .eq("id", teamId)
    .maybeSingle();
  if (!team || team.competition_id !== round.competition_id || team.disqualified) {
    return jsonError(403, "unauthorized");
  }

  let proposal;
  try {
    proposal = parseProposal(proposalSource, idempotencyKey);
  } catch (error) {
    const message = error instanceof InvalidProposalError ? error.message : "invalid";
    return jsonError(400, "invalid", message);
  }

  const loaded = await loadPreTownForTeam(
    admin,
    team.competition_id,
    teamId,
    round.round_index,
  );
  if (!loaded) return jsonError(409, "invalid_transition", "previous town unpublished");

  try {
    assertAuthoritativeStarts(
      loaded.town,
      round.round_index,
      proposal.allocations,
      proposal.projectStarts,
    );
  } catch (error) {
    const message = error instanceof InvalidProposalError ? error.message : "invalid";
    return jsonError(400, "invalid", message);
  }

  const dry = stepRound(cloneTown(loaded.town), {
    allocations: proposal.allocations,
    projectStarts: proposal.projectStarts,
  }, round.round_index);

  const userClient = await createServerSupabase();
  if (!userClient) return jsonError(401, "unauthorized");
  const { data, error } = await userClient.rpc("submit_decision", {
    _round_id: roundId,
    _team_id: teamId,
    _allocations: proposal.allocations,
    _project_starts: proposal.projectStarts,
    _idempotency_key: proposal.idempotencyKey,
    _schema_version: ENGINE_VERSION,
    _client_claimed_at: proposal.clientClaimedAt,
  });
  if (error) {
    const safe = humanizeSubmitError(error.message);
    if (/conflict/i.test(error.message)) return jsonError(409, "conflict", safe);
    if (/unauthorized/i.test(error.message)) return jsonError(403, "unauthorized", safe);
    return jsonError(400, "invalid", safe);
  }
  const result = data as { ok?: boolean; status?: string; error?: string; id?: string };
  if (!result?.ok) {
    return jsonError(403, "closed", submissionClosedMessage(round.status as string));
  }

  const spend = sectorSpendOnly(dry.sectorSpend);
  const spentSectors = SECTOR_KEYS.reduce((sum, key) => sum + spend[key], 0);
  return Response.json({
    ok: true,
    status: result.status === "duplicate" ? "duplicate" : "accepted",
    id: result.id,
    applied: {
      allocations: spend,
      projectStarts: dry.acceptedStarts,
      available: dry.available,
      spent: dry.projectCost + spentSectors,
      unspent: dry.unspent,
    },
  });
}
