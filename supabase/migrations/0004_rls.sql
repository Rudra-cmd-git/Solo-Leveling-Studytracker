-- ============================================================================
-- HUNTER SYSTEM - 0004 ROW LEVEL SECURITY + PRIVILEGES
-- ----------------------------------------------------------------------------
-- Principle: clients may READ what they own (plus clearly public catalog data)
-- and may WRITE only their own subjects/topics. Every value-bearing write
-- (XP, sessions, quests, achievements, profile progression) goes through the
-- SECURITY DEFINER functions in migration 0003.
-- ============================================================================

alter table public.profiles                enable row level security;
alter table public.subjects                enable row level security;
alter table public.topics                  enable row level security;
alter table public.study_sessions          enable row level security;
alter table public.study_session_pauses    enable row level security;
alter table public.study_session_heartbeats enable row level security;
alter table public.xp_transactions         enable row level security;
alter table public.quest_templates         enable row level security;
alter table public.quests                  enable row level security;
alter table public.achievements            enable row level security;
alter table public.user_achievements       enable row level security;
alter table public.notifications           enable row level security;
alter table public.rate_limit_events       enable row level security;
alter table public.progression_config      enable row level security;
alter table public.rank_thresholds         enable row level security;

-- ----------------------------------------------------------------------------
-- Strip the default Supabase grants, then hand back only what is needed.
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles            to anon, authenticated;
grant select on public.rank_thresholds     to anon, authenticated;
grant select on public.progression_config  to anon, authenticated;
grant select on public.achievements        to anon, authenticated;
grant select on public.quest_templates     to anon, authenticated;

grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.topics   to authenticated;

grant select on public.study_sessions           to authenticated;
grant select on public.study_session_pauses     to authenticated;
grant select on public.study_session_heartbeats to authenticated;
grant select on public.xp_transactions          to authenticated;
grant select on public.quests                   to authenticated;
grant select on public.user_achievements        to authenticated;
grant select on public.notifications            to authenticated;

-- rate_limit_events: service role only (no grants).

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
create policy profiles_read_self_or_public on public.profiles
  for select to authenticated
  using (id = auth.uid() or is_public);

create policy profiles_read_public on public.profiles
  for select to anon
  using (is_public);

create policy subjects_owner_all on public.subjects
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy topics_owner_all on public.topics
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.subjects s
       where s.id = topics.subject_id and s.user_id = auth.uid()
    )
  );

create policy sessions_read_own on public.study_sessions
  for select to authenticated using (user_id = auth.uid());

create policy pauses_read_own on public.study_session_pauses
  for select to authenticated using (user_id = auth.uid());

create policy heartbeats_read_own on public.study_session_heartbeats
  for select to authenticated using (user_id = auth.uid());

create policy xp_read_own on public.xp_transactions
  for select to authenticated using (user_id = auth.uid());

create policy quests_read_own on public.quests
  for select to authenticated using (user_id = auth.uid());

create policy achievements_read_own on public.user_achievements
  for select to authenticated using (user_id = auth.uid());

create policy notifications_read_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy quest_templates_public on public.quest_templates
  for select to anon, authenticated using (true);

create policy achievements_catalog_public on public.achievements
  for select to anon, authenticated using (true);

create policy rank_thresholds_public on public.rank_thresholds
  for select to anon, authenticated using (true);

create policy progression_config_public on public.progression_config
  for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
-- Function privileges: default PUBLIC execute is revoked, then re-granted
-- per role. Internal helpers stay unreachable from the anon key.
-- ----------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  for v_fn in
    select string_agg(p.oid::regprocedure::text, ',')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
     group by p.proname
  loop
    execute format('revoke all on function %s from public', v_fn);
  end loop;
end;
$$;

-- Read-only helpers anyone may call.
grant execute on function public.level_for_xp(bigint) to anon, authenticated;
grant execute on function public.level_for_xp(bigint, integer, integer) to anon, authenticated;
grant execute on function public.xp_to_reach_level(integer, integer, integer) to anon, authenticated;
grant execute on function public.level_step_xp(integer, integer, integer) to anon, authenticated;
grant execute on function public.rank_for_xp(bigint) to anon, authenticated;
grant execute on function public.rank_index(text) to anon, authenticated;
grant execute on function public.level_progress(bigint) to anon, authenticated;
grant execute on function public.hunter_progression() to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-- Authenticated gameplay surface.
grant execute on function public.start_study_session(integer, uuid, uuid, uuid, boolean, text) to authenticated;
grant execute on function public.heartbeat_study_session(uuid) to authenticated;
grant execute on function public.pause_study_session(uuid) to authenticated;
grant execute on function public.resume_study_session(uuid) to authenticated;
grant execute on function public.cancel_study_session(uuid) to authenticated;
grant execute on function public.complete_study_session(uuid) to authenticated;
grant execute on function public.refresh_quests() to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, boolean, boolean, integer) to authenticated;
grant execute on function public.mark_awakened() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.hunter_metric(text, uuid, timestamptz) to authenticated;
grant execute on function public.session_credited_seconds(uuid) to authenticated;
grant execute on function public.hunter_day_start(uuid, timestamptz) to authenticated;
