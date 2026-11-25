import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { FriendRequests, FriendRow, HunterSearchRow, LeaderboardRow } from "@/lib/types";
import type { LeaderboardPeriod } from "@/lib/data/leaderboard";

/** Everything the roster page needs, read as the signed-in hunter. */
export async function getSocialOverview(): Promise<{
  friends: FriendRow[];
  requests: FriendRequests;
  board: LeaderboardRow[];
}> {
  const supabase = await createServerSupabase();

  const [friendsResult, requestsResult, boardResult] = await Promise.all([
    supabase.rpc("list_friends"),
    supabase.rpc("list_friend_requests"),
    supabase.rpc("friend_leaderboard", { p_period: "week", p_limit: 50 }),
  ]);

  return {
    friends: friendsResult.error ? [] : ((friendsResult.data ?? []) as FriendRow[]),
    requests: requestsResult.error
      ? { incoming: [], outgoing: [] }
      : ((requestsResult.data ?? { incoming: [], outgoing: [] }) as FriendRequests),
    board: boardResult.error ? [] : ((boardResult.data ?? []) as LeaderboardRow[]),
  };
}

export async function getFriendLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("friend_leaderboard", { p_period: period, p_limit: 50 });
  if (error) return [];
  return (data ?? []) as LeaderboardRow[];
}

export async function searchHunters(query: string): Promise<HunterSearchRow[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("search_hunters", { p_query: term, p_limit: 8 });
  if (error) return [];
  return (data ?? []) as HunterSearchRow[];
}
