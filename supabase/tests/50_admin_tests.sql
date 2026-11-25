-- ============================================================================
-- 50_admin_tests.sql - moderation console (migration 0013)
-- ============================================================================

-- A plain hunter must not reach the console, and must not be able to promote
-- themselves. ShadowRider is an ordinary hunter at this point.
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  public.is_staff() = false,
  'an ordinary hunter is not staff');

select public.tap_fails(
  $sql$ select public.admin_overview() $sql$,
  'an ordinary hunter cannot read the console overview');

select public.tap_fails(
  $sql$ select * from public.admin_hunters(5, null) $sql$,
  'an ordinary hunter cannot list hunters');

select public.tap_fails(
  $sql$ select public.admin_set_role('11111111-1111-1111-1111-111111111111', 'admin') $sql$,
  'an ordinary hunter cannot promote themselves');

-- ----------------------------------------------------------------------------
-- Promote one hunter to admin out of band, as the project owner would.
-- ----------------------------------------------------------------------------
reset role;
update public.profiles set role = 'admin' where username = 'ShadowRider';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  public.is_staff() = true,
  'an admin is staff');

select public.tap_ok(
  (select (public.admin_overview() ->> 'hunters')::int >= 3),
  'an admin can read the console overview');

select public.tap_ok(
  (select count(*) >= 1 from public.admin_hunters(25, null)),
  'an admin can list hunters');

select public.tap_ok(
  (select count(*) = 1 from public.admin_hunters(25, 'IronWill')),
  'the hunter list can be searched by name');

select public.tap_ok(
  (select (public.admin_set_role('22222222-2222-2222-2222-222222222222', 'moderator') ->> 'role') = 'moderator'),
  'an admin can promote a hunter to moderator');

select public.tap_ok(
  (select (public.admin_set_role('22222222-2222-2222-2222-222222222222', 'hunter') ->> 'role') = 'hunter'),
  'an admin can return a moderator to hunter');

select public.tap_fails(
  $sql$ select public.admin_set_role('11111111-1111-1111-1111-111111111111', 'hunter') $sql$,
  'an admin cannot change their own role');

select public.tap_fails(
  $sql$ select public.admin_set_role('22222222-2222-2222-2222-222222222222', 'admin') $sql$,
  'admin rights cannot be granted through the API');

select public.tap_fails(
  $sql$ select public.admin_set_role('99999999-9999-9999-9999-999999999999', 'moderator') $sql$,
  'an unknown hunter cannot receive a role');

-- The notification is written for the target hunter; RLS means only they can
-- read it, so the check runs as the owner of the database.
reset role;

select public.tap_ok(
  (select count(*) >= 1 from public.notifications
    where user_id = '22222222-2222-2222-2222-222222222222'
      and title = 'System role updated'),
  'a role change notifies the hunter');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select count(*) = 0 from public.notifications
    where user_id = '22222222-2222-2222-2222-222222222222'),
  'even staff cannot read another hunter notifications');

-- ----------------------------------------------------------------------------
-- A moderator can read, but cannot change roles.
-- ----------------------------------------------------------------------------
reset role;
update public.profiles set role = 'moderator' where username = 'IronWill';
update public.profiles set role = 'hunter' where username = 'ShadowRider';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  public.is_staff() = true,
  'a moderator is staff');

select public.tap_ok(
  (select (public.admin_overview() ->> 'hunters')::int >= 3),
  'a moderator can read the console overview');

select public.tap_fails(
  $sql$ select public.admin_set_role('33333333-3333-3333-3333-333333333333', 'moderator') $sql$,
  'a moderator cannot change roles');

reset role;

-- ----------------------------------------------------------------------------
-- Anonymous callers cannot reach the console at all.
-- ----------------------------------------------------------------------------
set role anon;

select public.tap_fails(
  $sql$ select public.admin_overview() $sql$,
  'anonymous visitors cannot read the console overview');

select public.tap_fails(
  $sql$ select * from public.admin_hunters(5, null) $sql$,
  'anonymous visitors cannot list hunters');

select public.tap_fails(
  $sql$ select public.is_staff() $sql$,
  'anonymous visitors cannot probe staff status');

reset role;

update public.profiles set role = 'hunter' where username = 'IronWill';

select public.tap_ok(true, 'admin suite complete');
