import { requireConfigured, requireOrganiser, requireUser } from "../../../../lib/server/authz";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import { jsonError } from "../../../../lib/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });

  let resume = false;
  try {
    const body = (await request.json()) as { resume?: boolean };
    resume = body?.resume === true;
  } catch {
    resume = false;
  }

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
  if (competition.status === "closed" || competition.status === "archived") {
    return jsonError(409, "invalid_transition", "This event has already finished.");
  }

  const next = resume ? "live" : "paused";
  const { error } = await admin.from("competitions").update({ status: next }).eq("id", competition.id);
  if (error) return jsonError(409, "invalid_transition", error.message);
  return Response.json({ ok: true, status: next });
}
