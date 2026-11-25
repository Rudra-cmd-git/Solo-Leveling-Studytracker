import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  AchievementDefinition,
  NotificationRow,
  Profile,
  Quest,
  RankCode,
  StudySession,
  Subject,
  Topic,
  UnlockedAchievement,
} from "@/lib/types";

/** Unwrap a PostgREST result, turning failures into readable errors. */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return (result.data ?? ([] as unknown)) as T;
}

async function client(): Promise<SupabaseClient> {
  return createServerSupabase();
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export interface HunterOverview {
  profile: Profile;
  level: { level: number; into: number; needed: number; percent: number; next_at: number };
  rank: { rank: RankCode; next: RankCode | null; remaining: number; percent: number };
  today: { minutes: number; sessions: number; xp: number; goal: number };
  week: { minutes: number; sessions: number; xp: number; subjects: number };
  month: { minutes: number; xp: number };
  totals: { minutes: number; seconds: number; sessions: number; xp: number; quests: number; achievements: number };
  streak: { current: number; longest: number; last_date: string | null };
  quests: { active: number; completed_today: number; completed_total: number };
  unread_notifications: number;
  active_session: StudySession | null;
  config: {
    xp_per_minute: number;
    daily_xp_cap: number;
    min_session_seconds: number;
    max_session_seconds: number;
    max_heartbeat_gap: number;
  };
}

export async function getOverview(): Promise<HunterOverview> {
  const supabase = await client();
  const result = await supabase.rpc("hunter_overview");
  if (result.error) throw new Error(`Could not load your status: ${result.error.message}`);
  if (!result.data) throw new Error("Your Hunter profile could not be found.");
  return result.data as HunterOverview;
}

// ---------------------------------------------------------------------------
// Series and breakdowns
// ---------------------------------------------------------------------------
export interface DailyPointRow {
  day: string;
  minutes: number;
  sessions: number;
  xp: number;
}

export async function getDailySeries(days = 30): Promise<DailyPointRow[]> {
  const supabase = await client();
  return unwrap<DailyPointRow[]>(await supabase.rpc("hunter_daily_series", { p_days: days }), "Daily series");
}

export interface SubjectBreakdownRow {
  subject_id: string | null;
  title: string;
  color: string;
  minutes: number;
  sessions: number;
}

export async function getSubjectBreakdown(days = 30): Promise<SubjectBreakdownRow[]> {
  const supabase = await client();
  return unwrap<SubjectBreakdownRow[]>(
    await supabase.rpc("hunter_subject_breakdown", { p_days: days }),
    "Subject breakdown",
  );
}

export interface HistoryRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  credited_minutes: number | null;
  xp_awarded: number;
  status: StudySession["status"];
  is_revision: boolean;
  note: string | null;
  subject_title: string | null;
  subject_color: string | null;
  topic_title: string | null;
}

export async function getHistory(limit = 20, offset = 0): Promise<HistoryRow[]> {
  const supabase = await client();
  return unwrap<HistoryRow[]>(
    await supabase.rpc("hunter_history", { p_limit: limit, p_offset: offset }),
    "Session history",
  );
}

export async function getHistoryCount(): Promise<number> {
  const supabase = await client();
  const result = await supabase.rpc("hunter_history_count");
  if (result.error) throw new Error(result.error.message);
  return Number(result.data ?? 0);
}

export interface SubjectSummaryRow {
  subject_id: string;
  title: string;
  color: string;
  archived: boolean;
  topics_total: number;
  topics_revised: number;
  minutes_total: number;
  minutes_week: number;
  last_studied_at: string | null;
}

export async function getSubjectSummary(): Promise<SubjectSummaryRow[]> {
  const supabase = await client();
  return unwrap<SubjectSummaryRow[]>(await supabase.rpc("subject_summary"), "Subjects");
}

// ---------------------------------------------------------------------------
// Subjects and topics
// ---------------------------------------------------------------------------
export interface SubjectWithTopics extends Subject {
  topics: Topic[];
}

export async function getSubjectsWithTopics(): Promise<SubjectWithTopics[]> {
  const supabase = await client();
  const [subjects, topics] = await Promise.all([
    supabase.from("subjects").select("*").order("created_at", { ascending: true }),
    supabase.from("topics").select("*").order("created_at", { ascending: true }),
  ]);

  const subjectRows = unwrap<Subject[]>(subjects, "Subjects");
  const topicRows = unwrap<Topic[]>(topics, "Topics");

  return subjectRows.map((subject) => ({
    ...subject,
    topics: topicRows.filter((topic) => topic.subject_id === subject.id),
  }));
}

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await client();
  return unwrap<Subject[]>(
    await supabase.from("subjects").select("*").eq("archived", false).order("created_at", { ascending: true }),
    "Subjects",
  );
}

export async function getTopicsForSubject(subjectId: string): Promise<Topic[]> {
  const supabase = await client();
  return unwrap<Topic[]>(
    await supabase.from("topics").select("*").eq("subject_id", subjectId).order("created_at", { ascending: true }),
    "Topics",
  );
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------
export async function getQuests(): Promise<Quest[]> {
  const supabase = await client();
  return unwrap<Quest[]>(
    await supabase
      .from("quests")
      .select("*")
      .order("status", { ascending: true })
      .order("category", { ascending: true })
      .order("created_at", { ascending: true }),
    "Quests",
  );
}

/** Materialise today's rotating quests and evaluate progress (idempotent). */
export async function syncQuests(): Promise<{ completed: number; unlocked: number }> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("refresh_quests");
  if (error) throw new Error(`Quest sync failed: ${error.message}`);
  const payload = (data ?? {}) as {
    completed_quests?: unknown[];
    unlocked_achievements?: unknown[];
  };
  return {
    completed: payload.completed_quests?.length ?? 0,
    unlocked: payload.unlocked_achievements?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export interface AchievementRow extends AchievementDefinition {
  unlocked_at: string | null;
}

export async function getAchievements(): Promise<AchievementRow[]> {
  const supabase = await client();
  const [definitions, unlocked] = await Promise.all([
    supabase.from("achievements").select("*").order("sort_order", { ascending: true }),
    supabase.from("user_achievements").select("achievement_code, unlocked_at"),
  ]);

  const defs = unwrap<AchievementDefinition[]>(definitions, "Achievements");
  const owned = unwrap<Array<{ achievement_code: string; unlocked_at: string }>>(unlocked, "Unlocked achievements");

  const byCode = new Map(owned.map((row) => [row.achievement_code, row.unlocked_at]));
  return defs.map((definition) => ({
    ...definition,
    unlocked_at: byCode.get(definition.code) ?? null,
  }));
}

export async function getPublicAchievementCatalog(): Promise<AchievementDefinition[]> {
  const supabase = await client();
  return unwrap<AchievementDefinition[]>(
    await supabase.from("achievements").select("*").order("sort_order", { ascending: true }),
    "Achievements",
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function getNotifications(limit = 20): Promise<NotificationRow[]> {
  const supabase = await client();
  return unwrap<NotificationRow[]>(
    await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    "Notifications",
  );
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await client();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) return 0;
  return count ?? 0;
}

export type { UnlockedAchievement };
