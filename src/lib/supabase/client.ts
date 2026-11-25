"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Browser client. Sessions live in cookies so the server can read them, which
 * keeps Server Components and Server Actions authenticated without extra work.
 */
export function createBrowserSupabase(): SupabaseClient {
  assertSupabaseConfigured();
  if (cached) return cached;
  cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
