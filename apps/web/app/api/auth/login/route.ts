import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig, hasServiceRole } from "../../../../lib/env";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import { parseQualifiedTeamId } from "../../../../lib/team-login";
import {
  systemAuthEmail,
  verifyTeamPassword,
} from "../../../../lib/server/team-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Team ID + password login. Verifies bcrypt on teams.password_hash server-side,
 * then establishes a Supabase Auth session so auth.uid() / RLS / submit_decision
 * keep working. Never trusts a client-supplied seat UUID for authorization.
 */
export async function POST(request: Request) {
  const publicConfig = getPublicSupabaseConfig();
  if (!publicConfig.configured || !publicConfig.url || !publicConfig.anonKey || !hasServiceRole()) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 503 },
    );
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
  const loginId = parseQualifiedTeamId(
    typeof payload.teamId === "string" ? payload.teamId : "",
  );
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!loginId || !password) {
    return NextResponse.json({ error: "Team ID or password is incorrect." }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, login_id, password_hash, disqualified")
    .eq("login_id", loginId)
    .maybeSingle();

  if (teamError || !team || !team.password_hash || team.disqualified) {
    return NextResponse.json({ error: "Team ID or password is incorrect." }, { status: 401 });
  }

  const matches = await verifyTeamPassword(password, team.password_hash as string);
  if (!matches) {
    return NextResponse.json({ error: "Team ID or password is incorrect." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("member_role", "captain")
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    return NextResponse.json({ error: "Team ID or password is incorrect." }, { status: 401 });
  }

  // Keep GoTrue password in sync so the Auth session can be established without
  // exposing any identity string to the browser.
  const sync = await admin.auth.admin.updateUserById(membership.user_id, {
    password,
    email: systemAuthEmail(loginId),
    email_confirm: true,
  });
  if (sync.error) {
    return NextResponse.json({ error: "Sign-in temporarily unavailable." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(publicConfig.url, publicConfig.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });

  const { error: signError } = await supabase.auth.signInWithPassword({
    email: systemAuthEmail(loginId),
    password,
  });

  if (signError) {
    return NextResponse.json({ error: "Team ID or password is incorrect." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    teamId: loginId,
  });
}
