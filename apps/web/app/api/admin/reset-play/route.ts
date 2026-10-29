import { RESET_PLAY_CONFIRM, resetPlayConfirmed } from "../../../../lib/admin-ops";
import { requireConfigured, requireOrganiser, requireUser } from "../../../../lib/server/authz";
import { jsonError } from "../../../../lib/server/json";
import { resetCompetitionPlay } from "../../../../lib/server/organiser-writes";
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

  const result = await resetCompetitionPlay(admin, competition.id, authed.user.userId);
  if (!result.ok) {
    const status = /unauthorized/i.test(result.message)
      ? 403
      : /not installed|schema cache|could not find the function/i.test(result.message)
        ? 503
        : 409;
    return jsonError(status, "invalid", result.message);
  }
  return Response.json({ ok: true, result: result.result });
}
