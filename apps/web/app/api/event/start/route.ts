import { planEventStart } from "../../../../lib/event-start";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../lib/server/authz";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import { jsonError } from "../../../../lib/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });

  const admin = createServiceRoleClient();
  const { data: competition } = await admin
    .from("competitions")
    .select("id, status")
    .eq("slug", "langlands-r3")
    .maybeSingle();
  if (!competition?.id) return jsonError(404, "invalid", "Competition not found.");
  if (!(await requireOrganiser(authed.user.userId, competition.id))) {
    return jsonError(403, "unauthorized");
  }
  const { data: round } = await admin
    .from("rounds")
    .select("id, status, round_index")
    .eq("competition_id", competition.id)
    .eq("round_index", 1)
    .maybeSingle();
  const planned = planEventStart({
    competitionStatus: String(competition.status),
    round1Status: round ? String(round.status) : null,
  });
  if (!planned.ok) {
    return jsonError(409, "invalid_transition", planned.error);
  }

  const { error: statusError } = await admin
    .from("competitions")
    .update({ status: "live" })
    .eq("id", competition.id);
  if (statusError) return jsonError(409, "invalid_transition", statusError.message);

  if (!round) return jsonError(409, "invalid_transition", "Round 1 is missing.");

  if (planned.openRound1) {
    const { data, error } = await admin.rpc("open_round", {
      _round_id: round.id,
      _actor: authed.user.userId,
    });
    if (error) return jsonError(409, "invalid_transition", error.message);
    await admin.rpc("audit_append", {
      _actor: authed.user.userId,
      _competition: competition.id,
      _team: null,
      _action: "open_round",
      _payload: { roundId: round.id, source: "event_start" },
    });
    return Response.json({ ok: true, status: "live", opened: true, round: data });
  }

  return Response.json({ ok: true, status: "live", opened: false, roundStatus: round.status });
}
