/** Database row shapes shared by server components, actions and client UI. */

export type RankCode = "F" | "E" | "D" | "C" | "B" | "A" | "S";
export type SessionStatus = "active" | "paused" | "completed" | "cancelled";
export type TopicStatus = "not_started" | "learning" | "revised" | "mastered";
export type QuestCategory = "daily" | "weekly" | "special";
export type QuestDifficulty = "easy" | "normal" | "hard" | "elite";
export type QuestStatus = "active" | "completed" | "expired";
export type NotificationType =
  | "session"
  | "xp"
  | "level"
  | "rank"
  | "quest"
  | "achievement"
  | "system"
  | "report";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface Profile {
  id: string;
  hunter_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  is_public: boolean;
  show_on_leaderboard: boolean;
  xp_total: number;
  level: number;
  rank: RankCode;
  total_study_seconds: number;
  sessions_completed: number;
  quests_completed: number;
  achievements_count: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  daily_goal_minutes: number;
  role: "hunter" | "moderator" | "admin";
  awakened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  user_id: string;
  title: string;
  color: string;
  icon: string | null;
  target_minutes_per_week: number | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  user_id: string;
  subject_id: string;
  title: string;
  status: TopicStatus;
  revision_count: number;
  last_revised_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  subject_id: string | null;
  topic_id: string | null;
  client_token: string;
  planned_seconds: number;
  is_revision: boolean;
  note: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  duration_seconds: number | null;
  credited_minutes: number | null;
  xp_awarded: number;
  created_at: string;
}

export interface Quest {
  id: string;
  user_id: string;
  template_code: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  metric: string;
  target_value: number;
  progress_value: number;
  reward_xp: number;
  period_key: string;
  starts_at: string;
  ends_at: string;
  status: QuestStatus;
  completed_at: string | null;
  created_at: string;
}

export interface AchievementDefinition {
  code: string;
  name: string;
  description: string;
  icon: string;
  metric: string;
  target_value: number;
  rarity: Rarity;
  reward_xp: number;
  sort_order: number;
}

export interface UnlockedAchievement extends AchievementDefinition {
  unlocked_at: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface LeaderboardRow {
  rank_position: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  hunter_rank: RankCode;
  level: number;
  period_xp: number;
  is_me: boolean;
}

export interface LeaderboardStanding {
  listed: boolean;
  position: number | null;
  period_xp: number | null;
  total: number;
}

/** Payload returned by complete_study_session(). */
export interface CompletedQuestEvent {
  id: string;
  title: string;
  category: QuestCategory;
  reward_xp: number;
}

export interface UnlockedAchievementEvent {
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  reward_xp: number;
}

export interface SessionCompletion {
  already_completed: boolean;
  session: StudySession;
  xp_awarded: number;
  xp_intent?: number;
  capped?: boolean;
  credited_minutes: number;
  credited_seconds: number;
  voided?: boolean;
  level: number;
  level_before?: number;
  level_up?: boolean;
  rank: RankCode;
  rank_before?: RankCode;
  rank_up?: boolean;
  streak: number;
  completed_quests: CompletedQuestEvent[];
  unlocked_achievements: UnlockedAchievementEvent[];
}

export interface QuestRefreshResult {
  completed_quests: CompletedQuestEvent[];
  unlocked_achievements: UnlockedAchievementEvent[];
}

export interface PublicHunter {
  id: string;
  hunter_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  rank: RankCode;
  level: number;
  xp_total: number;
  total_study_seconds: number;
  sessions_completed: number;
  quests_completed: number;
  achievements_count: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  created_at: string;
  on_leaderboard: boolean;
  position: number | null;
  weekly_sessions: number;
  weekly_minutes: number;
  lifetime_sessions: number;
  lifetime_minutes: number;
  achievements: Array<{
    code: string;
    name: string;
    description: string;
    icon: string;
    rarity: Rarity;
    unlocked_at: string;
  }>;
}

/** Shapes used by the analytics charts. */
export interface DailyPoint {
  date: string;
  minutes: number;
  xp: number;
}

export interface SubjectShare {
  subject: string;
  minutes: number;
  color: string;
}

/* ---------------------------------------------------------------- social -- */

export type Relationship = "self" | "friend" | "incoming" | "outgoing" | "none";

export interface FriendRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  hunter_rank: RankCode;
  level: number;
  xp_total: number;
  current_streak: number;
  sessions_completed: number;
  friends_since: string;
}

export interface FriendRequestRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  hunter_rank: RankCode;
  level: number;
  xp_total: number;
  requested_at: string;
}

export interface FriendRequests {
  incoming: FriendRequestRow[];
  outgoing: FriendRequestRow[];
}

export interface HunterSearchRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  hunter_rank: RankCode;
  level: number;
  xp_total: number;
  relationship: Relationship;
}

/* ---------------------------------------------------------------- guilds -- */

export type GuildRole = "leader" | "officer" | "member";

export interface GuildRow {
  rank_position: number;
  guild_id: string;
  name: string;
  slug: string;
  tag: string;
  emblem_color: string;
  member_count: number;
  period_xp: number;
  is_my_guild: boolean;
}

export interface GuildMemberRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  hunter_rank: RankCode;
  level: number;
  xp_total: number;
  guild_role: GuildRole;
  joined_at: string;
  is_me: boolean;
}

export interface GuildDetail {
  id: string;
  name: string;
  slug: string;
  tag: string;
  description: string | null;
  emblem_color: string;
  owner_id: string;
  is_open: boolean;
  member_limit: number;
  created_at: string;
  member_count: number;
  xp_total: number;
  study_seconds: number;
  sessions: number;
  weekly_xp: number;
  weekly_position: number | null;
  members: Array<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    rank: RankCode;
    level: number;
    xp_total: number;
    role: GuildRole;
    joined_at: string;
  }>;
  my_role: GuildRole | null;
}

/* ---------------------------------------------------------------- seasons -- */

export type SeasonTheme = "azure" | "violet" | "gold" | "ember";

export interface SeasonInfo {
  code: string;
  name: string;
  theme: SeasonTheme;
  starts_at: string;
  ends_at: string;
  days_left: number;
}

export interface SeasonStanding {
  listed: boolean;
  season_xp: number;
  position: number | null;
  total: number;
  gap_to_above: number;
}

export interface PreviousSeason {
  code: string;
  name: string;
  theme: SeasonTheme;
  ends_at: string;
  winners: Array<{
    rank_position: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    hunter_rank: RankCode;
    level: number;
    period_xp: number;
  }>;
}

/* ------------------------------------------------------------------ admin -- */

export type HunterRole = "hunter" | "moderator" | "admin";

export interface AdminOverview {
  hunters: number;
  new_last_7d: number;
  active_today: number;
  sessions: number;
  minutes: number;
  xp_awarded: number;
  guilds: number;
  friendships: number;
  staff: number;
}

export interface AdminHunterRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  hunter_rank: RankCode;
  level: number;
  xp_total: number;
  sessions: number;
  current_streak: number;
  hunter_role: HunterRole;
  is_public: boolean;
  last_study_date: string | null;
  created_at: string;
}
