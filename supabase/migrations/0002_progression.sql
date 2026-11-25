-- ============================================================================
-- HUNTER SYSTEM - 0002 PROGRESSION MATH, METRICS, TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Level curve
--   xp needed for next level = base + (level - 1) * growth
--   cumulative xp to *be* at level L = base*(L-1) + growth*(L-1)*(L-2)/2
-- ----------------------------------------------------------------------------
create or replace function public.level_step_xp(p_level integer, p_base integer, p_growth integer)
returns bigint
language sql
immutable
as $$
  select greatest(1, p_base + (greatest(p_level, 1) - 1) * p_growth)::bigint;
$$;

create or replace function public.xp_to_reach_level(p_level integer, p_base integer, p_growth integer)
returns bigint
language sql
immutable
as $$
  select case
           when p_level <= 1 then 0::bigint
           else (p_base::bigint * (p_level - 1))
                + (p_growth::bigint * (p_level - 1) * (p_level - 2)) / 2
         end;
$$;

-- Closed-form inverse with a small correction loop, so it stays exact for any
-- (base, growth) pair the configuration may use later.
create or replace function public.level_for_xp(p_xp bigint, p_base integer, p_growth integer)
returns integer
language plpgsql
immutable
as $$
declare
  v_xp     bigint := greatest(coalesce(p_xp, 0), 0);
  v_level  integer;
  v_b      numeric;
  v_a      numeric;
  v_c      numeric;
  v_guess  numeric;
begin
  if p_growth is null or p_growth <= 0 then
    return (v_xp / greatest(p_base, 1))::integer + 1;
  end if;

  -- growth*n^2 + (2*base - growth)*n - 2*xp = 0  where n = level - 1
  v_a := p_growth;
  v_b := (2 * p_base) - p_growth;
  v_c := -2 * v_xp;
  v_guess := (-v_b + sqrt(v_b * v_b - 4 * v_a * v_c)) / (2 * v_a);
  v_level := greatest(1, floor(v_guess)::integer + 1);

  -- Correct for integer truncation / floating point drift.
  while v_level > 1 and public.xp_to_reach_level(v_level, p_base, p_growth) > v_xp loop
    v_level := v_level - 1;
  end loop;
  while public.xp_to_reach_level(v_level + 1, p_base, p_growth) <= v_xp loop
    v_level := v_level + 1;
  end loop;

  return v_level;
end;
$$;

-- Config-aware wrappers used by triggers and the app.
create or replace function public.hunter_progression()
returns public.progression_config
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.progression_config where id = 1;
$$;

create or replace function public.level_for_xp(p_xp bigint)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.level_for_xp(p_xp, c.base_level_xp, c.level_growth_xp)
    from public.progression_config c where c.id = 1;
$$;

create or replace function public.level_progress(p_xp bigint)
returns table (
  level          integer,
  level_xp_start bigint,
  level_xp_next  bigint,
  into_level     bigint,
  needed         bigint,
  percent        numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg   public.progression_config;
  v_level integer;
  v_start bigint;
  v_next  bigint;
  v_into  bigint;
  v_need  bigint;
begin
  select * into v_cfg from public.progression_config where id = 1;
  v_level := public.level_for_xp(p_xp, v_cfg.base_level_xp, v_cfg.level_growth_xp);
  v_start := public.xp_to_reach_level(v_level, v_cfg.base_level_xp, v_cfg.level_growth_xp);
  v_next  := public.xp_to_reach_level(v_level + 1, v_cfg.base_level_xp, v_cfg.level_growth_xp);
  v_into  := greatest(0, coalesce(p_xp, 0) - v_start);
  v_need  := greatest(1, v_next - v_start);

  return query select v_level, v_start, v_next, v_into, v_need,
    round((v_into::numeric / v_need::numeric) * 100, 2);
end;
$$;

create or replace function public.rank_for_xp(p_xp bigint)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.rank
    from public.rank_thresholds t
   where t.min_xp <= greatest(coalesce(p_xp, 0), 0)
   order by t.min_xp desc
   limit 1;
$$;

create or replace function public.rank_index(p_rank text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select order_index from public.rank_thresholds where rank = p_rank), 0);
$$;

-- ----------------------------------------------------------------------------
-- Derived productivity metrics (single implementation used by quests,
-- achievements and analytics so numbers can never disagree)
-- ----------------------------------------------------------------------------
create or replace function public.hunter_metric(p_metric text, p_user uuid, p_now timestamptz default now())
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz          text;
  v_today       date;
  v_day_start   timestamptz;
  v_week_start  timestamptz;
  v_month_start timestamptz;
  v_value       numeric := 0;
  v_profile     public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then
    return 0;
  end if;

  v_tz := coalesce(nullif(v_profile.timezone, ''), 'UTC');
  begin
    execute 'select ($1 at time zone $2)::date' into v_today using p_now, v_tz;
    execute 'select (($1::date)::timestamp at time zone $2)' into v_day_start using v_today, v_tz;
    execute 'select ((date_trunc(''week'', $1::date)::timestamp) at time zone $2)'
      into v_week_start using v_today, v_tz;
    execute 'select ((date_trunc(''month'', $1::date)::timestamp) at time zone $2)'
      into v_month_start using v_today, v_tz;
  exception when others then
    -- Unknown timezone: fall back to UTC rather than failing the request.
    v_tz := 'UTC';
    v_today := (p_now at time zone 'UTC')::date;
    v_day_start := (v_today::timestamp at time zone 'UTC');
    v_week_start := (date_trunc('week', v_today::timestamp) at time zone 'UTC');
    v_month_start := (date_trunc('month', v_today::timestamp) at time zone 'UTC');
  end;

  case p_metric
    -- ---------- today ----------
    when 'study_minutes_day' then
      select coalesce(sum(s.credited_minutes), 0) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_day_start and coalesce(s.credited_minutes, 0) > 0;

    when 'sessions_day' then
      select count(*) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_day_start and coalesce(s.credited_minutes, 0) > 0;

    when 'distinct_subjects_day' then
      select count(distinct s.subject_id) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_day_start and coalesce(s.credited_minutes, 0) > 0
         and s.subject_id is not null;

    when 'max_session_minutes_day' then
      select coalesce(max(s.credited_minutes), 0) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_day_start;

    when 'revision_sessions_day' then
      select count(*) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed' and s.is_revision
         and s.started_at >= v_day_start and coalesce(s.credited_minutes, 0) > 0;

    -- ---------- this week ----------
    when 'study_minutes_week' then
      select coalesce(sum(s.credited_minutes), 0) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_week_start and coalesce(s.credited_minutes, 0) > 0;

    when 'sessions_week' then
      select count(*) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_week_start and coalesce(s.credited_minutes, 0) > 0;

    when 'distinct_subjects_week' then
      select count(distinct s.subject_id) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_week_start and coalesce(s.credited_minutes, 0) > 0
         and s.subject_id is not null;

    when 'revision_topics_week' then
      select count(*) into v_value
        from public.topics t
       where t.user_id = p_user and t.last_revised_at is not null
         and t.last_revised_at >= v_week_start;

    when 'study_minutes_month' then
      select coalesce(sum(s.credited_minutes), 0) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and s.started_at >= v_month_start and coalesce(s.credited_minutes, 0) > 0;

    -- ---------- lifetime ----------
    when 'xp_total' then
      v_value := v_profile.xp_total;

    when 'level' then
      v_value := v_profile.level;

    when 'rank_index' then
      v_value := public.rank_index(v_profile.rank);

    when 'sessions_total' then
      select count(*) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and coalesce(s.credited_minutes, 0) > 0;

    when 'study_minutes_total' then
      select coalesce(sum(s.credited_minutes), 0) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and coalesce(s.credited_minutes, 0) > 0;

    when 'distinct_days' then
      select count(distinct (s.started_at at time zone v_tz)::date)::numeric
        into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and coalesce(s.credited_minutes, 0) > 0;

    when 'current_streak' then
      v_value := v_profile.current_streak;

    when 'longest_streak' then
      v_value := v_profile.longest_streak;

    when 'max_session_minutes_total' then
      select coalesce(max(s.credited_minutes), 0) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed';

    when 'early_sessions' then
      select count(*) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and coalesce(s.credited_minutes, 0) > 0
         and extract(hour from (s.started_at at time zone v_tz)) < 6;

    when 'night_sessions' then
      select count(*) into v_value
        from public.study_sessions s
       where s.user_id = p_user and s.status = 'completed'
         and coalesce(s.credited_minutes, 0) > 0
         and extract(hour from (s.started_at at time zone v_tz)) >= 23;

    when 'achievements_count' then
      v_value := v_profile.achievements_count;

    when 'quests_completed' then
      v_value := v_profile.quests_completed;

    else
      raise exception 'Unknown metric: %', p_metric using errcode = '22023';
  end case;

  return coalesce(v_value, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- Triggers: keep profiles consistent and emit System notifications
-- ----------------------------------------------------------------------------
create or replace function public.tg_profiles_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.username := btrim(new.username);
  if new.xp_total is distinct from old.xp_total or new.level = 0 then
    new.level := public.level_for_xp(new.xp_total);
    new.rank := public.rank_for_xp(new.xp_total);
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.tg_profiles_before_update();

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger subjects_touch before update on public.subjects
  for each row execute function public.tg_touch_updated_at();
create trigger topics_touch before update on public.topics
  for each row execute function public.tg_touch_updated_at();

-- Applying XP: the only place xp_total may move.
create or replace function public.tg_xp_applied()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_level_before integer;
  v_rank_before  text;
  v_level_after  integer;
  v_rank_after   text;
begin
  select level, rank into v_level_before, v_rank_before
    from public.profiles where id = new.user_id
   for update;

  update public.profiles
     set xp_total = xp_total + new.amount
   where id = new.user_id
  returning level, rank into v_level_after, v_rank_after;

  if v_level_after > v_level_before then
    insert into public.notifications (user_id, type, title, message, payload)
    values (
      new.user_id,
      'level',
      'LEVEL PROGRESSION AVAILABLE',
      format('You have reached Level %s.', v_level_after),
      jsonb_build_object('level_before', v_level_before, 'level_after', v_level_after)
    );
  end if;

  if public.rank_index(v_rank_after) > public.rank_index(v_rank_before) then
    insert into public.notifications (user_id, type, title, message, payload)
    values (
      new.user_id,
      'rank',
      'RANK ADVANCEMENT DETECTED',
      format('Previous Rank: %s. New Rank: %s. Congratulations, Hunter.', v_rank_before, v_rank_after),
      jsonb_build_object('rank_before', v_rank_before, 'rank_after', v_rank_after)
    );
  end if;

  return null;
end;
$$;

create trigger xp_transactions_applied
  after insert on public.xp_transactions
  for each row execute function public.tg_xp_applied();

-- Session completion aggregates + streak.
create or replace function public.tg_session_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz         text;
  v_today      date;
  v_last       date;
  v_streak     integer;
  v_longest    integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return null;
  end if;

  select coalesce(nullif(timezone, ''), 'UTC'), last_study_date, current_streak, longest_streak
    into v_tz, v_last, v_streak, v_longest
    from public.profiles where id = new.user_id for update;

  update public.profiles
     set total_study_seconds = total_study_seconds + coalesce(new.duration_seconds, 0),
         sessions_completed  = sessions_completed + 1
   where id = new.user_id;

  -- A session of less than one credited minute is recorded but does not
  -- disturb streak bookkeeping.
  if coalesce(new.credited_minutes, 0) > 0 then
    begin
      execute 'select ($1 at time zone $2)::date' into v_today using now(), v_tz;
    exception when others then
      v_today := (now() at time zone 'UTC')::date;
    end;

    if v_last is null then
      v_streak := 1;
    elsif v_last = v_today then
      v_streak := greatest(v_streak, 1);
    elsif v_last = v_today - 1 then
      v_streak := v_streak + 1;
    else
      v_streak := 1;
    end if;

    v_longest := greatest(coalesce(v_longest, 0), v_streak);

    update public.profiles
       set current_streak = v_streak,
           longest_streak = v_longest,
           last_study_date = v_today
     where id = new.user_id;
  end if;

  return null;
end;
$$;

create trigger sessions_completed
  after update on public.study_sessions
  for each row execute function public.tg_session_completed();

create or replace function public.tg_achievement_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set achievements_count = achievements_count + 1
   where id = new.user_id;
  return null;
end;
$$;

create trigger user_achievements_count
  after insert on public.user_achievements
  for each row execute function public.tg_achievement_count();

-- New auth user -> Hunter profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text;
  v_base     text;
  v_tz       text;
  v_try      integer := 0;
begin
  v_username := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));

  if v_username !~ '^[A-Za-z0-9_]{3,20}$' then
    v_base := 'hunter_' || substr(replace(new.id::text, '-', ''), 1, 8);
    v_username := v_base;
  else
    v_base := v_username;
  end if;

  v_tz := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'timezone'), ''), 'UTC');

  -- Resolve collisions deterministically instead of failing the signup.
  while exists (select 1 from public.profiles where lower(username) = lower(v_username)) loop
    v_try := v_try + 1;
    v_username := left(v_base, 20 - length('_' || v_try::text)) || '_' || v_try::text;
    if v_try > 50 then
      v_username := left('hunter', 13) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, timezone)
  values (new.id, v_username, v_username, v_tz)
  on conflict (id) do nothing;

  return null;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Rate limiting helper (server-only)
-- ----------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;

  select count(*) into v_count
    from public.rate_limit_events
   where user_id = v_user
     and action = p_action
     and created_at > now() - make_interval(secs => greatest(p_window_seconds, 1));

  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_user, p_action);
  return true;
end;
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (p_username ~ '^[A-Za-z0-9_]{3,20}$')
    and not exists (select 1 from public.profiles where lower(username) = lower(btrim(p_username)));
$$;
