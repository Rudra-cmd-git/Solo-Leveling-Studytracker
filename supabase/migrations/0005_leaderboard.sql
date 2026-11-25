-- ============================================================================
-- HUNTER SYSTEM - 0005 LEADERBOARD + PUBLIC PROFILE
-- ----------------------------------------------------------------------------
-- All ranking happens in the database so the client can never invent a score.
-- Tie-breaking is deterministic: period XP desc, lifetime XP desc, seniority.
-- ============================================================================

create or replace function public.leaderboard_period_start(p_period text)
returns timestamptz
language sql
stable
as $$
  select case lower(coalesce(p_period, 'all'))
           when 'week'  then date_trunc('week', now())
           when 'month' then date_trunc('month', now())
           else null
         end;
$$;

create or replace function public.leaderboard(
  p_period text default 'all',
  p_limit  integer default 25,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  rank_position bigint,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  hunter_rank  text,
  level        integer,
  period_xp    bigint,
  is_me        boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select public.leaderboard_period_start(p_period) as period_start
  ),
  scored as (
    select p.id,
           p.username,
           coalesce(p.display_name, p.username) as display_name,
           p.avatar_url,
           p.rank::text as hunter_rank,
           p.level,
           p.created_at,
           p.xp_total,
           case
             when v.period_start is null then p.xp_total
             else coalesce((
               select sum(t.amount)::bigint
                 from public.xp_transactions t
                where t.user_id = p.id and t.created_at >= v.period_start
             ), 0)
           end as period_xp
      from public.profiles p
      cross join v
     where p.is_public
       and p.show_on_leaderboard
       and (p_search is null or btrim(p_search) = '' or p.username ilike '%' || btrim(p_search) || '%')
  ),
  filtered as (
    select s.* from scored s, v
     where v.period_start is null or s.period_xp > 0
  ),
  ranked as (
    select f.*,
           row_number() over (
             order by f.period_xp desc, f.xp_total desc, f.created_at asc, f.id asc
           ) as pos
      from filtered f
  )
  select r.pos,
         r.id,
         r.username,
         r.display_name,
         r.avatar_url,
         r.hunter_rank,
         r.level,
         r.period_xp,
         r.id = auth.uid()
    from ranked r
   order by r.pos
   limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.leaderboard_size(
  p_period text default 'all',
  p_search text default null
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select public.leaderboard_period_start(p_period) as period_start
  ),
  scored as (
    select p.id, p.xp_total,
           case
             when v.period_start is null then p.xp_total
             else coalesce((
               select sum(t.amount)::bigint
                 from public.xp_transactions t
                where t.user_id = p.id and t.created_at >= v.period_start
             ), 0)
           end as period_xp
      from public.profiles p
      cross join v
     where p.is_public
       and p.show_on_leaderboard
       and (p_search is null or btrim(p_search) = '' or p.username ilike '%' || btrim(p_search) || '%')
  )
  select count(*)::bigint
    from scored s, v
   where v.period_start is null or s.period_xp > 0;
$$;

-- Where the signed-in hunter stands right now (null position when opted out
-- or when they have no XP in the selected window).
create or replace function public.my_leaderboard_standing(p_period text default 'all')
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select id, xp_total, is_public, show_on_leaderboard from public.profiles where id = auth.uid()
  ),
  v as (
    select public.leaderboard_period_start(p_period) as period_start
  ),
  scored as (
    select p.id, p.xp_total, p.created_at,
           case
             when v.period_start is null then p.xp_total
             else coalesce((
               select sum(t.amount)::bigint
                 from public.xp_transactions t
                where t.user_id = p.id and t.created_at >= v.period_start
             ), 0)
           end as period_xp
      from public.profiles p
      cross join v
     where p.is_public and p.show_on_leaderboard
  ),
  filtered as (
    select s.* from scored s, v where v.period_start is null or s.period_xp > 0
  ),
  ranked as (
    select f.*, row_number() over (
      order by f.period_xp desc, f.xp_total desc, f.created_at asc, f.id asc
    ) as pos from filtered f
  )
  select jsonb_build_object(
    'listed', coalesce((select (me.is_public and me.show_on_leaderboard) from me), false),
    'position', (select r.pos from ranked r, me where r.id = me.id),
    'period_xp', (select r.period_xp from ranked r, me where r.id = me.id),
    'total', (select count(*) from ranked)
  );
$$;

-- ----------------------------------------------------------------------------
-- Public Hunter profile. Returns nothing for private hunters so the UI can
-- show a neutral "profile is private" state without leaking existence data
-- beyond the username check.
-- ----------------------------------------------------------------------------
create or replace function public.public_hunter_profile(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select * from public.profiles
     where lower(username) = lower(btrim(p_username))
       and is_public
     limit 1
  ),
  weekly as (
    select count(*)::int as sessions,
           coalesce(sum(s.credited_minutes), 0)::int as minutes
      from public.study_sessions s, target t
     where s.user_id = t.id
       and s.status = 'completed'
       and s.started_at >= date_trunc('week', now())
  ),
  total as (
    select count(*)::int as sessions,
           coalesce(sum(s.credited_minutes), 0)::int as minutes
      from public.study_sessions s, target t
     where s.user_id = t.id
       and s.status = 'completed'
  ),
  badges as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'code', a.code, 'name', a.name, 'description', a.description,
             'icon', a.icon, 'rarity', a.rarity, 'unlocked_at', ua.unlocked_at
           ) order by ua.unlocked_at desc), '[]'::jsonb) as items
      from public.user_achievements ua
      join public.achievements a on a.code = ua.achievement_code
      join target t on t.id = ua.user_id
  ),
  leaderboard_pos as (
    select (select r.pos from (
              select p.id, row_number() over (
                order by p.xp_total desc, p.created_at asc, p.id asc
              ) as pos from public.profiles p
              where p.is_public and p.show_on_leaderboard
            ) r where r.id = t.id) as pos
      from target t
  )
  select case when t.id is null then null else jsonb_build_object(
    'id', t.id,
    'hunter_id', t.hunter_id,
    'username', t.username,
    'display_name', coalesce(t.display_name, t.username),
    'avatar_url', t.avatar_url,
    'bio', t.bio,
    'rank', t.rank,
    'level', t.level,
    'xp_total', t.xp_total,
    'total_study_seconds', t.total_study_seconds,
    'sessions_completed', t.sessions_completed,
    'quests_completed', t.quests_completed,
    'achievements_count', t.achievements_count,
    'current_streak', t.current_streak,
    'longest_streak', t.longest_streak,
    'last_study_date', t.last_study_date,
    'created_at', t.created_at,
    'on_leaderboard', t.show_on_leaderboard,
    'position', (select pos from leaderboard_pos),
    'weekly_sessions', (select sessions from weekly),
    'weekly_minutes', (select minutes from weekly),
    'lifetime_sessions', (select sessions from total),
    'lifetime_minutes', (select minutes from total),
    'achievements', (select items from badges)
  ) end
  from (select * from target) t;
$$;

grant execute on function public.leaderboard_period_start(text) to anon, authenticated;
grant execute on function public.leaderboard(text, integer, integer, text) to anon, authenticated;
grant execute on function public.leaderboard_size(text, text) to anon, authenticated;
grant execute on function public.my_leaderboard_standing(text) to authenticated;
grant execute on function public.public_hunter_profile(text) to anon, authenticated;
