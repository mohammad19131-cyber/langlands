import { RESET_PLAY_CONFIRM, resetPlayConfirmed } from "../../../../lib/admin-ops";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../lib/server/authz";
import { jsonError } from "../../../../lib/server/json";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonError(405, "method", "GET does not reset play data.");
}

export async function POST(request: Request) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid", "JSON body required.");
  }
  const confirm =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { confirm?: unknown }).confirm
      : null;
  if (!resetPlayConfirmed(confirm)) {
    return jsonError(400, "invalid", `Type ${RESET_PLAY_CONFIRM} to confirm.`);
  }

  const admin = createServiceRoleClient();
  const { data: competition } = await admin
    .from("competitions")
    .select("id")
    .eq("slug", "langlands-r3")
    .maybeSingle();
  if (!competition?.id) return jsonError(404, "invalid", "Competition not found.");
  if (!(await requireOrganiser(authed.user.userId, competition.id))) {
    return jsonError(403, "unauthorized");
  }

  const { data, error } = await admin.rpc("reset_competition_play", {
    _competition: competition.id,
    _actor: authed.user.userId,
  });
  if (error) {
    return jsonError(/unauthorized/i.test(error.message) ? 403 : 409, "invalid", error.message);
  }
  return Response.json({ ok: true, result: data });
}
