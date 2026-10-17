/**
 * Public vs server env. Service-role keys must never appear here as NEXT_PUBLIC_*.
 */
export type PublicSupabaseConfig = {
  configured: boolean;
  url: string | null;
  anonKey: string | null;
};

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  return {
    configured: Boolean(url && anonKey),
    url,
    anonKey,
  };
}

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
