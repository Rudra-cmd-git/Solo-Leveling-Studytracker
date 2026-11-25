-- ============================================================================
-- 0012_public_profile_columns.sql - trim what anonymous visitors can read
-- ----------------------------------------------------------------------------
-- Before this migration `grant select on public.profiles to anon` exposed every
-- column of a public profile: timezone, daily goal, last study date, role.
-- RLS limited the *rows* but not the *fields*, so an anonymous scrape of
-- /leaderboard data could recover behavioural details that the leaderboard RPC
-- deliberately omits.
--
-- Anonymous readers now get only the fields a public hunter card is made of.
-- Authenticated users keep the table grant because they read their own row
-- (RLS) and the app selects explicit columns everywhere.
-- ============================================================================

revoke select on public.profiles from anon;

grant select (
  id,
  hunter_id,
  username,
  display_name,
  avatar_url,
  bio,
  level,
  rank,
  xp_total,
  total_study_seconds,
  sessions_completed,
  quests_completed,
  achievements_count,
  current_streak,
  longest_streak,
  awakened_at,
  created_at,
  is_public
) on public.profiles to anon;

comment on table public.profiles is
  'Hunter identity and lifetime totals. Server-managed: xp_total, level, rank, '
  'streaks and counters are only written by SECURITY DEFINER RPCs. Anonymous '
  'readers are limited to the public hunter-card columns (see 0012).';
