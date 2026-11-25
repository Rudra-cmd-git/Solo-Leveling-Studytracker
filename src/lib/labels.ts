import type { QuestCategory, QuestDifficulty, SessionStatus, TopicStatus } from "@/lib/types";

export const TOPIC_STATUS_LABEL: Record<TopicStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  revised: "Revised",
  mastered: "Mastered",
};

export const QUEST_CATEGORY_LABEL: Record<QuestCategory, string> = {
  daily: "Daily",
  weekly: "Weekly",
  special: "Special",
};

export const QUEST_DIFFICULTY_LABEL: Record<QuestDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  elite: "Elite",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RARITY_TONE: Record<string, { text: string; border: string; bg: string }> = {
  common: { text: "text-muted", border: "border-line/60", bg: "bg-white/[0.03]" },
  rare: { text: "text-cyan", border: "border-cyan/30", bg: "bg-cyan/8" },
  epic: { text: "text-violet", border: "border-violet/35", bg: "bg-violet/10" },
  legendary: { text: "text-gold", border: "border-gold/40", bg: "bg-gold/10" },
};

export const QUEST_METRIC_LABEL: Record<string, string> = {
  daily_minutes: "minutes today",
  daily_sessions: "sessions today",
  week_minutes: "minutes this week",
  week_sessions: "sessions this week",
  week_subject_count: "subjects this week",
  week_days: "active days this week",
  lifetime_minutes: "lifetime minutes",
  lifetime_sessions: "lifetime sessions",
  lifetime_quests: "quests completed",
  streak_days: "day streak",
  revision_sessions: "revision sessions",
  morning_sessions: "sessions before noon",
  night_sessions: "sessions after 9pm",
  longest_session: "minute session",
  single_session_minutes: "minute session",
  subject_minutes: "minutes in one subject",
  topic_mastered: "topics mastered",
  level: "level",
  rank_index: "rank",
};
