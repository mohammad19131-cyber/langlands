import "server-only";
import { createServerSupabase } from "../supabase/server";
import { createServiceRoleClient } from "../supabase/admin";
import { getPublicSupabaseConfig, hasServiceRole } from "../env";

export type Authed = { userId: string; email: string | null };

export async function requireConfigured(): Promise<
  { ok: true } | { ok: false; status: 503; body: { error: string } }
> {
  if (!getPublicSupabaseConfig().configured || !hasServiceRole()) {
    return {
      ok: false,
      status: 503,
      body: { error: "Supabase is not configured on the server." },
    };
  }
  return { ok: true };
}

export async function requireUser(): Promise<
  { ok: true; user: Authed } | { ok: false; status: 401; body: { error: string } }
> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }
  return {
    ok: true,
    user: { userId: data.user.id, email: data.user.email ?? null },
  };
}

export async function requireOrganiser(
  userId: string,
  competitionId: string,
): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("competition_staff")
    .select("staff_role")
    .eq("competition_id", competitionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.staff_role === "organiser";
}

export async function userIsOrganiser(userId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("competition_staff")
    .select("staff_role")
    .eq("user_id", userId)
    .eq("staff_role", "organiser")
    .limit(1)
    .maybeSingle();
  return data?.staff_role === "organiser";
}

export async function requireTeamMember(userId: string, teamId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
