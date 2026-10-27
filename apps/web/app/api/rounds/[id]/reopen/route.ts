import { createServiceRoleClient } from "../../../../../lib/supabase/admin";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../lib/server/authz";
import { jsonError } from "../../../../../lib/server/json";

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
    .select("competition_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return jsonError(404, "invalid", "unknown round");
  if (!(await requireOrganiser(authed.user.userId, round.competition_id))) {
    return jsonError(403, "unauthorized");
  }
  const { data, error } = await admin.rpc("reopen_round", {
    _round_id: roundId,
    _actor: authed.user.userId,
  });
  if (error) return jsonError(/unauthorized/i.test(error.message) ? 403 : 409, "invalid_transition", error.message);
  await admin.rpc("audit_append", {
    _actor: authed.user.userId,
    _competition: round.competition_id,
    _team: null,
    _action: "reopen_round",
    _payload: { roundId },
  });
  return Response.json(data);
}
