import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import type { Profile } from "./types";

export interface SessionContext {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
}

/**
 * Memoised per request: many components need the hunter, but only one lookup
 * should happen. Always re-read the profile inside Server Actions (they need
 * fresh values after a mutation) using requireHunterUncached().
 */
export const getSessionUser = cache(async () => {
  if (!isSupabaseConfigured) return { supabase: null, user: null, profile: null };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, hunter_id, username, display_name, avatar_url, bio, timezone, is_public, show_on_leaderboard, xp_total, level, rank, total_study_seconds, sessions_completed, quests_completed, achievements_count, current_streak, longest_streak, last_study_date, daily_goal_minutes, role, awakened_at, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: (profile as Profile | null) ?? null };
});

/** For pages: redirect to /login when there is no hunter. */
export async function requireHunter(): Promise<SessionContext> {
  const { supabase, user, profile } = await getSessionUser();

  if (!supabase) {
    throw new Error("The System is not configured. Add Supabase credentials to .env.local.");
  }
  if (!user) redirect("/login");

  if (!profile) {
    // The signup trigger owns profile creation; if it is missing the account
    // row exists without a Hunter, so send the visitor somewhere sensible.
    redirect("/login?error=profile_missing");
  }

  return { supabase, user, profile };
}

/** For Server Actions: never cached, always authoritative. */
export async function requireHunterAction(): Promise<SessionContext> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("NOT_AUTHENTICATED");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, hunter_id, username, display_name, avatar_url, bio, timezone, is_public, show_on_leaderboard, xp_total, level, rank, total_study_seconds, sessions_completed, quests_completed, achievements_count, current_streak, longest_streak, last_study_date, daily_goal_minutes, role, awakened_at, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) throw new Error("PROFILE_MISSING");

  return { supabase, user, profile: profile as Profile };
}

/** Optional auth for mixed pages (landing, leaderboard, public profiles). */
export async function getOptionalHunter(): Promise<{ user: User | null; profile: Profile | null }> {
  const { user, profile } = await getSessionUser();
  return { user, profile };
}
