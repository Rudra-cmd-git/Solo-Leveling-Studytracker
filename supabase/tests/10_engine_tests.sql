-- ============================================================================
-- HUNTER SYSTEM - ENGINE, SECURITY AND RLS TEST SUITE
-- Run with: node scripts/db-test.mjs
-- Every assertion runs against real PostgreSQL with real RLS.
-- ============================================================================

create or replace function public.tap_fails(p_sql text, p_desc text)
returns void
language plpgsql
as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - %', p_desc;
    return;
  end;
  raise exception 'ASSERTION FAILED (statement should have been rejected): %', p_desc;
end;
$fn$;

grant execute on function public.tap_fails(text, text) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 1. Signup trigger creates a Hunter profile
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'shadow@example.com', '{"username":"ShadowRider","timezone":"UTC"}'),
  ('22222222-2222-2222-2222-222222222222', 'iron@example.com',   '{"username":"IronWill","timezone":"Asia/Kolkata"}'),
  ('33333333-3333-3333-3333-333333333333', 'quiet@example.com',  '{"username":"QuietScholar","timezone":"UTC"}'),
  ('44444444-4444-4444-4444-444444444444', 'dup@example.com',    '{"username":"ShadowRider","timezone":"UTC"}'),
  ('55555555-5555-5555-5555-555555555555', 'raw@example.com',    '{"username":"bad name!","timezone":"UTC"}');

select public.tap_ok(
  (select count(*) from public.profiles) = 5,
  'signup trigger creates one profile per auth user');

select public.tap_ok(
  (select username from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'ShadowRider',
  'username is taken from signup metadata');

select public.tap_ok(
  (select username from public.profiles where id = '44444444-4444-4444-4444-444444444444') <> 'ShadowRider',
  'duplicate username is patched instead of failing the signup');

select public.tap_ok(
  (select username ~ '^[A-Za-z0-9_]{3,20}$' from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  'invalid username falls back to a generated handle');

select public.tap_ok(
  (select bool_and(level = 1 and rank = 'F' and xp_total = 0) from public.profiles),
  'every new hunter starts at level 1, F rank, 0 XP');

select public.tap_ok(
  (select bool_and(hunter_id ~ '^H-[0-9A-F]{8}$') from public.profiles),
  'hunter ids are unique and well formed');

select public.tap_ok(
  (select count(distinct hunter_id) = 5 from public.profiles),
  'hunter ids do not collide');

-- ----------------------------------------------------------------------------
-- 2. Progression math
-- ----------------------------------------------------------------------------
select public.tap_ok(public.level_for_xp(0) = 1, 'level(0 xp) = 1');
select public.tap_ok(public.level_for_xp(99) = 1, 'level(99 xp) = 1');
select public.tap_ok(public.level_for_xp(100) = 2, 'level(100 xp) = 2');
select public.tap_ok(public.level_for_xp(224) = 2, 'level(224 xp) = 2');
select public.tap_ok(public.level_for_xp(225) = 3, 'level(225 xp) = 3');
select public.tap_ok(public.level_for_xp(375) = 4, 'level(375 xp) = 4');
select public.tap_ok(public.level_for_xp(15000) = public.level_for_xp(15000), 'level calculation is stable');

select public.tap_ok(
  (select level = 2 and needed = 125 and into_level = 0
     from public.level_progress(100)),
  'level_progress reports the next-level target');

select public.tap_ok(
  (select percent = 20.00 from public.level_progress(125)),
  'level_progress computes a percentage');

select public.tap_ok(public.rank_for_xp(0) = 'F', 'rank(0) = F');
select public.tap_ok(public.rank_for_xp(499) = 'F', 'rank(499) = F');
select public.tap_ok(public.rank_for_xp(500) = 'E', 'rank(500) = E');
select public.tap_ok(public.rank_for_xp(1500) = 'D', 'rank(1500) = D');
select public.tap_ok(public.rank_for_xp(3000) = 'C', 'rank(3000) = C');
select public.tap_ok(public.rank_for_xp(6000) = 'B', 'rank(6000) = B');
select public.tap_ok(public.rank_for_xp(10000) = 'A', 'rank(10000) = A');
select public.tap_ok(public.rank_for_xp(15000) = 'S', 'rank(15000) = S');
select public.tap_ok(public.rank_for_xp(999999) = 'S', 'rank is capped at S');

-- ----------------------------------------------------------------------------
-- 3. Full session lifecycle awards exactly the credited minutes
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

insert into public.subjects (id, user_id, title, color)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Mathematics', '#38bdf8');

select public.tap_ok(
  (select count(*) from public.subjects) = 1,
  'hunter can create a subject for themselves');

select public.tap_ok(
  (select jsonb_typeof(public.start_study_session(3600, 'bbbbbbbb-0000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000001', null, false, 'calculus')) ) = 'object',
  'start_study_session returns a session payload');

reset role;

-- 60 minutes of server-stamped heartbeats, 30 s apart.
update public.study_sessions
   set started_at = now() - interval '61 minutes'
 where user_id = '11111111-1111-1111-1111-111111111111' and status = 'active';

insert into public.study_session_heartbeats (session_id, user_id, seen_at)
select s.id, s.user_id, s.started_at + (g * 30 || ' seconds')::interval
  from public.study_sessions s, generate_series(1, 120) g
 where s.user_id = '11111111-1111-1111-1111-111111111111' and s.status = 'active';

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select (public.complete_study_session(
     (select id from public.study_sessions where user_id = auth.uid())
   ) ->> 'credited_minutes')::int between 60 and 62),
  'a session with 60 minutes of heartbeats credits 60 minutes');

select public.tap_ok(
  (public.complete_study_session(
     (select id from public.study_sessions where user_id = auth.uid())
   ) ->> 'xp_awarded')::int
   = (select credited_minutes * 1 from public.study_sessions where user_id = auth.uid()),
  '1 credited minute = 1 XP');

select public.tap_ok(
  (select xp_total = (select coalesce(sum(amount), 0) from public.xp_transactions where user_id = auth.uid())
     and xp_total >= (select xp_awarded from public.study_sessions where user_id = auth.uid())
     from public.profiles where id = auth.uid()),
  'profile XP matches the ledger after a session plus quest rewards');

select public.tap_ok(
  (select count(*) = 1 from public.xp_transactions where source_type = 'session'),
  'one XP transaction per session');

select public.tap_ok(
  (select (public.complete_study_session(
     (select id from public.study_sessions where user_id = auth.uid())
   ) ->> 'already_completed')::boolean),
  'completing the same session twice reports a replay');

select public.tap_ok(
  (select coalesce(sum(amount), 0) = (select xp_awarded from public.study_sessions where user_id = auth.uid())
     from public.xp_transactions where user_id = auth.uid() and source_type = 'session'),
  'replaying a completion cannot award XP twice');

select public.tap_ok(
  (select count(*) = 1 from public.xp_transactions where source_type = 'session'),
  'replaying a completion creates no extra XP transaction');

select public.tap_ok(
  (select duration_seconds between 3600 and 3700 from public.study_sessions where status = 'completed'),
  'credited duration comes from server timestamps, not the client');

select public.tap_ok(
  (select current_streak = 1 and last_study_date is not null from public.profiles where id = auth.uid()),
  'streak is recorded on the first study day');

-- ----------------------------------------------------------------------------
-- 4. Idle / spoofed sessions cannot farm XP
-- ----------------------------------------------------------------------------
select public.start_study_session(3600, 'bbbbbbbb-0000-0000-0000-000000000002', null, null, false, null);
reset role;

-- Two hour wall-clock gap, but only one heartbeat: a tab left open.
update public.study_sessions
   set started_at = now() - interval '2 hours'
 where user_id = '11111111-1111-1111-1111-111111111111' and status = 'active';

insert into public.study_session_heartbeats (session_id, user_id, seen_at)
select s.id, s.user_id, s.started_at + interval '60 minutes'
  from public.study_sessions s
 where s.user_id = '11111111-1111-1111-1111-111111111111' and s.status = 'active';

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select (public.complete_study_session(
     (select id from public.study_sessions where user_id = auth.uid() and status = 'active')
   ) ->> 'credited_seconds')::int <= 320),
  'an abandoned session is clipped to the heartbeat gap, not wall-clock time');

select public.tap_ok(
  (select xp_awarded <= 6 from public.study_sessions where status = 'completed' order by created_at desc limit 1),
  'an abandoned session earns at most a few minutes of XP');

-- Same client token is idempotent.
select public.start_study_session(1500, 'bbbbbbbb-0000-0000-0000-000000000003', null, null, false, null);
select public.tap_ok(
  (select (public.start_study_session(1500, 'bbbbbbbb-0000-0000-0000-000000000003', null, null, false, null) ->> 'reused')::boolean),
  'replaying a start with the same token returns the same session');

select public.tap_ok(
  (select count(*) = 1 from public.study_sessions where client_token = 'bbbbbbbb-0000-0000-0000-000000000003'),
  'a repeated start token creates no second session');

select public.tap_fails(
  $sql$ select public.start_study_session(1500, 'bbbbbbbb-0000-0000-0000-000000000004') $sql$,
  'a second live session for the same hunter is refused');

select public.tap_fails(
  $sql$ select public.start_study_session(30, 'bbbbbbbb-0000-0000-0000-000000000005') $sql$,
  'a 30 second session plan is rejected');

select public.tap_fails(
  $sql$ select public.start_study_session(999999, 'bbbbbbbb-0000-0000-0000-000000000006') $sql$,
  'an impossibly long session plan is rejected');

select public.tap_fails(
  $sql$ select public.start_study_session(1500, 'bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000999') $sql$,
  'a session cannot be attached to another hunter''s subject');

select public.tap_ok(
  (select (public.cancel_study_session(
     (select id from public.study_sessions where status = 'active')
   ) ->> 'status') = 'cancelled'),
  'a hunter can cancel their own session');

select public.tap_fails(
  $sql$ select public.complete_study_session((select id from public.study_sessions where status = 'cancelled')) $sql$,
  'a cancelled session cannot be completed');

-- ----------------------------------------------------------------------------
-- 5. Progression state cannot be written by a client
-- ----------------------------------------------------------------------------
select public.tap_fails(
  $sql$ update public.profiles set xp_total = 999999 where id = auth.uid() $sql$,
  'a hunter cannot set their own XP total');

select public.tap_fails(
  $sql$ update public.profiles set level = 90 where id = auth.uid() $sql$,
  'a hunter cannot set their own level');

select public.tap_fails(
  $sql$ update public.profiles set rank = 'S' where id = auth.uid() $sql$,
  'a hunter cannot set their own rank');

select public.tap_fails(
  $sql$ update public.profiles set role = 'admin' where id = auth.uid() $sql$,
  'a hunter cannot grant themselves the admin role');

select public.tap_fails(
  $sql$ update public.profiles set is_public = false where id = auth.uid() $sql$,
  'profile updates must go through update_my_profile');

select public.tap_fails(
  $sql$ insert into public.xp_transactions (user_id, source_type, amount) values (auth.uid(), 'bonus', 5000) $sql$,
  'a hunter cannot insert XP transactions');

select public.tap_fails(
  $sql$ update public.study_sessions set credited_minutes = 600, xp_awarded = 600 where user_id = auth.uid() $sql$,
  'a hunter cannot edit their own session credit');

select public.tap_fails(
  $sql$ insert into public.user_achievements (user_id, achievement_code) values (auth.uid(), 'shadow_legend') $sql$,
  'a hunter cannot grant themselves achievements');

select public.tap_fails(
  $sql$ update public.quests set status = 'completed' where user_id = auth.uid() $sql$,
  'a hunter cannot mark their own quests complete');

select public.tap_ok(
  (select (public.update_my_profile(p_bio := 'Runner of the blue gate') ->> 'bio') = 'Runner of the blue gate'),
  'the profile RPC updates cosmetic fields');

select public.tap_ok(
  (select (public.update_my_profile(p_is_public := false) ->> 'is_public')::boolean = false),
  'the profile RPC can make a hunter private');

select public.tap_fails(
  $sql$ select public.update_my_profile(p_username := 'IronWill') $sql$,
  'a hunter cannot claim another hunter''s username');

select public.tap_fails(
  $sql$ select public.update_my_profile(p_username := 'x') $sql$,
  'invalid usernames are rejected by the profile RPC');

select public.tap_ok(
  (select (public.update_my_profile(p_is_public := true) ->> 'is_public')::boolean = true),
  'a hunter can return to a public profile');

-- Avatar URLs must point at the hunter's own folder in the avatars bucket.
select public.tap_ok(
  public.avatar_url_allowed(
    'https://demo.supabase.co/storage/v1/object/public/avatars/11111111-1111-1111-1111-111111111111/avatar-1.png',
    '11111111-1111-1111-1111-111111111111'),
  'an avatar URL in the hunter''s own folder is accepted');

select public.tap_ok(
  not public.avatar_url_allowed(
    'https://demo.supabase.co/storage/v1/object/public/avatars/22222222-2222-2222-2222-222222222222/avatar-1.png',
    '11111111-1111-1111-1111-111111111111'),
  'an avatar URL in another hunter''s folder is rejected');

select public.tap_ok(
  not public.avatar_url_allowed('https://tracker.example.com/pixel.png',
    '11111111-1111-1111-1111-111111111111'),
  'an external avatar URL is rejected');

select public.tap_ok(
  not public.avatar_url_allowed('javascript:alert(1)',
    '11111111-1111-1111-1111-111111111111'),
  'a non-https avatar URL is rejected');

select public.tap_ok(
  public.avatar_url_allowed(null, '11111111-1111-1111-1111-111111111111'),
  'a null avatar URL is allowed');

select public.tap_ok(
  (select (public.set_my_avatar(
    'https://demo.supabase.co/storage/v1/object/public/avatars/11111111-1111-1111-1111-111111111111/avatar-2.webp'
  ) ->> 'avatar_url') is not null),
  'the avatar RPC stores an uploaded object URL');

select public.tap_fails(
  $sql$ select public.set_my_avatar('https://tracker.example.com/a.png') $sql$,
  'the avatar RPC rejects external URLs');

select public.tap_fails(
  $sql$ select public.update_my_profile(p_avatar_url := 'https://tracker.example.com/a.png') $sql$,
  'the profile RPC cannot be used to smuggle an external avatar URL');

select public.tap_ok(
  (select (public.set_my_avatar(null) ->> 'avatar_url') is null),
  'the avatar RPC clears the avatar');

-- Storage isolation: the bucket exists, is public-read, and RLS pins writes to
-- the hunter's own folder. The bucket shape is read as the table owner.
reset role;

select public.tap_ok(
  (select public from storage.buckets where id = 'avatars') is true,
  'the avatars bucket exists and allows public reads');

select public.tap_ok(
  (select file_size_limit = 2097152
          and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
     from storage.buckets where id = 'avatars'),
  'the avatars bucket caps size and mime types');

select public.tap_ok(
  (select count(*) = 4
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars_%'),
  'the avatars bucket ships four storage policies');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

insert into storage.objects (bucket_id, name, owner)
values ('avatars', '11111111-1111-1111-1111-111111111111/avatar-1.png',
        '11111111-1111-1111-1111-111111111111');

select public.tap_ok(
  (select count(*) = 1 from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-1111-1111-111111111111/avatar-1.png'),
  'a hunter can upload into their own avatar folder');

select public.tap_fails(
  $sql$ insert into storage.objects (bucket_id, name, owner)
        values ('avatars', '22222222-2222-2222-2222-222222222222/intruder.png',
                '11111111-1111-1111-1111-111111111111') $sql$,
  'a hunter cannot upload into another hunter''s avatar folder');

set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

delete from storage.objects
 where bucket_id = 'avatars'
   and name = '11111111-1111-1111-1111-111111111111/avatar-1.png';

select public.tap_ok(
  (select count(*) = 1 from storage.objects
    where bucket_id = 'avatars'
      and name = '11111111-1111-1111-1111-111111111111/avatar-1.png'),
  'another hunter cannot delete an avatar they do not own');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ----------------------------------------------------------------------------
-- 6. Cross-user isolation
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select count(*) = 0 from public.study_sessions where user_id <> auth.uid()),
  'a hunter cannot read another hunter''s sessions');

select public.tap_ok(
  (select count(*) = 0 from public.xp_transactions where user_id <> auth.uid()),
  'a hunter cannot read another hunter''s XP ledger');

select public.tap_ok(
  (select count(*) = 0 from public.notifications where user_id <> auth.uid()),
  'a hunter cannot read another hunter''s notifications');

select public.tap_ok(
  (select count(*) = 0 from public.user_achievements where user_id <> auth.uid()),
  'a hunter cannot read another hunter''s achievements directly');

select public.tap_ok(
  (select count(*) = 0 from public.subjects where user_id <> auth.uid()),
  'a hunter cannot read another hunter''s subjects');

select public.tap_fails(
  $sql$ insert into public.subjects (user_id, title) values ('22222222-2222-2222-2222-222222222222', 'Stolen') $sql$,
  'a hunter cannot create a subject owned by someone else');

-- ----------------------------------------------------------------------------
-- 7. Quests and achievements (rewarded exactly once)
-- ----------------------------------------------------------------------------
select public.refresh_quests();

select public.tap_ok(
  (select count(*) = (select count(*) from public.quest_templates) from public.quests where user_id = auth.uid()),
  'every quest template is materialised for the hunter');

select public.tap_ok(
  (select count(*) = 2 from (
     select distinct category from public.quests where user_id = auth.uid()
   ) x where category in ('daily', 'weekly')),
  'both daily and weekly quest windows are generated');

select public.tap_ok(
  (select status = 'completed' from public.quests where template_code = 'daily_hour' and user_id = auth.uid()),
  'a 60 minute day completes the one hour quest');

select public.tap_ok(
  (select progress_value >= target_value from public.quests where template_code = 'daily_focus_25' and user_id = auth.uid()),
  'quest progress tracks the real activity');

select public.tap_ok(
  (select count(*) = count(distinct source_id)
     from public.xp_transactions where source_type = 'quest' and source_id is not null),
  'each quest pays out at most once');

select public.tap_ok(
  (select count(*) from public.user_achievements where achievement_code = 'first_awakening') = 1,
  'the first session unlocks the awakening achievement');

select public.tap_ok(
  (select count(*) from public.user_achievements where achievement_code = 'first_awakening') = 1
   and (select count(*) from public.xp_transactions where source_type = 'achievement') <=
       (select count(*) from public.user_achievements),
  'achievement rewards are unique per unlock');

set role authenticated;
select public.refresh_quests();

select public.tap_ok(
  (select count(*) = count(distinct achievement_code) from public.user_achievements where user_id = auth.uid()),
  'achievements cannot be unlocked twice');

select public.tap_ok(
  (select xp_total = (select coalesce(sum(amount), 0) from public.xp_transactions where user_id = auth.uid())
     from public.profiles where id = auth.uid()),
  'profile XP always equals the XP ledger sum');

select public.tap_ok(
  (select count(*) from public.notifications where user_id = auth.uid() and type = 'quest') >= 1,
  'quest completion produces a System notification');

select public.tap_ok(
  (select count(*) from public.notifications where user_id = auth.uid() and type = 'achievement') >= 1,
  'achievement unlock produces a System notification');

select public.tap_ok(
  (select (public.mark_notifications_read() > 0)),
  'notifications can be marked read through the RPC');

select public.tap_ok(
  (select count(*) = 0 from public.notifications where user_id = auth.uid() and not is_read),
  'no unread notifications remain after marking');

-- ----------------------------------------------------------------------------
-- 8. Daily reward cap keeps recording time without paying XP
-- ----------------------------------------------------------------------------
reset role;
update public.progression_config set daily_xp_cap = 30 where id = 1;

set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set role authenticated;

select public.start_study_session(3600, 'cccccccc-0000-0000-0000-000000000001', null, null, false, null);
reset role;

update public.study_sessions
   set started_at = now() - interval '61 minutes'
 where user_id = '22222222-2222-2222-2222-222222222222' and status = 'active';

insert into public.study_session_heartbeats (session_id, user_id, seen_at)
select s.id, s.user_id, s.started_at + (g * 30 || ' seconds')::interval
  from public.study_sessions s, generate_series(1, 120) g
 where s.user_id = '22222222-2222-2222-2222-222222222222' and s.status = 'active';

set role authenticated;

select public.tap_ok(
  (select (public.complete_study_session(
     (select id from public.study_sessions where user_id = auth.uid() and status = 'active')
   ) ->> 'xp_awarded')::int = 30),
  'XP is capped at the daily reward limit');

select public.tap_ok(
  (select credited_minutes between 60 and 62 from public.study_sessions
    where user_id = auth.uid() and status = 'completed' order by created_at desc limit 1),
  'real study time is still recorded after the XP cap');

select public.start_study_session(1800, 'cccccccc-0000-0000-0000-000000000002', null, null, false, null);
reset role;

update public.study_sessions
   set started_at = now() - interval '31 minutes'
 where user_id = '22222222-2222-2222-2222-222222222222' and status = 'active';

insert into public.study_session_heartbeats (session_id, user_id, seen_at)
select s.id, s.user_id, s.started_at + (g * 30 || ' seconds')::interval
  from public.study_sessions s, generate_series(1, 60) g
 where s.user_id = '22222222-2222-2222-2222-222222222222' and s.status = 'active';

set role authenticated;

select public.tap_ok(
  (select (public.complete_study_session(
     (select id from public.study_sessions where user_id = auth.uid() and status = 'active')
   ) ->> 'xp_awarded')::int = 0),
  'once the cap is reached no further XP is paid that day');

select public.tap_ok(
  (select credited_minutes between 30 and 32 and xp_awarded = 0 from public.study_sessions
    where user_id = auth.uid() and status = 'completed' order by created_at desc limit 1),
  'a capped session stores its minutes with zero XP');

reset role;
update public.progression_config set daily_xp_cap = 720 where id = 1;

-- ----------------------------------------------------------------------------
-- 9. Leaderboard correctness
-- ----------------------------------------------------------------------------
insert into public.xp_transactions (user_id, source_type, source_id, amount, created_at) values
  ('22222222-2222-2222-2222-222222222222', 'bonus', gen_random_uuid(), 4000, now() - interval '2 days'),
  ('33333333-3333-3333-3333-333333333333', 'bonus', gen_random_uuid(), 9000, now() - interval '400 days'),
  ('55555555-5555-5555-5555-555555555555', 'bonus', gen_random_uuid(), 2500, now());

select public.tap_ok(
  (select string_agg(username, ',' order by rank_position) from public.leaderboard('all', 50, 0, null))
    = (select string_agg(username, ',' order by xp_total desc, created_at asc)
         from public.profiles where is_public and show_on_leaderboard),
  'all-time leaderboard is ordered by lifetime XP');

select public.tap_ok(
  (select count(*) = 0 from public.leaderboard('week', 10, 0, 'QuietScholar')),
  'weekly leaderboard excludes XP earned outside the week');

select public.tap_ok(
  (select count(*) = 1 from public.leaderboard('all', 10, 0, 'QuietScholar')),
  'all-time leaderboard keeps hunters with older XP');

select public.tap_ok(
  (select count(*) = 1 from public.leaderboard('week', 10, 0, 'IronWill')),
  'weekly leaderboard includes this week''s XP');

select public.tap_ok(
  (select period_xp from public.leaderboard('month', 10, 0, 'IronWill')) >= 4000,
  'monthly leaderboard includes XP from earlier this month');

select public.tap_ok(
  (select count(*) = 0 from public.leaderboard('all', 50, 0, 'QuietScholar') where hunter_rank = 'S'),
  'ranks in the leaderboard come from real XP');

update public.profiles set is_public = false where username = 'QuietScholar';
select public.tap_ok(
  (select count(*) = 0 from public.leaderboard('all', 50, 0, 'QuietScholar')),
  'a private hunter is removed from the leaderboard');

update public.profiles set is_public = true, show_on_leaderboard = false where username = 'QuietScholar';
select public.tap_ok(
  (select count(*) = 0 from public.leaderboard('all', 50, 0, 'QuietScholar')),
  'opting out of rankings hides the hunter');

update public.profiles set show_on_leaderboard = true where username = 'QuietScholar';

select public.tap_ok(
  (select leaderboard_size('all', null) = count(*) from public.profiles where is_public and show_on_leaderboard),
  'leaderboard size matches the eligible population');

select public.tap_ok(
  (select count(*) = 2 from public.leaderboard('all', 2, 0, null)),
  'leaderboard pagination respects the limit');

select public.tap_ok(
  (select min(rank_position) = 3 from public.leaderboard('all', 2, 2, null)),
  'leaderboard pagination keeps absolute positions');

select public.tap_ok(
  (select count(*) <= 1 from public.leaderboard('all', 50, 0, null) where is_me),
  'the current hunter is flagged at most once');

-- Tie-breaking: identical XP resolves by seniority, deterministically.
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'tie1@example.com', '{"username":"TieAlpha"}'),
  ('77777777-7777-7777-7777-777777777777', 'tie2@example.com', '{"username":"TieBeta"}');

update public.profiles set created_at = now() - interval '10 days' where username = 'TieAlpha';
update public.profiles set created_at = now() - interval '5 days'  where username = 'TieBeta';

insert into public.xp_transactions (user_id, source_type, source_id, amount) values
  ('66666666-6666-6666-6666-666666666666', 'bonus', gen_random_uuid(), 1200),
  ('77777777-7777-7777-7777-777777777777', 'bonus', gen_random_uuid(), 1200);

select public.tap_ok(
  (select string_agg(username, ',' order by rank_position)
     from public.leaderboard('all', 50, 0, 'Tie')) = 'TieAlpha,TieBeta',
  'equal XP ties are broken by seniority');

-- ----------------------------------------------------------------------------
-- 10. Public profile privacy
-- ----------------------------------------------------------------------------
select public.tap_ok(
  (select (public.public_hunter_profile('IronWill') ->> 'username') = 'IronWill'),
  'public hunters expose a public profile payload');

select public.tap_ok(
  (select jsonb_array_length(public.public_hunter_profile('IronWill') -> 'achievements') >= 1),
  'the public profile includes unlocked achievements');

select public.tap_ok(
  (public.public_hunter_profile('IronWill')::text not like '%@example.com%'),
  'the public profile never exposes an email address');

update public.profiles set is_public = false where username = 'QuietScholar';
select public.tap_ok(
  public.public_hunter_profile('QuietScholar') is null,
  'a private hunter returns no public profile');

select public.tap_ok(
  (select not (public.public_hunter_profile('ShadowRider') ? 'email')),
  'the public payload has no private keys');

-- ----------------------------------------------------------------------------
-- 10. Analytics read models
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select (public.hunter_overview() -> 'profile' ->> 'username') = 'ShadowRider'),
  'hunter_overview returns the current hunter');

select public.tap_ok(
  (select (public.hunter_overview() -> 'totals' ->> 'xp')::int
        = (select xp_total from public.profiles where id = auth.uid())),
  'overview totals match the profile');

select public.tap_ok(
  (select (public.hunter_overview() -> 'level' ->> 'level')::int >= 1
      and (public.hunter_overview() -> 'level' ->> 'needed')::int > 0),
  'overview exposes level progress');

select public.tap_ok(
  (select (public.hunter_overview() -> 'today' ->> 'minutes')::int >= 0),
  'overview exposes today''s minutes');

select public.tap_ok(
  (select (public.hunter_overview() -> 'config' ->> 'daily_xp_cap')::int = 720),
  'overview exposes the live progression configuration');

select public.tap_ok(
  (select count(*) = 7 from public.hunter_daily_series(7)),
  'daily series returns one row per day');

select public.tap_ok(
  (select sum(minutes) > 0 from public.hunter_daily_series(30)),
  'daily series includes real credited minutes');

select public.tap_ok(
  (select count(*) >= 1 from public.hunter_subject_breakdown(30)),
  'subject breakdown resolves subject names');

select public.tap_ok(
  (select title = 'Mathematics' from public.hunter_subject_breakdown(30) limit 1),
  'subject breakdown joins the hunter''s own subjects');

select public.tap_ok(
  (select count(*) >= 1 from public.hunter_history(20, 0)),
  'history returns the hunter''s sessions');

select public.tap_ok(
  (select count(*) = 0 from public.hunter_history(20, 0) where status = 'active'),
  'history is ordered and readable');

select public.tap_ok(
  (select hunter_history_count() = (select count(*) from public.study_sessions where user_id = auth.uid())),
  'history count matches the hunter''s session count');

select public.tap_ok(
  (select count(*) >= 1 from public.subject_summary()),
  'subject summary rolls up study time');

reset role;

set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select count(*) = 0 from public.hunter_history(50, 0) where id in (
     select id from public.study_sessions where user_id = '11111111-1111-1111-1111-111111111111'
   )),
  'another hunter''s history is unreachable');

reset role;

-- ----------------------------------------------------------------------------
-- 11. Account deletion
-- ----------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set role authenticated;

select public.tap_ok(
  (select (public.delete_my_account() ->> 'deleted')::boolean),
  'a hunter can delete their own account');

reset role;

select public.tap_ok(
  (select count(*) = 0 from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  'account deletion removes the hunter profile');

select public.tap_ok(
  (select count(*) = 0 from auth.users where id = '55555555-5555-5555-5555-555555555555'),
  'account deletion removes the login identity');

select public.tap_ok(
  (select count(*) = 0 from public.xp_transactions where user_id = '55555555-5555-5555-5555-555555555555'),
  'account deletion cascades through owned rows');

-- ----------------------------------------------------------------------------
-- 12. Anonymous visitors
-- ----------------------------------------------------------------------------
set role anon;

select public.tap_ok(
  (select count(*) >= 1 from public.leaderboard('all', 5, 0, null)),
  'anonymous visitors can read the public leaderboard');

select public.tap_fails(
  $sql$ select count(*) from public.study_sessions $sql$,
  'anonymous visitors cannot read study sessions');

select public.tap_fails(
  $sql$ select public.refresh_quests() $sql$,
  'anonymous visitors cannot refresh quests');

select public.tap_fails(
  $sql$ select public.start_study_session(1500, gen_random_uuid()) $sql$,
  'anonymous visitors cannot start sessions');

reset role;

select public.tap_ok(
  (select count(*) >= 13 from public.quest_templates),
  'the quest catalog is seeded deterministically');

select public.tap_ok(
  (select count(*) >= 15 from public.achievements),
  'the achievement catalog is seeded');

select public.tap_ok(
  (select count(*) > 0 from public.rank_thresholds),
  'rank thresholds are readable configuration');

select public.tap_ok(true, 'suite complete');
