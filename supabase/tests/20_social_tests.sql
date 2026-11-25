-- ============================================================================
-- 20_social_tests.sql - friends and guilds (migrations 0009 / 0010)
-- ----------------------------------------------------------------------------
-- Runs after 10_engine_tests.sql in the same database, so the three surviving
-- hunters from that suite are reused:
--   1111… ShadowRider (bulk of the study data)
--   2222… IronWill
--   3333… QuietScholar
-- Helpers tap_ok / tap_fails come from 10_engine_tests.sql.
-- ============================================================================

-- Suite 10 leaves QuietScholar private; the social tests need all three
-- hunters reachable, so restore the defaults before starting.
update public.profiles
   set is_public = true, show_on_leaderboard = true
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222',
              '33333333-3333-3333-3333-333333333333');

-- ----------------------------------------------------------------------------
-- A. Friend request lifecycle
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select (public.send_friend_request('IronWill') ->> 'status') = 'pending'),
  'a hunter can send a friend request by handle');

select public.tap_fails(
  $sql$ select public.send_friend_request('IronWill') $sql$,
  'a duplicate friend request is rejected');

select public.tap_fails(
  $sql$ select public.send_friend_request('ShadowRider') $sql$,
  'a hunter cannot befriend themselves');

select public.tap_fails(
  $sql$ select public.send_friend_request('GhostHunter') $sql$,
  'a request to an unknown handle is rejected');

select public.tap_fails(
  $sql$ select public.respond_friend_request('22222222-2222-2222-2222-222222222222', true) $sql$,
  'only the addressee can accept a request');

-- ----------------------------------------------------------------------------
-- B. The addressee accepts
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select public.tap_ok(
  (select jsonb_array_length(public.list_friend_requests() -> 'incoming') = 1),
  'the addressee sees one incoming request');

select public.tap_ok(
  (select (public.respond_friend_request('11111111-1111-1111-1111-111111111111', true) ->> 'accepted')::boolean),
  'the addressee can accept the request');

select public.tap_ok(
  public.are_friends('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  'accepting creates a mutual friendship');

select public.tap_ok(
  (select count(*) = 1 from public.list_friends()),
  'the addressee sees the new friend in their roster');

select public.tap_ok(
  (select jsonb_array_length(public.list_friend_requests() -> 'incoming') = 0),
  'an accepted request leaves the pending inbox');

-- ----------------------------------------------------------------------------
-- C. Mutual requests auto-accept the other way round
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select (public.send_friend_request('QuietScholar') ->> 'status') = 'pending'),
  'a second friend request starts as pending');

set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select public.tap_ok(
  (select (public.send_friend_request('ShadowRider') ->> 'status') = 'accepted'),
  'a mirrored request is accepted immediately');

select public.tap_ok(
  public.are_friends('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  'the mirrored request creates the friendship');

-- Isolation: a hunter who is not part of a friendship cannot read it.
select public.tap_ok(
  (select count(*) = 0 from public.friendships
    where requester_id = '11111111-1111-1111-1111-111111111111'
      and addressee_id = '22222222-2222-2222-2222-222222222222'),
  'a hunter cannot read a friendship they are not part of');

select public.tap_fails(
  $sql$ insert into public.friendships (requester_id, addressee_id, status)
        values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'accepted') $sql$,
  'friendships cannot be written directly');

-- ----------------------------------------------------------------------------
-- D. Searching hunters
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select relationship from public.search_hunters('Quiet') where username = 'QuietScholar') = 'self',
  'search marks the caller as self');

select public.tap_ok(
  (select relationship from public.search_hunters('Shad') where username = 'ShadowRider') = 'friend',
  'search marks an existing friend');

select public.tap_ok(
  (select relationship from public.search_hunters('Iron') where username = 'IronWill') = 'none',
  'search marks an unrelated hunter as none');

select public.tap_ok(
  (select count(*) = 0 from public.search_hunters('a')),
  'search ignores terms shorter than two characters');

-- ----------------------------------------------------------------------------
-- E. Friends leaderboard
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select count(*) = 3 from public.friend_leaderboard('all', 50)),
  'the friends board contains the caller and their two friends');

select public.tap_ok(
  (select count(*) = 1 from public.friend_leaderboard('all', 50) where is_me),
  'the friends board flags the caller exactly once');

select public.tap_ok(
  (select bool_and(rank_position = 1
                   or period_xp <= (select min(b.period_xp) from public.friend_leaderboard('all', 50) b
                                     where b.rank_position < a.rank_position))
     from public.friend_leaderboard('all', 50) a),
  'the friends board is ordered by descending XP');

select public.tap_ok(
  (select count(*) = 0 from public.friend_leaderboard('all', 50)
    where user_id not in ('11111111-1111-1111-1111-111111111111',
                          '22222222-2222-2222-2222-222222222222',
                          '33333333-3333-3333-3333-333333333333')),
  'the friends board never leaks hunters outside the circle');

-- ----------------------------------------------------------------------------
-- F. Unfriending
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select public.tap_ok(
  (select (public.remove_friend('11111111-1111-1111-1111-111111111111') ->> 'removed')::int = 1),
  'a hunter can remove a friend');

select public.tap_ok(
  not public.are_friends('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  'removing a friend breaks the link both ways');

select public.tap_ok(
  (select count(*) = 0 from public.list_friends()),
  'the removed friend is gone from the roster');

-- ----------------------------------------------------------------------------
-- G. Guild creation
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select (public.create_guild('Blue Gate', 'BG', 'Weekly grind squad', true, '#38e1ff') ->> 'guild_id') is not null),
  'a hunter can found a guild');

select public.tap_ok(
  (select role from public.guild_members gm
    where gm.user_id = '11111111-1111-1111-1111-111111111111') = 'leader',
  'the founder becomes the guild leader');

select public.tap_fails(
  $sql$ select public.create_guild('Second Guild', 'SG') $sql$,
  'a hunter cannot belong to two guilds');

-- Another hunter cannot reuse the name.
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select public.tap_fails(
  $sql$ select public.create_guild('Blue Gate', 'BG') $sql$,
  'guild names are unique');

select public.tap_fails(
  $sql$ select public.create_guild('Rogue Squad', 'NOTATAG') $sql$,
  'guild tags are validated');

-- ----------------------------------------------------------------------------
-- H. Joining and the guild board
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select (public.join_guild((select id from public.guilds where slug = 'blue-gate')) ->> 'guild_id') is not null),
  'a hunter can join an open guild');

select public.tap_fails(
  $sql$ select public.join_guild((select id from public.guilds where slug = 'blue-gate')) $sql$,
  'joining twice is rejected');

set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select public.tap_ok(
  (select (public.join_guild((select id from public.guilds where slug = 'blue-gate')) ->> 'guild_id') is not null),
  'a third hunter can join the guild');

select public.tap_ok(
  (select member_count = 3 from public.guild_leaderboard('week', 20, null) where slug = 'blue-gate'),
  'the guild board counts members');

select public.tap_ok(
  (select is_my_guild from public.guild_leaderboard('week', 20, null) where slug = 'blue-gate'),
  'the guild board flags the caller''s own guild');

select public.tap_ok(
  (select jsonb_array_length(public.guild_detail('blue-gate') -> 'members') = 3),
  'guild detail lists the full roster');

reset role;
set role anon;

select public.tap_ok(
  (select (public.guild_detail('blue-gate') ->> 'member_count')::int = 3),
  'anonymous visitors can view a guild hall');

select public.tap_fails(
  $sql$ select count(*) from public.friendships $sql$,
  'anonymous visitors cannot read friendships');

select public.tap_fails(
  $sql$ select count(*) from public.guild_members $sql$,
  'anonymous visitors cannot read guild membership rows');

select public.tap_ok(
  (select count(*) >= 1 from public.guild_leaderboard('week', 20, null)),
  'anonymous visitors can read the guild board');

reset role;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set role authenticated;

-- Members cannot change guild settings; the leader can.
select public.tap_fails(
  $sql$ select public.update_my_guild(p_is_open := false) $sql$,
  'a plain member cannot change guild settings');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select (public.update_my_guild(p_is_open := false) ->> 'is_open')::boolean = false),
  'the leader can close the guild to new members');

select public.tap_ok(
  (select not (public.guild_detail('blue-gate') ->> 'is_open')::boolean),
  'guild detail reflects the closed state');

-- ----------------------------------------------------------------------------
-- I. Ranks inside the guild
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select public.tap_fails(
  $sql$ select public.set_guild_member_role('33333333-3333-3333-3333-333333333333', 'officer') $sql$,
  'only the leader can hand out guild roles');

select public.tap_fails(
  $sql$ select public.remove_guild_member('33333333-3333-3333-3333-333333333333') $sql$,
  'a plain member cannot remove another member');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select (public.set_guild_member_role('22222222-2222-2222-2222-222222222222', 'officer') ->> 'role') = 'officer'),
  'the leader can promote an officer');

select public.tap_fails(
  $sql$ select public.remove_guild_member('11111111-1111-1111-1111-111111111111') $sql$,
  'the leader cannot remove themselves through the roster');

select public.tap_ok(
  (select (public.remove_guild_member('33333333-3333-3333-3333-333333333333') ->> 'removed')::int = 1),
  'the leader can remove a member');

select public.tap_ok(
  (select count(*) = 0 from public.guild_members
    where user_id = '33333333-3333-3333-3333-333333333333'),
  'a removed member is no longer in the guild');

select public.tap_fails(
  $sql$ insert into public.guild_members (guild_id, user_id)
        select id, '33333333-3333-3333-3333-333333333333' from public.guilds where slug = 'blue-gate' $sql$,
  'guild membership cannot be written directly');

-- ----------------------------------------------------------------------------
-- J. Leaving, leadership transfer and dissolution
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select (public.leave_guild() ->> 'left')::boolean),
  'the leader can leave the guild');

select public.tap_ok(
  (select role from public.guild_members
    where user_id = '22222222-2222-2222-2222-222222222222') = 'leader',
  'leadership transfers to the longest-serving officer');

select public.tap_ok(
  (select owner_id = '22222222-2222-2222-2222-222222222222' from public.guilds where slug = 'blue-gate'),
  'the guild owner follows the leadership transfer');

select public.tap_fails(
  $sql$ select public.leave_guild() $sql$,
  'a hunter who is not in a guild cannot leave one');

set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select public.tap_ok(
  (select (public.leave_guild() ->> 'dissolved')::boolean),
  'the last member dissolves the guild');

reset role;

select public.tap_ok(
  (select count(*) = 0 from public.guilds where slug = 'blue-gate'),
  'a dissolved guild is removed from the registry');

select public.tap_ok(
  (select count(*) = 0 from public.guild_members),
  'a dissolved guild leaves no orphaned members');

-- ----------------------------------------------------------------------------
-- K. Privacy
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select public.tap_ok(
  (select (public.update_my_profile(p_is_public := false) ->> 'is_public')::boolean = false),
  'a hunter can go private');

select public.tap_fails(
  $sql$ select public.send_friend_request('QuietScholar') $sql$,
  'a private hunter cannot be reached by handle');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.tap_ok(
  (select count(*) = 0 from public.search_hunters('Quiet')),
  'private hunters never appear in search');

select public.tap_ok(
  (select count(*) = 0 from public.friend_leaderboard('all', 50) where username = 'QuietScholar'),
  'private hunters never appear on the friends board');

reset role;

select public.tap_ok(true, 'social suite complete');
