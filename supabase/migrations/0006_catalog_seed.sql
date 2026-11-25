-- ============================================================================
-- HUNTER SYSTEM - 0006 QUEST + ACHIEVEMENT CATALOG
-- Deterministic rules only. No AI, no external service.
-- ============================================================================

insert into public.quest_templates
  (code, category, difficulty, title, description, metric, target_value, reward_xp, recurrence, sort_order)
values
  ('daily_focus_25', 'daily', 'easy', 'Opening Move',
   'Complete a focus session of at least 25 credited minutes.',
   'max_session_minutes_day', 25, 15, 'daily', 10),

  ('daily_hour', 'daily', 'normal', 'One Hour Forged',
   'Accumulate 60 credited minutes today.',
   'study_minutes_day', 60, 25, 'daily', 20),

  ('daily_multi_subject', 'daily', 'normal', 'Split Focus',
   'Study two different subjects today.',
   'distinct_subjects_day', 2, 20, 'daily', 30),

  ('daily_revision', 'daily', 'hard', 'Memory Audit',
   'Log one revision session today.',
   'revision_sessions_day', 1, 20, 'daily', 40),

  ('weekly_ten_hours', 'weekly', 'elite', 'Ten Hour Raid',
   'Accumulate 600 credited minutes this week.',
   'study_minutes_week', 600, 250, 'weekly', 50),

  ('weekly_five_sessions', 'weekly', 'normal', 'Five Gates Cleared',
   'Complete five focus sessions this week.',
   'sessions_week', 5, 100, 'weekly', 60),

  ('weekly_revision', 'weekly', 'hard', 'Recall Protocol',
   'Revise five topics this week.',
   'revision_topics_week', 5, 120, 'weekly', 70),

  ('weekly_subjects', 'weekly', 'normal', 'Field Coverage',
   'Study three different subjects this week.',
   'distinct_subjects_week', 3, 100, 'weekly', 80),

  ('special_first_100', 'special', 'easy', 'First Hundred',
   'Earn your first 100 lifetime XP.',
   'xp_total', 100, 50, 'once', 90),

  ('special_ten_sessions', 'special', 'normal', 'Ten Gates',
   'Complete your first 10 focus sessions.',
   'sessions_total', 10, 100, 'once', 100),

  ('special_seven_days', 'special', 'hard', 'Seven Sunrises',
   'Study on 7 separate days.',
   'distinct_days', 7, 200, 'once', 110),

  ('special_level_10', 'special', 'hard', 'Double Digits',
   'Reach Hunter Level 10.',
   'level', 10, 250, 'once', 120),

  ('special_thousand_xp', 'special', 'elite', 'Thousand Experience',
   'Reach 1,000 lifetime XP.',
   'xp_total', 1000, 150, 'once', 130)
on conflict (code) do nothing;

insert into public.achievements
  (code, name, description, icon, metric, target_value, rarity, reward_xp, sort_order)
values
  ('first_awakening', 'First Awakening', 'Complete your first study session.',
   'sparkles', 'sessions_total', 1, 'common', 10, 10),

  ('early_grinder', 'Early Grinder', 'Complete a session that begins before 06:00.',
   'sunrise', 'early_sessions', 1, 'rare', 25, 20),

  ('century_club', 'Century Club', 'Earn 100 lifetime XP.',
   'medal', 'xp_total', 100, 'common', 0, 30),

  ('level_10', 'Hunter Level 10', 'Reach Level 10.',
   'trending-up', 'level', 10, 'rare', 0, 40),

  ('consistency', 'Consistency', 'Study on 7 separate days.',
   'calendar-check', 'distinct_days', 7, 'rare', 50, 50),

  ('night_owl', 'Night Raid', 'Complete 5 sessions that begin after 23:00.',
   'moon', 'night_sessions', 5, 'rare', 40, 60),

  ('centurion', 'Centurion', 'Complete 100 study sessions.',
   'swords', 'sessions_total', 100, 'epic', 100, 70),

  ('marathon', 'Marathon Mind', 'Complete a single session of 120 credited minutes.',
   'timer', 'max_session_minutes_total', 120, 'epic', 60, 80),

  ('streak_7', 'Seven Day Chain', 'Hold a 7 day study streak.',
   'flame', 'current_streak', 7, 'epic', 75, 90),

  ('streak_30', 'Unbroken Month', 'Hold a 30 day study streak.',
   'shield', 'current_streak', 30, 'legendary', 200, 100),

  ('thousand_experience', 'Thousand Experience', 'Reach 1,000 lifetime XP.',
   'zap', 'xp_total', 1000, 'epic', 50, 110),

  ('elite_hunter', 'Elite Hunter', 'Reach A-Rank.',
   'shield-check', 'rank_index', 5, 'epic', 100, 120),

  ('shadow_legend', 'Shadow Legend', 'Reach S-Rank.',
   'crown', 'rank_index', 6, 'legendary', 250, 130),

  ('quest_master', 'Quest Master', 'Complete 25 quests.',
   'scroll-text', 'quests_completed', 25, 'epic', 80, 140),

  ('deep_work', 'Deep Work', 'Accumulate 100 hours of credited study.',
   'hourglass', 'study_minutes_total', 6000, 'legendary', 300, 150)
on conflict (code) do nothing;
