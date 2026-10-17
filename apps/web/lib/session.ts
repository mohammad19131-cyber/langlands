import { createServerSupabase } from "./supabase/server";
import { getPublicSupabaseConfig } from "./env";

export type SessionState =
  | { kind: "not_configured" }
  | { kind: "anonymous" }
  | { kind: "signed_in"; email: string | null; userId: string };

export async function getSessionState(): Promise<SessionState> {
  const publicConfig = getPublicSupabaseConfig();
  if (!publicConfig.configured) return { kind: "not_configured" };
  const supabase = await createServerSupabase();
  if (!supabase) return { kind: "not_configured" };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { kind: "anonymous" };
  return {
    kind: "signed_in",
    email: data.user.email ?? null,
    userId: data.user.id,
  };
}
