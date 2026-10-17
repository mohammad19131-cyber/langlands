import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server runtime only. Never import from a Client Component.
 * Phase 0 does not call this; processors in Phase 3 will.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Service role must not be exposed as NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!url || !key) {
    throw new Error(
      "Service role client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
