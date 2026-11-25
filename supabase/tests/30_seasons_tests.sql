-- ============================================================================
-- 30_seasons_tests.sql - monthly seasons (migration 0011)
-- ----------------------------------------------------------------------------
-- Runs after the social suite in the same database.
-- ============================================================================

-- The social suite ends with QuietScholar private; seasons only look at XP, but
-- the boards filter on visibility, so restore the defaults.
update public.profiles
   set is_public = true, show_on_leaderboard = true
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222',
              '33333333-3333-3333-3333-333333333333',
              '44444444-4444-4444-4444-444444444444');

-- A single, unmistakable fixture: 321 XP earned last month, nothing this month.
insert into public.xp_transactions (user_id, source_type, source_id, amount, created_at)
values ('44444444-4444-4444-4444-444444444444', 'bonus', gen_random_uuid(), 321,
        date_trunc('month', now()) - interval '1 month' + interval '1 day');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ----------------------------------------------------------------------------
-- A. Catalog
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select count(*) >= 12 from public.seasons),
  'the season catalog is generated for the last year');

select public.tap_ok(
  (select count(*) = 1 from public.seasons where now() >= starts_at and now() < ends_at),
  'exactly one season is active at a time');

select public.tap_ok(
  (select code = to_char(now(), 'YYYY-MM') from public.seasons
    where now() >= starts_at and now() < ends_at),
  'the active season is the current calendar month');

select public.tap_ok(
  (select (public.current_season() ->> 'code') = to_char(now(), 'YYYY-MM')),
  'current_season() reports the active month');

select public.tap_ok(
  (select (public.current_season() ->> 'days_left')::int between 0 and 31),
  'current_season() reports the days remaining');

-- ----------------------------------------------------------------------------
-- B. Window scoping
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select period_xp from public.season_leaderboard(to_char(now() - interval '1 month', 'YYYY-MM'), 50)
    where user_id = '44444444-4444-4444-4444-444444444444') = 321,
  'a season board counts only XP earned inside its own window');

select public.tap_ok(
  (select count(*) = 0 from public.season_leaderboard(null, 100)
    where user_id = '44444444-4444-4444-4444-444444444444'),
  'XP from a past season does not leak into the current board');

select public.tap_ok(
  (select bool_and(period_xp > 0) from public.season_leaderboard(null, 100)),
  'the season board only lists hunters with season XP');

reset role;

select public.tap_ok(
  (select bool_and(b.period_xp = coalesce((
            select sum(t.amount)::bigint
              from public.xp_transactions t
             where t.user_id = b.user_id
               and t.created_at >= date_trunc('month', now())
               and t.created_at < date_trunc('month', now()) + interval '1 month'
          ), 0))
     from public.season_leaderboard(null, 50) b),
  'season XP matches the XP ledger for that window');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ----------------------------------------------------------------------------
-- C. Ordering and privacy
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select bool_and(rank_position = 1
                   or period_xp <= (select min(b.period_xp) from public.season_leaderboard(null, 100) b
                                     where b.rank_position < a.rank_position))
     from public.season_leaderboard(null, 100) a),
  'season standings are ordered by descending XP');

select public.tap_ok(
  (select count(*) = 1 from public.season_leaderboard(null, 100) where is_me),
  'season standings flag the caller exactly once');

reset role;
update public.profiles set show_on_leaderboard = false where username = 'IronWill';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select count(*) = 0 from public.season_leaderboard(null, 100) where username = 'IronWill'),
  'a hunter who opted out is absent from season standings');

reset role;
update public.profiles set show_on_leaderboard = true where username = 'IronWill';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ----------------------------------------------------------------------------
-- D. Personal standing
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select (public.my_season_standing() ->> 'season_xp')::bigint > 0),
  'a hunter can read their own season XP');

select public.tap_ok(
  (select (public.my_season_standing() ->> 'position')::int >= 1),
  'a hunter can read their own season position');

-- ----------------------------------------------------------------------------
-- E. Previous season summary
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select (public.previous_season_summary() ->> 'code') = to_char(now() - interval '1 month', 'YYYY-MM')),
  'the previous season summary targets the month that just ended');

select public.tap_ok(
  (select jsonb_array_length(public.previous_season_summary() -> 'winners') >= 1),
  'the previous season summary lists its winners');

select public.tap_ok(
  (select (t.elem ->> 'rank_position')::int = 1
     from jsonb_array_elements(public.previous_season_summary() -> 'winners')
          with ordinality as t(elem, idx)
    where t.idx = 1),
  'previous season winners start at position one');

-- ----------------------------------------------------------------------------
-- F. Anonymous access
-- ----------------------------------------------------------------------------
reset role;
set role anon;

select public.tap_ok(
  (select count(*) >= 12 from public.seasons),
  'anonymous visitors can read the season catalog');

select public.tap_ok(
  (select (public.current_season() ->> 'code') is not null),
  'anonymous visitors can read the current season');

select public.tap_ok(
  (select count(*) >= 1 from public.season_leaderboard(null, 10)),
  'anonymous visitors can read season standings');

select public.tap_fails(
  $sql$ select public.my_season_standing() $sql$,
  'anonymous visitors cannot read a personal season record');

reset role;

select public.tap_ok(true, 'season suite complete');
