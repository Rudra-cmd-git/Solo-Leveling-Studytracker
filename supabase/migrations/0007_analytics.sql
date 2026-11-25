-- ============================================================================
-- HUNTER SYSTEM - 0007 ANALYTICS READ MODELS
-- ----------------------------------------------------------------------------
-- Aggregation happens in PostgreSQL so pages never download a hunter's whole
-- history to add numbers up in JavaScript. Every function is scoped to
-- auth.uid() and returns only that hunter's data.
-- ============================================================================

create or replace function public.hunter_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_p         public.profiles;
  v_cfg       public.progression_config;
  v_tz        text;
  v_today     date;
  v_day       timestamptz;
  v_week      timestamptz;
  v_month     timestamptz;
  v_lvl       record;
  v_rank_next text;
  v_rank_need bigint;
  v_rank_span bigint;
  v_rank_min  bigint;
  v_next_min  bigint;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_p from public.profiles where id = v_user;
  if not found then
    return null;
  end if;

  select * into v_cfg from public.progression_config where id = 1;

  v_tz := coalesce(nullif(v_p.timezone, ''), 'UTC');
  begin
    execute 'select (now() at time zone $1)::date' into v_today using v_tz;
    v_day := v_today::timestamp at time zone v_tz;
    v_week := (date_trunc('week', v_today::timestamp)) at time zone v_tz;
    v_month := (date_trunc('month', v_today::timestamp)) at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
    v_day := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    v_week := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
    v_month := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  end;

  select * into v_lvl from public.level_progress(v_p.xp_total);

  select min_xp into v_rank_min from public.rank_thresholds where rank = v_p.rank;
  select t.rank, t.min_xp into v_rank_next, v_next_min
    from public.rank_thresholds t
   where t.order_index = public.rank_index(v_p.rank) + 1;

  v_rank_span := coalesce(v_next_min - v_rank_min, 1);
  v_rank_need := greatest(coalesce(v_next_min - v_p.xp_total, 0), 0);

  return jsonb_build_object(
    'profile', to_jsonb(v_p),
    'level', jsonb_build_object(
      'level', v_lvl.level,
      'into', v_lvl.into_level,
      'needed', v_lvl.needed,
      'percent', v_lvl.percent,
      'next_at', v_lvl.level_xp_next
    ),
    'rank', jsonb_build_object(
      'rank', v_p.rank,
      'next', v_rank_next,
      'remaining', v_rank_need,
      'percent', case
                   when v_rank_next is null then 100
                   else round(((v_p.xp_total - v_rank_min)::numeric / v_rank_span::numeric) * 100, 2)
                 end
    ),
    'today', jsonb_build_object(
      'minutes', (select coalesce(sum(credited_minutes), 0) from public.study_sessions
                   where user_id = v_user and status = 'completed' and started_at >= v_day),
      'sessions', (select count(*) from public.study_sessions
                    where user_id = v_user and status = 'completed' and started_at >= v_day
                      and coalesce(credited_minutes, 0) > 0),
      'xp', (select coalesce(sum(amount), 0) from public.xp_transactions
              where user_id = v_user and created_at >= v_day),
      'goal', v_p.daily_goal_minutes
    ),
    'week', jsonb_build_object(
      'minutes', (select coalesce(sum(credited_minutes), 0) from public.study_sessions
                   where user_id = v_user and status = 'completed' and started_at >= v_week),
      'sessions', (select count(*) from public.study_sessions
                    where user_id = v_user and status = 'completed' and started_at >= v_week
                      and coalesce(credited_minutes, 0) > 0),
      'xp', (select coalesce(sum(amount), 0) from public.xp_transactions
              where user_id = v_user and created_at >= v_week),
      'subjects', (select count(distinct subject_id) from public.study_sessions
                    where user_id = v_user and status = 'completed' and started_at >= v_week
                      and subject_id is not null and coalesce(credited_minutes, 0) > 0)
    ),
    'month', jsonb_build_object(
      'minutes', (select coalesce(sum(credited_minutes), 0) from public.study_sessions
                   where user_id = v_user and status = 'completed' and started_at >= v_month),
      'xp', (select coalesce(sum(amount), 0) from public.xp_transactions
              where user_id = v_user and created_at >= v_month)
    ),
    'totals', jsonb_build_object(
      'minutes', v_p.total_study_seconds / 60,
      'seconds', v_p.total_study_seconds,
      'sessions', v_p.sessions_completed,
      'xp', v_p.xp_total,
      'quests', v_p.quests_completed,
      'achievements', v_p.achievements_count
    ),
    'streak', jsonb_build_object(
      'current', case
                   when v_p.last_study_date is null then 0
                   when v_p.last_study_date >= v_today - 1 then v_p.current_streak
                   else 0
                 end,
      'longest', v_p.longest_streak,
      'last_date', v_p.last_study_date
    ),
    'quests', jsonb_build_object(
      'active', (select count(*) from public.quests
                  where user_id = v_user and status = 'active' and ends_at > now()),
      'completed_today', (select count(*) from public.quests
                           where user_id = v_user and status = 'completed'
                             and completed_at >= v_day),
      'completed_total', (select count(*) from public.quests
                           where user_id = v_user and status = 'completed')
    ),
    'unread_notifications', (select count(*) from public.notifications
                              where user_id = v_user and not is_read),
    'active_session', (
      select to_jsonb(s) from public.study_sessions s
       where s.user_id = v_user and s.status in ('active', 'paused')
       order by s.started_at desc limit 1
    ),
    'config', jsonb_build_object(
      'xp_per_minute', v_cfg.xp_per_minute,
      'daily_xp_cap', v_cfg.daily_xp_cap,
      'min_session_seconds', v_cfg.min_session_seconds,
      'max_session_seconds', v_cfg.max_session_seconds,
      'max_heartbeat_gap', v_cfg.max_heartbeat_gap
    )
  );
end;
$$;

create or replace function public.hunter_daily_series(p_days integer default 30)
returns table (day date, minutes integer, sessions integer, xp integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_tz    text;
  v_start date;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from public.profiles where id = v_user;
  v_tz := coalesce(v_tz, 'UTC');
  v_start := ((now() at time zone v_tz)::date - greatest(least(coalesce(p_days, 30), 365), 1)) + 1;

  return query
  with span as (
    select generate_series(v_start, (now() at time zone v_tz)::date, interval '1 day')::date as d
  ),
  study as (
    select (s.started_at at time zone v_tz)::date as d,
           coalesce(sum(s.credited_minutes), 0)::integer as minutes,
           count(*)::integer as sessions
      from public.study_sessions s
     where s.user_id = v_user
       and s.status = 'completed'
       and coalesce(s.credited_minutes, 0) > 0
       and (s.started_at at time zone v_tz)::date >= v_start
     group by 1
  ),
  xp as (
    select (t.created_at at time zone v_tz)::date as d,
           coalesce(sum(t.amount), 0)::integer as xp
      from public.xp_transactions t
     where t.user_id = v_user
       and (t.created_at at time zone v_tz)::date >= v_start
     group by 1
  )
  select span.d,
         coalesce(study.minutes, 0),
         coalesce(study.sessions, 0),
         coalesce(xp.xp, 0)
    from span
    left join study on study.d = span.d
    left join xp on xp.d = span.d
   order by span.d;
end;
$$;

create or replace function public.hunter_subject_breakdown(p_days integer default 30)
returns table (subject_id uuid, title text, color text, minutes integer, sessions integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_tz    text;
  v_start timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from public.profiles where id = v_user;
  v_tz := coalesce(v_tz, 'UTC');
  v_start := ((now() at time zone v_tz)::date - greatest(least(coalesce(p_days, 30), 365), 1) + 1)
               ::timestamp at time zone v_tz;

  return query
  select sub.id as subject_id,
         coalesce(sub.title, 'Unassigned') as title,
         coalesce(sub.color, '#64748b') as color,
         coalesce(sum(s.credited_minutes), 0)::integer as minutes,
         count(*)::integer as sessions
    from public.study_sessions s
    left join public.subjects sub on sub.id = s.subject_id
   where s.user_id = v_user
     and s.status = 'completed'
     and coalesce(s.credited_minutes, 0) > 0
     and s.started_at >= v_start
   group by sub.id
   order by minutes desc;
end;
$$;

create or replace function public.hunter_history(p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  credited_minutes integer,
  xp_awarded integer,
  status public.session_status,
  is_revision boolean,
  note text,
  subject_title text,
  subject_color text,
  topic_title text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  return query
  select s.id, s.started_at, s.ended_at, s.credited_minutes, s.xp_awarded, s.status,
         s.is_revision, s.note, sub.title, sub.color, t.title
    from public.study_sessions s
    left join public.subjects sub on sub.id = s.subject_id
    left join public.topics t on t.id = s.topic_id
   where s.user_id = v_user
   order by s.started_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.hunter_history_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.study_sessions where user_id = auth.uid();
$$;

-- Subject / topic roll-up used by the subjects page.
create or replace function public.subject_summary()
returns table (
  subject_id uuid,
  title text,
  color text,
  archived boolean,
  topics_total integer,
  topics_revised integer,
  minutes_total integer,
  minutes_week integer,
  last_studied_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id,
         s.title,
         s.color,
         s.archived,
         (select count(*)::integer from public.topics t where t.subject_id = s.id),
         (select count(*)::integer from public.topics t
           where t.subject_id = s.id and t.status in ('revised', 'mastered')),
         coalesce((select sum(x.credited_minutes)::integer from public.study_sessions x
                    where x.subject_id = s.id and x.status = 'completed'), 0),
         coalesce((select sum(x.credited_minutes)::integer from public.study_sessions x
                    where x.subject_id = s.id and x.status = 'completed'
                      and x.started_at >= date_trunc('week', now())), 0),
         (select max(x.started_at) from public.study_sessions x
           where x.subject_id = s.id and x.status = 'completed')
    from public.subjects s
   where s.user_id = auth.uid()
   order by s.archived, s.created_at;
$$;

grant execute on function public.hunter_overview() to authenticated;
grant execute on function public.hunter_daily_series(integer) to authenticated;
grant execute on function public.hunter_subject_breakdown(integer) to authenticated;
grant execute on function public.hunter_history(integer, integer) to authenticated;
grant execute on function public.hunter_history_count() to authenticated;
grant execute on function public.subject_summary() to authenticated;
