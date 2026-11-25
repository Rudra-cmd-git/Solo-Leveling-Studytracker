import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { LeaderboardRow, PreviousSeason, SeasonInfo, SeasonStanding } from "@/lib/types";

export async function getCurrentSeason(): Promise<SeasonInfo | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("current_season");
  if (error) return null;
  return (data as SeasonInfo | null) ?? null;
}

export async function getSeasonBoard(code: string | null, limit = 25): Promise<LeaderboardRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("season_leaderboard", { p_code: code, p_limit: limit });
  if (error) return [];
  return (data ?? []) as LeaderboardRow[];
}

export async function getMySeasonStanding(): Promise<SeasonStanding | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("my_season_standing");
  if (error || !data) return null;
  return data as SeasonStanding;
}

export async function getPreviousSeason(): Promise<PreviousSeason | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("previous_season_summary");
  if (error) return null;
  return (data as PreviousSeason | null) ?? null;
}
