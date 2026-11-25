-- ============================================================================
-- 40_public_surface_tests.sql - what an unauthenticated visitor may read
-- ----------------------------------------------------------------------------
-- Pins the split enforced by 0004 (RLS) and 0012 (column grants): anonymous
-- readers see public hunter cards, but never behavioural columns, private
-- study records, or server-controlled counters on their own row.
-- ============================================================================

set role anon;

-- ----------------------------------------------------------------------------
-- A. Public hunter card
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select count(*) > 0 from public.profiles),
  'anonymous readers can list public hunter cards');

select public.tap_ok(
  (select count(*) from public.profiles where username is not null) >= 1,
  'anonymous readers can read the public identity columns');

select public.tap_fails(
  $sql$ select timezone from public.profiles limit 1 $sql$,
  'anonymous readers cannot read a hunter timezone');

select public.tap_fails(
  $sql$ select daily_goal_minutes from public.profiles limit 1 $sql$,
  'anonymous readers cannot read a hunter daily goal');

select public.tap_fails(
  $sql$ select role from public.profiles limit 1 $sql$,
  'anonymous readers cannot read the account role column');

select public.tap_fails(
  $sql$ select last_study_date from public.profiles limit 1 $sql$,
  'anonymous readers cannot read a hunter last study date');

select public.tap_fails(
  $sql$ select * from public.profiles limit 1 $sql$,
  'anonymous readers cannot select whole profile rows');

select public.tap_fails(
  $sql$ select show_on_leaderboard from public.profiles limit 1 $sql$,
  'anonymous readers cannot read leaderboard preference flags');

-- ----------------------------------------------------------------------------
-- B. Private study records stay closed
-- ----------------------------------------------------------------------------
select public.tap_fails(
  $sql$ select * from public.study_sessions limit 1 $sql$,
  'anonymous readers cannot read study sessions');

select public.tap_fails(
  $sql$ select * from public.subjects limit 1 $sql$,
  'anonymous readers cannot read subjects');

select public.tap_fails(
  $sql$ select * from public.topics limit 1 $sql$,
  'anonymous readers cannot read topics');

select public.tap_fails(
  $sql$ select * from public.xp_transactions limit 1 $sql$,
  'anonymous readers cannot read the XP ledger');

select public.tap_fails(
  $sql$ select * from public.notifications limit 1 $sql$,
  'anonymous readers cannot read notifications');

select public.tap_fails(
  $sql$ select * from public.user_achievements limit 1 $sql$,
  'anonymous readers cannot read unlocked achievements');

select public.tap_fails(
  $sql$ select * from public.quests limit 1 $sql$,
  'anonymous readers cannot read personal quests');

-- ----------------------------------------------------------------------------
-- C. Anonymous writes are impossible
-- ----------------------------------------------------------------------------
select public.tap_fails(
  $sql$ insert into public.xp_transactions (user_id, source_type, amount)
       values ('11111111-1111-1111-1111-111111111111', 'bonus', 9999) $sql$,
  'anonymous callers cannot write XP');

select public.tap_fails(
  $sql$ update public.profiles set xp_total = 999999 $sql$,
  'anonymous callers cannot raise a hunter XP total');

-- ----------------------------------------------------------------------------
-- D. The leaderboard RPC is the sanctioned public surface
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select count(*) > 0 from public.leaderboard('all', 5, 0, null)),
  'anonymous readers can use the leaderboard RPC');

select public.tap_ok(
  (select pg_get_function_result(p.oid) not like '%timezone%'
      and pg_get_function_result(p.oid) not like '%daily_goal%'
      and pg_get_function_result(p.oid) not like '%last_study_date%'
      and pg_get_function_result(p.oid) not like '%role%'
      and pg_get_function_result(p.oid) not like '%email%'
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'leaderboard'
    limit 1),
  'the leaderboard RPC returns only public hunter-card fields');

reset role;

select public.tap_ok(true, 'public surface suite complete');
