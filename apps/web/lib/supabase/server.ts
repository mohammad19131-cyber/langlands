import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "../env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createServerSupabase() {
  const { configured, url, anonKey } = getPublicSupabaseConfig();
  if (!configured || !url || !anonKey) {
    return null;
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; middleware will refresh the session.
        }
      },
    },
  });
}
