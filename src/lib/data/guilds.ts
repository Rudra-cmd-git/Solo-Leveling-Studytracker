import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { GuildDetail, GuildRow } from "@/lib/types";
import type { LeaderboardPeriod } from "@/lib/data/leaderboard";

export async function getGuildBoard(period: LeaderboardPeriod, search?: string): Promise<GuildRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("guild_leaderboard", {
    p_period: period,
    p_limit: 50,
    p_search: search?.trim() ? search.trim() : null,
  });
  if (error) return [];
  return (data ?? []) as GuildRow[];
}

export async function getMyGuildSlug(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("my_guild");
  if (error || !data) return null;
  return data as unknown as string;
}

export async function getGuildDetail(slug: string): Promise<GuildDetail | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("guild_detail", { p_slug: slug });
  if (error) return null;
  return (data as GuildDetail | null) ?? null;
}
