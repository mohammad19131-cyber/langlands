import { NextResponse } from "next/server";
import { getPublicSupabaseConfig, hasServiceRole } from "../../../../lib/env";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import { createServerSupabase } from "../../../../lib/supabase/server";
import { provisionQualifiedTeams } from "../../../../lib/server/provision-teams";
import { assertProvisionTarget } from "../../../../lib/supabase-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Organiser-only night-before provisioning.
 * Authorize with Authorization: Bearer $TEAM_PROVISION_SECRET
 * or a signed-in organiser session for the competition.
 *
 * Body: { teamIds: string[] | string, competitionId?: string }
 * Returns one-time credentials + CSV. Never logs plaintext passwords.
 */
export async function POST(request: Request) {
  const publicConfig = getPublicSupabaseConfig();
  if (!publicConfig.configured || !hasServiceRole()) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 503 },
    );
  }

  const target = assertProvisionTarget(publicConfig.url);
  if (!target.ok) {
    return NextResponse.json({ error: target.error }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "JSON object required" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const teamIds = payload.teamIds;
  if (typeof teamIds !== "string" && !Array.isArray(teamIds)) {
    return NextResponse.json(
      { error: "teamIds must be a comma-separated string or string array." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  let competitionId =
    typeof payload.competitionId === "string" && payload.competitionId.trim()
      ? payload.competitionId.trim()
      : null;

  if (!competitionId) {
    const { data: competition, error } = await admin
      .from("competitions")
      .select("id")
      .eq("slug", "langlands-r3")
      .maybeSingle();
    if (error || !competition?.id) {
      return NextResponse.json({ error: "langlands-r3 competition not found." }, { status: 404 });
    }
    competitionId = competition.id as string;
  }

  const allowed = await assertProvisionAllowed(request, competitionId);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.status });
  }

  const result = await provisionQualifiedTeams(admin, competitionId, teamIds as string[] | string);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // One-time export for the organiser. Callers must store/download securely.
  return NextResponse.json({
    ok: true,
    competitionId: result.competitionId,
    count: result.credentials.length,
    credentials: result.credentials.map((row) => ({
      teamId: row.teamId,
      password: row.password,
      seat: row.seat,
    })),
    csv: result.csv,
    warning:
      "This is the only time plaintext passwords are returned. Download and distribute securely. They are not stored in plaintext.",
  });
}

async function assertProvisionAllowed(
  request: Request,
  competitionId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 503; error: string }> {
  const provisionSecret = process.env.TEAM_PROVISION_SECRET?.trim();
  if (!provisionSecret) {
    return {
      ok: false,
      status: 503,
      error: "TEAM_PROVISION_SECRET is not configured on the server.",
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader === `Bearer ${provisionSecret}`) {
    return { ok: true };
  }

  // Organiser session is allowed only together with a configured secret above
  // (fail closed if secret missing). Ordinary team accounts never pass this.
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 403, error: "forbidden" };
  }

  const admin = createServiceRoleClient();
  const { data: staff } = await admin
    .from("competition_staff")
    .select("staff_role")
    .eq("competition_id", competitionId)
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (staff?.staff_role === "organiser") {
    return { ok: true };
  }
  return { ok: false, status: 403, error: "forbidden" };
}
