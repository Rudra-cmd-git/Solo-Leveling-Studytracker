-- ============================================================================
-- 0013_admin_console.sql - moderation surface for staff
-- ----------------------------------------------------------------------------
-- The `hunter_role` column has existed since 0001 but nothing read it. This
-- adds the read-only moderation views plus a narrow role-management RPC.
--
-- Rules enforced in the database, not the UI:
--   * only 'staff' (moderator or admin) may read the console RPCs;
--   * only an admin may change a role;
--   * nobody may change their own role, so an admin cannot demote themselves
--     into a state where the console has no reachable owner;
--   * 'admin' can never be granted through the API - it is set by the project
--     owner in the SQL editor, which stops privilege escalation through the
--     moderation UI itself.
-- ============================================================================

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('moderator', 'admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- Read-only console data
-- ----------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'hunters',        (select count(*) from public.profiles),
    'new_last_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'active_today',   (select count(distinct user_id) from public.study_sessions
                        where started_at >= date_trunc('day', now())),
    'sessions',       (select count(*) from public.study_sessions where status = 'completed'),
    'minutes',        (select coalesce(sum(credited_minutes), 0) from public.study_sessions
                        where status = 'completed'),
    'xp_awarded',     (select coalesce(sum(amount), 0) from public.xp_transactions),
    'guilds',         (select count(*) from public.guilds),
    'friendships',    (select count(*) from public.friendships where status = 'accepted'),
    'staff',          (select count(*) from public.profiles where role in ('moderator', 'admin'))
  );
end;
$$;

create or replace function public.admin_hunters(
  p_limit  integer default 25,
  p_search text default null
)
returns table (
  user_id          uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  hunter_rank      text,
  level            integer,
  xp_total         bigint,
  sessions         integer,
  current_streak   integer,
  hunter_role      text,
  is_public        boolean,
  last_study_date  date,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;

  return query
    select p.id, p.username, p.display_name, p.avatar_url,
           p.rank::text, p.level, p.xp_total, p.sessions_completed,
           p.current_streak, p.role::text, p.is_public, p.last_study_date, p.created_at
      from public.profiles p
     where p_search is null
        or p.username ilike '%' || btrim(p_search) || '%'
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 25), 100));
end;
$$;

-- ----------------------------------------------------------------------------
-- Role management
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role public.hunter_role)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := auth.uid();
  v_role public.hunter_role;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles where id = v_me and role = 'admin'
  ) then
    raise exception 'NOT_AUTHORISED' using errcode = '42501';
  end if;

  if p_user = v_me then
    raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '22023';
  end if;

  if p_role = 'admin' then
    raise exception 'ADMIN_GRANT_REQUIRES_OWNER' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'HUNTER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.check_rate_limit('admin_set_role', 60, 3600) then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;

  update public.profiles
     set role = p_role,
         updated_at = now()
   where id = p_user
  returning role into v_role;

  insert into public.notifications (user_id, type, title, message)
  values (
    p_user,
    'system',
    'System role updated',
    'A System administrator set your role to ' || v_role::text || '.'
  );

  return jsonb_build_object('user_id', p_user, 'role', v_role);
end;
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.admin_overview() from public;
revoke all on function public.admin_hunters(integer, text) from public;
revoke all on function public.admin_set_role(uuid, public.hunter_role) from public;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_hunters(integer, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.hunter_role) to authenticated;
