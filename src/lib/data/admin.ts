import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { AdminHunterRow, AdminOverview } from "@/lib/types";

export async function isStaff(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("is_staff");
  if (error) return false;
  return data === true;
}

export async function getAdminOverview(): Promise<AdminOverview | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error || !data) return null;
  return data as AdminOverview;
}

export async function getAdminHunters(search: string | null, limit = 25): Promise<AdminHunterRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_hunters", { p_limit: limit, p_search: search });
  if (error) return [];
  return (data ?? []) as AdminHunterRow[];
}
