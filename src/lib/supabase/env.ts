/**
 * Supabase public configuration.
 *
 * Only the publishable (anon) key belongs in the browser. Row Level Security
 * and SECURITY DEFINER functions enforce every permission, so the anon key is
 * not a secret — but the service-role key is, and is never read here.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

/**
 * Values copied straight out of .env.example. Treating these as "configured"
 * would make the app issue requests to a host that cannot exist, so they are
 * rejected exactly like empty values.
 */
const PLACEHOLDER = /YOUR_PROJECT_REF|your-project|placeholder|changeme|<.*>/i;

function looksReal(value: string): boolean {
  return value.length >= 12 && !PLACEHOLDER.test(value);
}

export const isSupabaseConfigured =
  looksReal(SUPABASE_URL) && SUPABASE_URL.startsWith("https://") && looksReal(SUPABASE_ANON_KEY);

export function assertSupabaseConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      "The System is not configured yet: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. " +
        "Values still containing YOUR_PROJECT_REF are the .env.example placeholders, not real credentials.",
    );
  }
}
