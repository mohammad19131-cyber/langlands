import { parseTeamName } from "../../../../../lib/admin-ops";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../lib/server/authz";
import { jsonError } from "../../../../../lib/server/json";
import { createServiceRoleClient } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonError(405, "method", "GET does not change team records.");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });
  const { teamId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid", "JSON body required.");
  }
  const name = parseTeamName(
    body && typeof body === "object" && !Array.isArray(body) ? (body as { name?: unknown }).name : null,
  );
  if (!name) return jsonError(400, "invalid", "Team name must be 2–60 characters.");

  const admin = createServiceRoleClient();
  const { data: team } = await admin.from("teams").select("id, competition_id").eq("id", teamId).maybeSingle();
  if (!team) return jsonError(404, "invalid", "unknown team");
  if (!(await requireOrganiser(authed.user.userId, team.competition_id))) {
    return jsonError(403, "unauthorized");
  }

  const { data, error } = await admin.rpc("organiser_update_team", {
    _team_id: teamId,
    _actor: authed.user.userId,
    _name: name,
  });
  if (error) {
    return jsonError(/unauthorized/i.test(error.message) ? 403 : 400, "invalid", error.message);
  }
  return Response.json({ ok: true, result: data });
}
