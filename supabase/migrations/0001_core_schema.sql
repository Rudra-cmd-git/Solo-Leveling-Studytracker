-- ============================================================================
-- HUNTER SYSTEM - 0001 CORE SCHEMA
-- ----------------------------------------------------------------------------
-- Applied on a fresh Supabase project (Postgres 15+). Assumes the platform
-- already provides: schema `auth`, table `auth.users`, roles `anon`,
-- `authenticated`, `service_role`, and function `auth.uid()`.
-- Use a locally installed Postgres for tests: see supabase/tests/README.md
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enumerations
-- ----------------------------------------------------------------------------
create type public.session_status as enum ('active', 'paused', 'completed', 'cancelled');
create type public.topic_status as enum ('not_started', 'learning', 'revised', 'mastered');
create type public.quest_category as enum ('daily', 'weekly', 'special');
create type public.quest_difficulty as enum ('easy', 'normal', 'hard', 'elite');
create type public.quest_status as enum ('active', 'completed', 'expired');
create type public.xp_source as enum ('session', 'quest', 'achievement', 'bonus');
create type public.notification_type as enum ('session', 'xp', 'level', 'rank', 'quest', 'achievement', 'system', 'report');
create type public.hunter_role as enum ('hunter', 'moderator', 'admin');

-- ----------------------------------------------------------------------------
-- Tunable progression configuration (single row, server owned)
-- ----------------------------------------------------------------------------
create table public.progression_config (
  id                  integer primary key default 1 check (id = 1),
  xp_per_minute       integer not null default 1 check (xp_per_minute between 0 and 10),
  base_level_xp       integer not null default 100 check (base_level_xp > 0),
  level_growth_xp     integer not null default 25 check (level_growth_xp >= 0),
  daily_xp_cap        integer not null default 720 check (daily_xp_cap > 0),
  min_session_seconds integer not null default 60 check (min_session_seconds >= 0),
  max_session_seconds integer not null default 21600 check (max_session_seconds > 0),
  max_heartbeat_gap   integer not null default 150 check (max_heartbeat_gap >= 30),
  updated_at          timestamptz not null default now()
);

insert into public.progression_config (id) values (1);

-- Rank ladder. Ordering is explicit so the ladder can be rebalanced later
-- without touching code.
create table public.rank_thresholds (
  rank        text primary key check (rank in ('F','E','D','C','B','A','S')),
  min_xp      bigint not null unique check (min_xp >= 0),
  order_index integer not null unique check (order_index >= 0)
);

insert into public.rank_thresholds (rank, min_xp, order_index) values
  ('F', 0, 0),
  ('E', 500, 1),
  ('D', 1500, 2),
  ('C', 3000, 3),
  ('B', 6000, 4),
  ('A', 10000, 5),
  ('S', 15000, 6);

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  hunter_id            text not null unique
                         default ('H-' || upper(encode(gen_random_bytes(4), 'hex'))),
  username             text not null,
  display_name         text,
  avatar_url           text check (avatar_url is null or char_length(avatar_url) <= 512),
  bio                  text check (bio is null or char_length(bio) <= 500),
  timezone             text not null default 'UTC',
  is_public            boolean not null default true,
  show_on_leaderboard  boolean not null default true,
  -- Progression state. Server-owned: never writable by the client.
  xp_total             bigint not null default 0 check (xp_total >= 0),
  level                integer not null default 1 check (level >= 1),
  rank                 text not null default 'F' check (rank in ('F','E','D','C','B','A','S')),
  -- Denormalised aggregates, maintained by triggers.
  total_study_seconds  bigint not null default 0 check (total_study_seconds >= 0),
  sessions_completed   integer not null default 0 check (sessions_completed >= 0),
  quests_completed     integer not null default 0 check (quests_completed >= 0),
  achievements_count   integer not null default 0 check (achievements_count >= 0),
  current_streak       integer not null default 0 check (current_streak >= 0),
  longest_streak       integer not null default 0 check (longest_streak >= 0),
  last_study_date      date,
  daily_goal_minutes   integer not null default 60
                         check (daily_goal_minutes between 15 and 1440),
  role                 public.hunter_role not null default 'hunter',
  awakened_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

create unique index profiles_username_lower_idx on public.profiles (lower(username));
create index profiles_leaderboard_idx
  on public.profiles (xp_total desc, created_at asc)
  where is_public and show_on_leaderboard;

-- ----------------------------------------------------------------------------
-- Subjects / topics
-- ----------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 60),
  color       text not null default '#38bdf8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text,
  target_minutes_per_week integer check (target_minutes_per_week is null or target_minutes_per_week between 0 and 10080),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index subjects_user_idx on public.subjects (user_id, archived);
create unique index subjects_user_title_idx on public.subjects (user_id, lower(btrim(title)));

create table public.topics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  status       public.topic_status not null default 'not_started',
  revision_count integer not null default 0 check (revision_count >= 0),
  last_revised_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index topics_subject_idx on public.topics (subject_id, status);
create index topics_user_idx on public.topics (user_id);
create unique index topics_subject_title_idx on public.topics (subject_id, lower(btrim(title)));

-- ----------------------------------------------------------------------------
-- Study sessions
-- ----------------------------------------------------------------------------
create table public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete set null,
  topic_id         uuid references public.topics (id) on delete set null,
  client_token     uuid not null,
  planned_seconds  integer not null check (planned_seconds between 60 and 43200),
  is_revision      boolean not null default false,
  note             text check (note is null or char_length(note) <= 280),
  status           public.session_status not null default 'active',
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  paused_seconds   integer not null default 0 check (paused_seconds >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  credited_minutes integer check (credited_minutes is null or credited_minutes >= 0),
  xp_awarded       integer not null default 0 check (xp_awarded >= 0),
  created_at       timestamptz not null default now(),
  constraint study_sessions_token_unique unique (user_id, client_token),
  constraint study_sessions_time_order check (ended_at is null or ended_at >= started_at)
);

create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at desc);
create index study_sessions_user_status_idx on public.study_sessions (user_id, status);
create index study_sessions_completed_idx
  on public.study_sessions (user_id, started_at desc)
  where status = 'completed';
-- One live session per hunter at a time.
create unique index study_sessions_one_active_idx
  on public.study_sessions (user_id)
  where status in ('active', 'paused');

create table public.study_session_pauses (
  id          bigserial primary key,
  session_id  uuid not null references public.study_sessions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  paused_at   timestamptz not null default now(),
  resumed_at  timestamptz,
  constraint pauses_order check (resumed_at is null or resumed_at >= paused_at)
);

create index pauses_session_idx on public.study_session_pauses (session_id, paused_at);
create unique index pauses_one_open_idx
  on public.study_session_pauses (session_id)
  where resumed_at is null;

-- Server-stamped heartbeats. Credited time is derived from these, so a client
-- that simply leaves the tab open is not rewarded.
create table public.study_session_heartbeats (
  id         bigserial primary key,
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  seen_at    timestamptz not null default now()
);

create index heartbeats_session_idx on public.study_session_heartbeats (session_id, seen_at);

-- ----------------------------------------------------------------------------
-- XP ledger — the single source of truth for earned experience
-- ----------------------------------------------------------------------------
create table public.xp_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  source_type public.xp_source not null,
  source_id   uuid,
  amount      integer not null check (amount > 0),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- A given source can only ever pay out once (sessions, quests, achievements).
create unique index xp_transactions_source_unique
  on public.xp_transactions (user_id, source_type, source_id)
  where source_id is not null;

create index xp_transactions_user_created_idx on public.xp_transactions (user_id, created_at desc);
create index xp_transactions_period_idx on public.xp_transactions (created_at desc, user_id);

-- ----------------------------------------------------------------------------
-- Quests
-- ----------------------------------------------------------------------------
create table public.quest_templates (
  code         text primary key,
  category     public.quest_category not null,
  difficulty   public.quest_difficulty not null,
  title        text not null,
  description  text not null,
  metric       text not null,
  target_value numeric not null check (target_value > 0),
  reward_xp    integer not null check (reward_xp > 0),
  recurrence   text not null check (recurrence in ('daily', 'weekly', 'once')),
  sort_order   integer not null default 0
);

create table public.quests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  template_code  text not null references public.quest_templates (code) on delete cascade,
  title          text not null,
  description    text not null,
  category       public.quest_category not null,
  difficulty     public.quest_difficulty not null,
  metric         text not null,
  target_value   numeric not null,
  progress_value numeric not null default 0,
  reward_xp      integer not null,
  period_key     text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         public.quest_status not null default 'active',
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  constraint quests_unique_period unique (user_id, template_code, period_key),
  constraint quests_window check (ends_at > starts_at)
);

create index quests_user_status_idx on public.quests (user_id, status, ends_at desc);
create index quests_user_category_idx on public.quests (user_id, category, status);

-- ----------------------------------------------------------------------------
-- Achievements
-- ----------------------------------------------------------------------------
create table public.achievements (
  code         text primary key,
  name         text not null,
  description  text not null,
  icon         text not null,
  metric       text not null,
  target_value numeric not null,
  rarity       text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  reward_xp    integer not null default 0 check (reward_xp >= 0),
  sort_order   integer not null default 0
);

create table public.user_achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_code text not null references public.achievements (code) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  unique (user_id, achievement_code)
);

create index user_achievements_user_idx on public.user_achievements (user_id, unlocked_at desc);

-- ----------------------------------------------------------------------------
-- Notifications (in-app only)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type       public.notification_type not null default 'system',
  title      text not null,
  message    text not null,
  payload    jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where not is_read;

-- ----------------------------------------------------------------------------
-- Abuse protection
-- ----------------------------------------------------------------------------
create table public.rate_limit_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_lookup_idx on public.rate_limit_events (user_id, action, created_at desc);
