import { isSystemAuthEmail } from "./display-identity";
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
  const rawEmail = data.user.email ?? null;
  return {
    kind: "signed_in",
    // Strip opaque Auth identities from any session surface.
    email: isSystemAuthEmail(rawEmail) ? null : rawEmail,
    userId: data.user.id,
  };
}
