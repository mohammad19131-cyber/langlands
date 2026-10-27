import { createServiceRoleClient } from "../../../../../lib/supabase/admin";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../lib/server/authz";
import { jsonError } from "../../../../../lib/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXTEND_MINUTES = 30;

export async function POST(
  request: Request,
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
    .select("competition_id, opens_at, closes_at")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return jsonError(404, "invalid", "unknown round");
  if (!(await requireOrganiser(authed.user.userId, round.competition_id))) {
    return jsonError(403, "unauthorized");
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const payload =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  let closesAt: string | null = null;
  const extendMinutes = Number(payload.extendMinutes);
  if (Number.isInteger(extendMinutes) && extendMinutes >= 1 && extendMinutes <= MAX_EXTEND_MINUTES) {
    const currentClose = round.closes_at ? Date.parse(String(round.closes_at)) : Date.now();
    const base = Math.max(currentClose, Date.now());
    closesAt = new Date(base + extendMinutes * 60_000).toISOString();
  } else if (typeof payload.closesAt === "string" && payload.closesAt.trim()) {
    const parsed = Date.parse(payload.closesAt);
    if (Number.isNaN(parsed)) return jsonError(400, "invalid", "closesAt must be an ISO timestamp");
    closesAt = new Date(parsed).toISOString();
  } else {
    return jsonError(400, "invalid", "Provide extendMinutes (1–30) or closesAt");
  }

  const { data, error } = await admin.rpc("set_round_window", {
    _round_id: roundId,
    _closes_at: closesAt,
    _actor: authed.user.userId,
  });
  if (error) return jsonError(/unauthorized/i.test(error.message) ? 403 : 409, "invalid_transition", error.message);
  await admin.rpc("audit_append", {
    _actor: authed.user.userId,
    _competition: round.competition_id,
    _team: null,
    _action: "set_round_window",
    _payload: { roundId, closesAt },
  });
  return Response.json(data);
}
