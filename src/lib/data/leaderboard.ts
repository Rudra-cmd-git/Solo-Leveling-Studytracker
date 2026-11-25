import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { LeaderboardRow, LeaderboardStanding, PublicHunter } from "@/lib/types";

export type LeaderboardPeriod = "all" | "week" | "month";

export const PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
  all: "All Time",
  week: "This Week",
  month: "This Month",
};

export function parsePeriod(value: string | undefined | null): LeaderboardPeriod {
  if (value === "week" || value === "month") return value;
  return "all";
}

export interface LeaderboardPage {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function getLeaderboard(options: {
  period: LeaderboardPeriod;
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<LeaderboardPage> {
  const supabase = await createServerSupabase();
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const search = options.search?.trim() ? options.search.trim() : null;

  const [rowsResult, sizeResult] = await Promise.all([
    supabase.rpc("leaderboard", {
      p_period: options.period,
      p_limit: pageSize,
      p_offset: offset,
      p_search: search,
    }),
    supabase.rpc("leaderboard_size", { p_period: options.period, p_search: search }),
  ]);

  if (rowsResult.error) throw new Error(`Leaderboard unavailable: ${rowsResult.error.message}`);

  const total = sizeResult.error ? 0 : Number(sizeResult.data ?? 0);
  const rows = (rowsResult.data ?? []) as LeaderboardRow[];

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getStanding(period: LeaderboardPeriod): Promise<LeaderboardStanding | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("my_leaderboard_standing", { p_period: period });
  if (error || !data) return null;
  return data as LeaderboardStanding;
}

export async function getPublicHunter(username: string): Promise<PublicHunter | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("public_hunter_profile", { p_username: username });
  if (error) return null;
  return (data as PublicHunter | null) ?? null;
}
