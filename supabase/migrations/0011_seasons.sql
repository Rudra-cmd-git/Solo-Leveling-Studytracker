-- ============================================================================
-- 0011_seasons.sql - Monthly hunter seasons
-- ----------------------------------------------------------------------------
-- A season is one calendar month. The catalog is generated deterministically
-- from the database clock (twelve months back, one forward) so no scheduler and
-- no manual seeding is required, and every row carries a name and a theme the
-- owner can edit later with a plain UPDATE.
--
-- Season standings are derived from the same xp_transactions ledger as every
-- other board. Nothing can write season XP directly.
-- ============================================================================

create table public.seasons (
  code      text primary key check (code ~ '^[0-9]{4}-[0-9]{2}$'),
  name      text not null,
  theme     text not null default 'azure' check (theme in ('azure', 'violet', 'gold', 'ember')),
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  created_at timestamptz not null default now(),
  constraint seasons_window_valid check (ends_at > starts_at)
);

create index seasons_window_idx on public.seasons (starts_at, ends_at);

alter table public.seasons enable row level security;
revoke all on public.seasons from anon, authenticated;
grant select on public.seasons to anon, authenticated;

create policy seasons_public on public.seasons
  for select to anon, authenticated using (true);

insert into public.seasons (code, name, theme, starts_at, ends_at)
select to_char(m, 'YYYY-MM'),
       'Season ' || to_char(m, 'YYYY-MM'),
       (array['azure', 'violet', 'gold', 'ember'])[1 + (extract(month from m)::int % 4)],
       m,
       m + interval '1 month'
  from generate_series(
         date_trunc('month', now()) - interval '11 months',
         date_trunc('month', now()) + interval '1 month',
         interval '1 month'
       ) as m
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Current season
-- ----------------------------------------------------------------------------
create or replace function public.current_season()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'code', s.code,
    'name', s.name,
    'theme', s.theme,
    'starts_at', s.starts_at,
    'ends_at', s.ends_at,
    'days_left', greatest(0, ceil(extract(epoch from (s.ends_at - now())) / 86400))::int
  )
    from public.seasons s
   where now() >= s.starts_at and now() < s.ends_at
   order by s.starts_at desc
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Season standings
-- ----------------------------------------------------------------------------
create or replace function public.season_leaderboard(
  p_code  text default null,
  p_limit integer default 25
)
returns table (
  rank_position bigint,
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  hunter_rank   text,
  level         integer,
  period_xp     bigint,
  is_me         boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select s.*
      from public.seasons s
     where (p_code is null and now() >= s.starts_at and now() < s.ends_at)
        or (p_code is not null and s.code = btrim(p_code))
     order by s.starts_at desc
     limit 1
  ),
  scored as (
    select p.id, p.username,
           coalesce(p.display_name, p.username) as display_name,
           p.avatar_url, p.rank::text as hunter_rank, p.level, p.created_at, p.xp_total,
           coalesce((
             select sum(t.amount)::bigint
               from public.xp_transactions t, target tg
              where t.user_id = p.id
                and t.created_at >= tg.starts_at
                and t.created_at < tg.ends_at
           ), 0) as period_xp
      from public.profiles p
      cross join target
     where p.is_public and p.show_on_leaderboard
  ),
  ranked as (
    select s.*, row_number() over (
      order by s.period_xp desc, s.xp_total desc, s.created_at asc, s.id asc
    ) as pos
      from scored s
     where s.period_xp > 0
  )
  select r.pos, r.id, r.username, r.display_name, r.avatar_url,
         r.hunter_rank, r.level, r.period_xp, r.id = auth.uid()
    from ranked r
   order by r.pos
   limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

-- Top three of the season that just ended, for the "last season" highlight.
create or replace function public.previous_season_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with prev as (
    select s.* from public.seasons s
     where s.ends_at <= now()
     order by s.starts_at desc
     limit 1
  ),
  winners as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'rank_position', w.rank_position,
             'username', w.username,
             'display_name', w.display_name,
             'avatar_url', w.avatar_url,
             'hunter_rank', w.hunter_rank,
             'level', w.level,
             'period_xp', w.period_xp
           ) order by w.rank_position), '[]'::jsonb) as items
      from public.season_leaderboard((select code from prev), 3) w
  )
  select case when (select code from prev) is null then null else jsonb_build_object(
    'code', (select code from prev),
    'name', (select name from prev),
    'theme', (select theme from prev),
    'ends_at', (select ends_at from prev),
    'winners', (select items from winners)
  ) end;
$$;

-- The caller's own season record: XP this season, position, and the gap to the
-- hunter immediately above them.
create or replace function public.my_season_standing()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select id, xp_total, is_public, show_on_leaderboard from public.profiles where id = auth.uid()
  ),
  board as (
    select * from public.season_leaderboard(null, 100)
  ),
  mine as (
    select b.* from board b, me where b.user_id = me.id
  ),
  above as (
    select b.period_xp
      from board b, mine m
     where b.rank_position = m.rank_position - 1
  )
  select jsonb_build_object(
    'listed', (select me.is_public and me.show_on_leaderboard from me),
    'season_xp', coalesce((select period_xp from mine), 0),
    'position', (select rank_position from mine),
    'total', (select count(*) from board),
    'gap_to_above', coalesce((select period_xp from above), 0) - coalesce((select period_xp from mine), 0)
  );
$$;

grant execute on function public.current_season() to anon, authenticated;
grant execute on function public.season_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.previous_season_summary() to anon, authenticated;
grant execute on function public.my_season_standing() to authenticated;

-- ----------------------------------------------------------------------------
-- Hardening: Postgres grants EXECUTE on every new function to PUBLIC, so the
-- implicit grant is stripped again here for each SECURITY DEFINER function.
-- Explicit grants made in this and earlier migrations are unaffected.
-- ----------------------------------------------------------------------------
do $harden$
declare
  fn text;
begin
  for fn in
    select p.oid::regprocedure::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef
  loop
    execute format('revoke all on function %s from public', fn);
  end loop;
end;
$harden$;
