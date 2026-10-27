import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig, hasServiceRole } from "../../../../lib/env";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import { resolveLoginIdentifier } from "../../../../lib/organiser-login";
import {
  isHtmlFormPost,
  loginFieldsFromRecord,
  signInErrorHref,
} from "../../../../lib/sign-in-request";
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
function originOf(request: Request): string {
  return new URL(request.url).origin;
}

function loginFail(
  request: Request,
  html: boolean,
  status: 401 | 503,
  message: string,
  code: "invalid" | "unavailable",
) {
  if (html) {
    return NextResponse.redirect(new URL(signInErrorHref(code), originOf(request)), 303);
  }
  return NextResponse.json({ error: message }, { status });
}

function loginOk(request: Request, html: boolean, next: "/play" | "/room", extra: Record<string, unknown> = {}) {
  if (html) {
    return NextResponse.redirect(new URL(next, originOf(request)), 303);
  }
  return NextResponse.json({ ok: true, next, ...extra });
}

async function readLoginBody(request: Request): Promise<{
  html: boolean;
  identifier: ReturnType<typeof resolveLoginIdentifier>;
  password: string;
} | { error: "invalid_body" }> {
  const html = isHtmlFormPost(request);
  if (html) {
    const form = await request.formData();
    const payload: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") payload[key] = value;
    }
    const parsed = loginFieldsFromRecord(payload);
    return { html: true, identifier: parsed.identifier, password: parsed.password };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "invalid_body" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "invalid_body" };
  }
  const parsed = loginFieldsFromRecord(body as Record<string, unknown>);
  return { html: false, identifier: parsed.identifier, password: parsed.password };
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  const publicConfig = getPublicSupabaseConfig();
  const parsed = await readLoginBody(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const { html, identifier, password } = parsed;

  if (!publicConfig.configured || !publicConfig.url || !publicConfig.anonKey || !hasServiceRole()) {
    return loginFail(request, html, 503, "Supabase is not configured on the server.", "unavailable");
  }

  if (!password || identifier.kind === "invalid") {
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  if (identifier.kind === "organiser") {
    return signInOrganiser(request, html, publicConfig.url, publicConfig.anonKey, identifier.email, password);
  }

  const loginId = identifier.teamId;

  const admin = createServiceRoleClient();
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, login_id, password_hash, disqualified")
    .eq("login_id", loginId)
    .maybeSingle();

  if (teamError || !team || !team.password_hash || team.disqualified) {
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  const matches = await verifyTeamPassword(password, team.password_hash as string);
  if (!matches) {
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  const { data: membership, error: membershipError } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("member_role", "captain")
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  // Keep GoTrue password in sync so the Auth session can be established without
  // exposing any identity string to the browser.
  const sync = await admin.auth.admin.updateUserById(membership.user_id, {
    password,
    email: systemAuthEmail(loginId),
    email_confirm: true,
  });
  if (sync.error) {
    return loginFail(request, html, 503, "Sign-in temporarily unavailable.", "unavailable");
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
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  return loginOk(request, html, "/play", { teamId: loginId });
}

async function signInOrganiser(
  request: Request,
  html: boolean,
  url: string,
  anonKey: string,
  email: string,
  password: string,
) {
  const admin = createServiceRoleClient();
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error: signError } = await supabase.auth.signInWithPassword({ email, password });
  if (signError || !data.user) {
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  const { data: staff } = await admin
    .from("competition_staff")
    .select("staff_role")
    .eq("user_id", data.user.id)
    .eq("staff_role", "organiser")
    .limit(1)
    .maybeSingle();

  if ((staff as { staff_role?: string } | null)?.staff_role !== "organiser") {
    await supabase.auth.signOut();
    return loginFail(request, html, 401, "Team ID or password is incorrect.", "invalid");
  }

  return loginOk(request, html, "/room");
}
