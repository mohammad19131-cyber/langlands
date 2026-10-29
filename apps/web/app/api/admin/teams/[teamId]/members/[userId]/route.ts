import { parseDisplayName, parseMemberRole } from "../../../../../../../lib/admin-ops";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../../../../lib/server/authz";
import { jsonError } from "../../../../../../../lib/server/json";
import { renameTeamMember } from "../../../../../../../lib/server/organiser-writes";
import { createServiceRoleClient } from "../../../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonError(405, "method", "GET does not change team members.");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ teamId: string; userId: string }> },
) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });
  const { teamId, userId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid", "JSON body required.");
  }
  const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const displayName = parseDisplayName(payload.displayName);
  if (!displayName) return jsonError(400, "invalid", "Display name must be 2–80 characters.");
  const role = parseMemberRole(payload.memberRole);
  if (role === false) return jsonError(400, "invalid", "Role must be captain or member.");

  const admin = createServiceRoleClient();
  const { data: team } = await admin
    .from("teams")
    .select("id, competition_id")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return jsonError(404, "invalid", "unknown team");
  if (!(await requireOrganiser(authed.user.userId, team.competition_id))) {
    return jsonError(403, "unauthorized");
  }

  const { data: membership } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return jsonError(404, "invalid", "unknown member");

  const result = await renameTeamMember(
    admin,
    teamId,
    userId,
    authed.user.userId,
    displayName,
    role,
  );
  if (!result.ok) {
    const status = /unauthorized/i.test(result.message) ? 403 : 400;
    return jsonError(status, "invalid", result.message);
  }
  return Response.json({ ok: true, result: result.result });
}
