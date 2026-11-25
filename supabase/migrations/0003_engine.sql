-- ============================================================================
-- HUNTER SYSTEM - 0003 SERVER ENGINE (sessions, quests, achievements)
-- ----------------------------------------------------------------------------
-- Every mutation that can create value (time credited, XP, quest rewards,
-- achievements) lives here as a SECURITY DEFINER function. Clients have no
-- write access to xp_transactions / study_sessions / quests at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Time accounting
-- ----------------------------------------------------------------------------
create or replace function public.pause_overlap_seconds(p_session uuid, p_from timestamptz, p_to timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    sum(greatest(0, extract(epoch from (
      least(coalesce(p.resumed_at, p_to), p_to) - greatest(p.paused_at, p_from)
    )))),
    0
  )
  from public.study_session_pauses p
  where p.session_id = p_session
    and p.paused_at < p_to
    and coalesce(p.resumed_at, p_to) > p_from;
$$;

-- Credited focus time is derived from server-stamped heartbeats, with each
-- gap clipped to max_heartbeat_gap. A tab left open, a spoofed client timer or
-- a device that slept therefore cannot manufacture credit.
create or replace function public.session_credited_seconds(p_session uuid)
returns table (credited_seconds integer, paused_seconds integer, beat_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_s        public.study_sessions;
  v_cfg      public.progression_config;
  v_end      timestamptz;
  v_prev     timestamptz;
  v_total    numeric := 0;
  v_gap      numeric;
  v_beat     record;
  v_count    integer := 0;
  v_paused   integer := 0;
begin
  select * into v_s from public.study_sessions where id = p_session;
  if not found then
    return query select 0, 0, 0;
    return;
  end if;

  select * into v_cfg from public.progression_config where id = 1;

  v_end := least(coalesce(v_s.ended_at, now()), now());
  v_end := least(v_end, v_s.started_at + make_interval(secs => v_cfg.max_session_seconds));
  v_prev := v_s.started_at;

  for v_beat in
    select seen_at from public.study_session_heartbeats
     where session_id = p_session and seen_at > v_s.started_at
     order by seen_at
  loop
    continue when v_beat.seen_at > v_end;
    v_count := v_count + 1;
    v_gap := least(extract(epoch from (v_beat.seen_at - v_prev)), v_cfg.max_heartbeat_gap);
    v_total := v_total + v_gap - public.pause_overlap_seconds(p_session, v_prev, v_beat.seen_at);
    v_prev := v_beat.seen_at;
  end loop;

  if v_end > v_prev then
    v_gap := least(extract(epoch from (v_end - v_prev)), v_cfg.max_heartbeat_gap);
    v_total := v_total + v_gap - public.pause_overlap_seconds(p_session, v_prev, v_end);
  end if;

  select coalesce(sum(extract(epoch from (coalesce(p.resumed_at, now()) - p.paused_at))), 0)::integer
    into v_paused
    from public.study_session_pauses p
   where p.session_id = p_session;

  return query select greatest(0, round(v_total)::integer), greatest(v_paused, 0), v_count;
end;
$$;

create or replace function public.hunter_day_start(p_user uuid, p_at timestamptz default now())
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz    text;
  v_today date;
begin
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from public.profiles where id = p_user;
  v_tz := coalesce(v_tz, 'UTC');
  begin
    execute 'select ($1 at time zone $2)::date' into v_today using p_at, v_tz;
    return (v_today::timestamp at time zone v_tz);
  exception when others then
    return (date_trunc('day', p_at at time zone 'UTC') at time zone 'UTC');
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- Session lifecycle
-- ----------------------------------------------------------------------------
create or replace function public.start_study_session(
  p_planned_seconds integer,
  p_client_token    uuid,
  p_subject_id      uuid default null,
  p_topic_id        uuid default null,
  p_is_revision     boolean default false,
  p_note            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_cfg   public.progression_config;
  v_row   public.study_sessions;
  v_max   integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_cfg from public.progression_config where id = 1;
  v_max := least(43200, v_cfg.max_session_seconds);

  if p_planned_seconds is null or p_planned_seconds < 60 or p_planned_seconds > v_max then
    raise exception 'INVALID_PLANNED_DURATION' using errcode = '22023';
  end if;

  if p_client_token is null then
    raise exception 'MISSING_CLIENT_TOKEN' using errcode = '22023';
  end if;

  -- Idempotent: retrying the same start returns the same session.
  select * into v_row
    from public.study_sessions
   where user_id = v_user and client_token = p_client_token;
  if found then
    return jsonb_build_object('session', to_jsonb(v_row), 'reused', true);
  end if;

  if not public.check_rate_limit('start_session', 40, 3600) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  if p_subject_id is not null and not exists (
    select 1 from public.subjects where id = p_subject_id and user_id = v_user
  ) then
    raise exception 'INVALID_SUBJECT' using errcode = '22023';
  end if;

  if p_topic_id is not null and not exists (
    select 1 from public.topics where id = p_topic_id and user_id = v_user
  ) then
    raise exception 'INVALID_TOPIC' using errcode = '22023';
  end if;

  -- Abandoned sessions stop blocking the hunter.
  update public.study_sessions
     set status = 'cancelled',
         ended_at = greatest(coalesce(ended_at, now()), started_at)
   where user_id = v_user
     and status in ('active', 'paused')
     and started_at < now() - make_interval(secs => v_max);

  if exists (
    select 1 from public.study_sessions
     where user_id = v_user and status in ('active', 'paused')
  ) then
    raise exception 'SESSION_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  insert into public.study_sessions
    (user_id, subject_id, topic_id, client_token, planned_seconds, is_revision, note)
  values
    (v_user, p_subject_id, p_topic_id, p_client_token, p_planned_seconds,
     coalesce(p_is_revision, false), nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_row;

  insert into public.study_session_heartbeats (session_id, user_id) values (v_row.id, v_user);

  return jsonb_build_object('session', to_jsonb(v_row), 'reused', false);
end;
$$;

create or replace function public.heartbeat_study_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
  v_acc  record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.study_sessions where id = p_session and user_id = v_user;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_row.status not in ('active', 'paused') then
    return jsonb_build_object('status', v_row.status, 'live', false);
  end if;

  if v_row.status = 'active' then
    if not public.check_rate_limit('heartbeat', 12, 60) then
      return jsonb_build_object('status', v_row.status, 'live', true, 'throttled', true);
    end if;
    insert into public.study_session_heartbeats (session_id, user_id) values (v_row.id, v_user);
  end if;

  select * into v_acc from public.session_credited_seconds(p_session);

  return jsonb_build_object(
    'status', v_row.status,
    'live', true,
    'credited_seconds', v_acc.credited_seconds,
    'paused_seconds', v_acc.paused_seconds
  );
end;
$$;

create or replace function public.pause_study_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
  v_acc  record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.study_sessions where id = p_session and user_id = v_user for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_row.status = 'paused' then
    select * into v_acc from public.session_credited_seconds(p_session);
    return jsonb_build_object('status', 'paused', 'credited_seconds', v_acc.credited_seconds);
  end if;

  if v_row.status <> 'active' then
    raise exception 'SESSION_NOT_ACTIVE' using errcode = '22023';
  end if;

  insert into public.study_session_pauses (session_id, user_id)
  values (v_row.id, v_user)
  on conflict do nothing;

  update public.study_sessions set status = 'paused' where id = v_row.id;

  select * into v_acc from public.session_credited_seconds(p_session);
  return jsonb_build_object('status', 'paused', 'credited_seconds', v_acc.credited_seconds);
end;
$$;

create or replace function public.resume_study_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
  v_acc  record;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.study_sessions where id = p_session and user_id = v_user for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_row.status = 'active' then
    return jsonb_build_object('status', 'active');
  end if;
  if v_row.status <> 'paused' then
    raise exception 'SESSION_NOT_PAUSED' using errcode = '22023';
  end if;

  update public.study_session_pauses
     set resumed_at = now()
   where session_id = v_row.id and resumed_at is null;

  update public.study_sessions set status = 'active' where id = v_row.id;
  insert into public.study_session_heartbeats (session_id, user_id) values (v_row.id, v_user);

  select * into v_acc from public.session_credited_seconds(p_session);
  return jsonb_build_object('status', 'active', 'credited_seconds', v_acc.credited_seconds);
end;
$$;

create or replace function public.cancel_study_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.study_sessions;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_row from public.study_sessions where id = p_session and user_id = v_user for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_row.status = 'completed' then
    raise exception 'SESSION_ALREADY_COMPLETED' using errcode = '22023';
  end if;

  update public.study_session_pauses
     set resumed_at = now()
   where session_id = v_row.id and resumed_at is null;

  update public.study_sessions
     set status = 'cancelled', ended_at = coalesce(ended_at, now())
   where id = v_row.id;

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ----------------------------------------------------------------------------
-- Quests
-- ----------------------------------------------------------------------------
create or replace function public.ensure_quests(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz      text;
  v_today   date;
  v_day     timestamptz;
  v_week    timestamptz;
  v_tpl     public.quest_templates;
  v_started timestamptz;
begin
  select coalesce(nullif(timezone, ''), 'UTC'), created_at into v_tz, v_started
    from public.profiles where id = p_user;
  if not found then
    return;
  end if;

  begin
    execute 'select (now() at time zone $1)::date' into v_today using v_tz;
    v_day := v_today::timestamp at time zone v_tz;
    v_week := (date_trunc('week', v_today::timestamp)) at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
    v_day := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    v_week := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  end;

  for v_tpl in select * from public.quest_templates loop
    if v_tpl.recurrence = 'daily' then
      insert into public.quests (user_id, template_code, title, description, category, difficulty,
                                 metric, target_value, reward_xp, period_key, starts_at, ends_at)
      values (p_user, v_tpl.code, v_tpl.title, v_tpl.description, v_tpl.category, v_tpl.difficulty,
              v_tpl.metric, v_tpl.target_value, v_tpl.reward_xp,
              to_char(v_today, 'YYYY-MM-DD'), v_day, v_day + interval '1 day')
      on conflict (user_id, template_code, period_key) do nothing;

    elsif v_tpl.recurrence = 'weekly' then
      insert into public.quests (user_id, template_code, title, description, category, difficulty,
                                 metric, target_value, reward_xp, period_key, starts_at, ends_at)
      values (p_user, v_tpl.code, v_tpl.title, v_tpl.description, v_tpl.category, v_tpl.difficulty,
              v_tpl.metric, v_tpl.target_value, v_tpl.reward_xp,
              to_char(v_today, 'IYYY-IW'), v_week, v_week + interval '7 days')
      on conflict (user_id, template_code, period_key) do nothing;

    else
      insert into public.quests (user_id, template_code, title, description, category, difficulty,
                                 metric, target_value, reward_xp, period_key, starts_at, ends_at)
      values (p_user, v_tpl.code, v_tpl.title, v_tpl.description, v_tpl.category, v_tpl.difficulty,
              v_tpl.metric, v_tpl.target_value, v_tpl.reward_xp,
              'once', v_started, now() + interval '100 years')
      on conflict (user_id, template_code, period_key) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_quests(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quest   public.quests;
  v_value   numeric;
  v_done    jsonb := '[]'::jsonb;
begin
  -- Expire anything whose window closed.
  update public.quests
     set status = 'expired'
   where user_id = p_user and status = 'active' and ends_at <= now();

  for v_quest in
    select * from public.quests
     where user_id = p_user and status = 'active' and ends_at > now()
     order by created_at, title
  loop
    v_value := public.hunter_metric(v_quest.metric, p_user, now());

    update public.quests
       set progress_value = v_value
     where id = v_quest.id;

    if v_value >= v_quest.target_value then
      update public.quests
         set status = 'completed', completed_at = now(), progress_value = v_quest.target_value
       where id = v_quest.id and status = 'active';

      if found then
        insert into public.xp_transactions (user_id, source_type, source_id, amount, detail)
        values (p_user, 'quest', v_quest.id, v_quest.reward_xp,
                jsonb_build_object('quest', v_quest.template_code, 'title', v_quest.title))
        on conflict do nothing;

        update public.profiles
           set quests_completed = quests_completed + 1
         where id = p_user;

        insert into public.notifications (user_id, type, title, message, payload)
        values (p_user, 'quest', 'QUEST COMPLETED', v_quest.title,
                jsonb_build_object('quest_id', v_quest.id, 'reward_xp', v_quest.reward_xp,
                                   'category', v_quest.category));

        v_done := v_done || jsonb_build_array(jsonb_build_object(
          'id', v_quest.id,
          'title', v_quest.title,
          'category', v_quest.category,
          'reward_xp', v_quest.reward_xp
        ));
      end if;
    end if;
  end loop;

  return v_done;
end;
$$;

-- ----------------------------------------------------------------------------
-- Achievements
-- ----------------------------------------------------------------------------
create or replace function public.evaluate_achievements(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ach     public.achievements;
  v_value   numeric;
  v_row_id  uuid;
  v_unlock  jsonb := '[]'::jsonb;
begin
  for v_ach in
    select a.* from public.achievements a
     where not exists (
       select 1 from public.user_achievements ua
        where ua.user_id = p_user and ua.achievement_code = a.code
     )
     order by a.sort_order
  loop
    v_value := public.hunter_metric(v_ach.metric, p_user, now());
    continue when v_value < v_ach.target_value;

    insert into public.user_achievements (user_id, achievement_code)
    values (p_user, v_ach.code)
    on conflict (user_id, achievement_code) do nothing
    returning id into v_row_id;

    continue when v_row_id is null;

    if v_ach.reward_xp > 0 then
      insert into public.xp_transactions (user_id, source_type, source_id, amount, detail)
      values (p_user, 'achievement', v_row_id, v_ach.reward_xp,
              jsonb_build_object('achievement', v_ach.code, 'name', v_ach.name))
      on conflict do nothing;
    end if;

    insert into public.notifications (user_id, type, title, message, payload)
    values (p_user, 'achievement', 'ACHIEVEMENT UNLOCKED', v_ach.name,
            jsonb_build_object('achievement', v_ach.code, 'rarity', v_ach.rarity,
                               'reward_xp', v_ach.reward_xp));

    v_unlock := v_unlock || jsonb_build_array(jsonb_build_object(
      'code', v_ach.code,
      'name', v_ach.name,
      'description', v_ach.description,
      'icon', v_ach.icon,
      'rarity', v_ach.rarity,
      'reward_xp', v_ach.reward_xp
    ));
  end loop;

  return v_unlock;
end;
$$;

-- Public entry point used by the app when a page needs fresh quest progress.
create or replace function public.refresh_quests()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_done jsonb;
  v_unlock jsonb;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  perform public.ensure_quests(v_user);
  v_done := public.evaluate_quests(v_user);
  v_unlock := public.evaluate_achievements(v_user);

  return jsonb_build_object('completed_quests', v_done, 'unlocked_achievements', v_unlock);
end;
$$;

-- ----------------------------------------------------------------------------
-- Complete a session — the single XP-awarding path for study time
-- ----------------------------------------------------------------------------
create or replace function public.complete_study_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := auth.uid();
  v_s           public.study_sessions;
  v_cfg         public.progression_config;
  v_acc         record;
  v_minutes     integer := 0;
  v_xp_intent   integer := 0;
  v_xp_granted  integer := 0;
  v_day_start   timestamptz;
  v_day_used    integer := 0;
  v_remaining   integer;
  v_level_bf    integer;
  v_rank_bf     text;
  v_level_af    integer;
  v_rank_af     text;
  v_quests      jsonb := '[]'::jsonb;
  v_unlocked    jsonb := '[]'::jsonb;
  v_streak      integer := 0;
  v_already     boolean := false;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_s
    from public.study_sessions
   where id = p_session and user_id = v_user
   for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = '22023';
  end if;

  select * into v_cfg from public.progression_config where id = 1;

  -- Replay protection: completing twice never pays twice.
  if v_s.status = 'completed' then
    select * into v_acc from public.session_credited_seconds(p_session);
    select level, rank into v_level_af, v_rank_af from public.profiles where id = v_user;
    return jsonb_build_object(
      'already_completed', true,
      'session', to_jsonb(v_s),
      'xp_awarded', v_s.xp_awarded,
      'credited_minutes', coalesce(v_s.credited_minutes, 0),
      'credited_seconds', v_acc.credited_seconds,
      'level', v_level_af,
      'rank', v_rank_af,
      'completed_quests', v_quests,
      'unlocked_achievements', v_unlocked
    );
  end if;

  if v_s.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED' using errcode = '22023';
  end if;

  select level, rank into v_level_bf, v_rank_bf from public.profiles where id = v_user;

  -- Seal the session: close any open pause, stamp the end, derive credit.
  update public.study_session_pauses
     set resumed_at = now()
   where session_id = p_session and resumed_at is null;

  update public.study_sessions
     set ended_at = now()
   where id = p_session and ended_at is null;

  select * into v_s from public.study_sessions where id = p_session;
  select * into v_acc from public.session_credited_seconds(p_session);

  v_minutes := floor(v_acc.credited_seconds / 60.0)::integer;

  if v_minutes > 0 then
    v_xp_intent := v_minutes * v_cfg.xp_per_minute;

    -- Daily reward cap: study time is still recorded past the cap, XP is not.
    v_day_start := public.hunter_day_start(v_user, now());
    select coalesce(sum(amount), 0) into v_day_used
      from public.xp_transactions
     where user_id = v_user
       and source_type = 'session'
       and created_at >= v_day_start;

    v_remaining := greatest(v_cfg.daily_xp_cap - v_day_used, 0);
    v_xp_granted := least(v_xp_intent, v_remaining);
  end if;

  update public.study_sessions
     set status = 'completed',
         duration_seconds = v_acc.credited_seconds,
         paused_seconds = v_acc.paused_seconds,
         credited_minutes = v_minutes,
         xp_awarded = v_xp_granted,
         ended_at = coalesce(ended_at, now())
   where id = p_session;

  if v_xp_granted > 0 then
    insert into public.xp_transactions (user_id, source_type, source_id, amount, detail)
    values (v_user, 'session', p_session, v_xp_granted,
            jsonb_build_object(
              'minutes', v_minutes,
              'subject_id', v_s.subject_id,
              'intent', v_xp_intent,
              'capped', v_xp_intent > v_xp_granted
            ))
    on conflict do nothing;
  end if;

  if v_minutes > 0 then
    insert into public.notifications (user_id, type, title, message, payload)
    values (v_user, 'session', 'SESSION RECORDED',
            format('%s minutes of focused study. %s', v_minutes,
                   case when v_xp_granted > 0 then format('+%s XP.', v_xp_granted)
                        else 'Daily XP cap reached — time recorded.' end),
            jsonb_build_object('session_id', p_session, 'minutes', v_minutes,
                               'xp', v_xp_granted));
  end if;

  -- Topic revision bookkeeping
  if v_s.topic_id is not null and v_minutes > 0 then
    update public.topics
       set revision_count = revision_count + case when v_s.is_revision then 1 else 0 end,
           last_revised_at = case when v_s.is_revision then now() else last_revised_at end,
           status = case
                      when v_s.is_revision and status in ('not_started', 'learning') then 'revised'::public.topic_status
                      else status
                    end
     where id = v_s.topic_id and user_id = v_user;
  end if;

  perform public.ensure_quests(v_user);
  v_quests := public.evaluate_quests(v_user);
  v_unlocked := public.evaluate_achievements(v_user);

  select level, rank, current_streak into v_level_af, v_rank_af, v_streak
    from public.profiles where id = v_user;

  select * into v_s from public.study_sessions where id = p_session;

  return jsonb_build_object(
    'already_completed', v_already,
    'session', to_jsonb(v_s),
    'xp_awarded', v_xp_granted,
    'xp_intent', v_xp_intent,
    'capped', v_xp_intent > v_xp_granted,
    'credited_minutes', v_minutes,
    'credited_seconds', v_acc.credited_seconds,
    'voided', v_minutes = 0,
    'level', v_level_af,
    'level_before', v_level_bf,
    'level_up', v_level_af > v_level_bf,
    'rank', v_rank_af,
    'rank_before', v_rank_bf,
    'rank_up', public.rank_index(v_rank_af) > public.rank_index(v_rank_bf),
    'streak', v_streak,
    'completed_quests', v_quests,
    'unlocked_achievements', v_unlocked
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Profile / account management (no direct table writes for clients)
-- ----------------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_username            text default null,
  p_display_name        text default null,
  p_bio                 text default null,
  p_avatar_url          text default null,
  p_timezone            text default null,
  p_is_public           boolean default null,
  p_show_on_leaderboard boolean default null,
  p_daily_goal_minutes  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if p_username is not null and btrim(p_username) <> '' then
    v_name := btrim(p_username);
    if v_name !~ '^[A-Za-z0-9_]{3,20}$' then
      raise exception 'INVALID_USERNAME' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.profiles
       where lower(username) = lower(v_name) and id <> v_user
    ) then
      raise exception 'USERNAME_TAKEN' using errcode = '23505';
    end if;
  end if;

  if p_daily_goal_minutes is not null
     and (p_daily_goal_minutes < 15 or p_daily_goal_minutes > 1440) then
    raise exception 'INVALID_DAILY_GOAL' using errcode = '22023';
  end if;

  update public.profiles
     set username = coalesce(v_name, username),
         display_name = case when p_display_name is null then display_name
                             else nullif(btrim(p_display_name), '') end,
         bio = case when p_bio is null then bio
                    else nullif(btrim(p_bio), '') end,
         avatar_url = case when p_avatar_url is null then avatar_url
                           else nullif(btrim(p_avatar_url), '') end,
         timezone = coalesce(nullif(btrim(p_timezone), ''), timezone),
         is_public = coalesce(p_is_public, is_public),
         show_on_leaderboard = coalesce(p_show_on_leaderboard, show_on_leaderboard),
         daily_goal_minutes = coalesce(p_daily_goal_minutes, daily_goal_minutes)
   where id = v_user;

  return (select to_jsonb(p) from public.profiles p where p.id = v_user);
end;
$$;

create or replace function public.mark_awakened()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.profiles;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.profiles
     set awakened_at = coalesce(awakened_at, now())
   where id = v_user;

  select * into v_row from public.profiles where id = v_user;
  return jsonb_build_object('awakened_at', v_row.awakened_at);
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.notifications
     set is_read = true
   where user_id = v_user
     and not is_read
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- Cascades through profiles and every user-owned table.
  delete from auth.users where id = v_user;
  return jsonb_build_object('deleted', true);
end;
$$;
