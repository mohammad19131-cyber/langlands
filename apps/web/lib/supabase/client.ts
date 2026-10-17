"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "../env";

export function createBrowserSupabase() {
  const { configured, url, anonKey } = getPublicSupabaseConfig();
  if (!configured || !url || !anonKey) {
    return null;
  }
  return createBrowserClient(url, anonKey);
}
