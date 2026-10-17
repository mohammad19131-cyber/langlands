import { createServiceRoleClient } from "../../../../../lib/supabase/admin";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../lib/server/authz";
import { jsonError } from "../../../../../lib/server/json";
import { runProcessAndMaybeSave } from "../../../../../lib/server/run-process";

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
  try {
    const result = await runProcessAndMaybeSave(admin, {
      roundId,
      actorId: authed.user.userId,
      publish: false,
    });
    return Response.json({
      ok: true,
      status: result.status,
      checksum: result.checksum,
      noop: result.noop,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "process failed";
    return jsonError(409, "process", message);
  }
}
