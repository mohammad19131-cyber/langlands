import { runEventTick } from "../../../../lib/server/event-tick";
import { classifyEventTickAuth, shouldRunEventTick } from "../../../../lib/event-tick-auth";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../lib/server/authz";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import { jsonError } from "../../../../lib/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function competitionForSlug() {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("competitions")
    .select("id")
    .eq("slug", "langlands-r3")
    .maybeSingle();
  return data?.id as string | undefined;
}

async function handleTick(request: Request) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });

  const secret = process.env.EVENT_TICK_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  const gate = classifyEventTickAuth({
    method: request.method,
    authorization: request.headers.get("authorization"),
    configuredSecret: secret,
  });
  if (gate.kind === "deny" || !shouldRunEventTick(gate)) {
    return jsonError(gate.kind === "deny" ? gate.status : 401, gate.kind === "deny" ? gate.error : "unauthorized");
  }

  const competitionId = await competitionForSlug();
  if (!competitionId) return jsonError(404, "invalid", "Competition not found.");

  const admin = createServiceRoleClient();
  let actorId: string | null = null;
  if (gate.kind === "secret") {
    const { data } = await admin
      .from("competition_staff")
      .select("user_id")
      .eq("competition_id", competitionId)
      .eq("staff_role", "organiser")
      .limit(1)
      .maybeSingle();
    actorId = data?.user_id ?? null;
    if (!actorId) return jsonError(503, "unavailable", "No organiser is seated for automatic progress.");
  } else {
    const authed = await requireUser();
    if (!authed.ok) return Response.json(authed.body, { status: authed.status });
    if (!(await requireOrganiser(authed.user.userId, competitionId))) {
      return jsonError(403, "unauthorized");
    }
    actorId = authed.user.userId;
  }

  if (!actorId) return jsonError(404, "invalid", "Competition not found.");

  const result = await runEventTick({ competitionId, actorId });
  return Response.json(result, { status: result.ok ? 200 : 409 });
}

export async function POST(request: Request) {
  return handleTick(request);
}

/** Vercel Cron. Requires EVENT_TICK_SECRET or CRON_SECRET. Not a cookie session. */
export async function GET(request: Request) {
  return handleTick(request);
}
