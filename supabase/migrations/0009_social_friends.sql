-- ============================================================================
-- 0009_social_friends.sql - Hunter friends + friends leaderboard
-- ----------------------------------------------------------------------------
-- A friendship is a single row for a pair of hunters, owned jointly by the
-- requester and the addressee. Clients can read rows they are part of and can
-- write nothing: every transition (request, accept, decline, unfriend) goes
-- through a SECURITY DEFINER function that re-checks auth.uid() and the current
-- state of the row.
--
-- Nothing here can be used to read another hunter's private data: the exposed
-- columns are the same public ones the leaderboard already shows.
-- ============================================================================

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create index friendships_requester_idx on public.friendships (requester_id, status);
create index friendships_addressee_idx on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create policy friendships_read_own on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = p_a and f.addressee_id = p_b)
         or (f.requester_id = p_b and f.addressee_id = p_a))
  );
$$;

/** Resolve a handle to a reachable hunter id, or raise. */
create or replace function public.hunter_id_by_username(p_username text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, '')))
     and is_public
   limit 1;

  if v_id is null then
    raise exception 'HUNTER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Transitions
-- ----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_target  uuid;
  v_existing public.friendships;
  v_status  text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.check_rate_limit('friend_request', 30, 3600) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  v_target := public.hunter_id_by_username(p_username);

  if v_target = v_user then
    raise exception 'CANNOT_FRIEND_SELF' using errcode = '22023';
  end if;

  select * into v_existing from public.friendships
   where (requester_id = v_user and addressee_id = v_target)
      or (requester_id = v_target and addressee_id = v_user)
   limit 1;

  if v_existing.requester_id is not null then
    if v_existing.status = 'accepted' then
      raise exception 'ALREADY_FRIENDS' using errcode = '23505';
    end if;

    if v_existing.status = 'pending' then
      -- They already asked us: treat this as an acceptance.
      if v_existing.requester_id = v_target then
        update public.friendships
           set status = 'accepted', responded_at = now()
         where requester_id = v_target and addressee_id = v_user;
        v_status := 'accepted';
      else
        raise exception 'REQUEST_ALREADY_SENT' using errcode = '23505';
      end if;
    else
      -- A previous decline: reopen the record with the new direction.
      delete from public.friendships
       where requester_id = v_existing.requester_id
         and addressee_id = v_existing.addressee_id;
      insert into public.friendships (requester_id, addressee_id)
      values (v_user, v_target);
      v_status := 'pending';
    end if;
  else
    insert into public.friendships (requester_id, addressee_id)
    values (v_user, v_target);
    v_status := 'pending';
  end if;

  insert into public.notifications (user_id, type, title, message, payload)
  values (
    case when v_status = 'accepted' then v_user else v_target end,
    'system',
    case when v_status = 'accepted' then 'Friend added' else 'Friend request' end,
    case when v_status = 'accepted'
         then 'A hunter accepted your friend request.'
         else 'A hunter wants to join your roster.' end,
    jsonb_build_object('kind', 'friendship', 'status', v_status, 'hunter_id', v_user)
  );

  return jsonb_build_object('status', v_status, 'username', p_username);
end;
$$;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
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

  update public.friendships
     set status = case when coalesce(p_accept, false) then 'accepted' else 'declined' end,
         responded_at = now()
   where requester_id = p_requester
     and addressee_id = v_user
     and status = 'pending';

  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(p_accept, false) then
    insert into public.notifications (user_id, type, title, message, payload)
    values (p_requester, 'system', 'Friend added', 'A hunter accepted your friend request.',
            jsonb_build_object('kind', 'friendship', 'status', 'accepted', 'hunter_id', v_user));
  end if;

  return jsonb_build_object('accepted', coalesce(p_accept, false));
end;
$$;

-- Removes a friendship, or withdraws a request this hunter sent.
create or replace function public.remove_friend(p_other uuid)
returns jsonb
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

  delete from public.friendships
   where (requester_id = v_user and addressee_id = p_other)
      or (requester_id = p_other and addressee_id = v_user);
  get diagnostics v_count = row_count;

  return jsonb_build_object('removed', v_count);
end;
$$;

-- ----------------------------------------------------------------------------
-- Reads
-- ----------------------------------------------------------------------------
create or replace function public.list_friends()
returns table (
  user_id          uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  hunter_rank      text,
  level            integer,
  xp_total         bigint,
  current_streak   integer,
  sessions_completed integer,
  friends_since    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         p.username,
         coalesce(p.display_name, p.username),
         p.avatar_url,
         p.rank::text,
         p.level,
         p.xp_total,
         p.current_streak,
         p.sessions_completed,
         coalesce(f.responded_at, f.created_at)
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
   where f.status = 'accepted'
     and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
   order by p.xp_total desc, p.username asc;
$$;

create or replace function public.list_friend_requests()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.id, 'username', p.username,
               'display_name', coalesce(p.display_name, p.username),
               'avatar_url', p.avatar_url, 'hunter_rank', p.rank::text,
               'level', p.level, 'xp_total', p.xp_total,
               'requested_at', f.created_at
             ) order by f.created_at desc)
        from public.friendships f
        join public.profiles p on p.id = f.requester_id
       where f.addressee_id = auth.uid() and f.status = 'pending'
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.id, 'username', p.username,
               'display_name', coalesce(p.display_name, p.username),
               'avatar_url', p.avatar_url, 'hunter_rank', p.rank::text,
               'level', p.level, 'xp_total', p.xp_total,
               'requested_at', f.created_at
             ) order by f.created_at desc)
        from public.friendships f
        join public.profiles p on p.id = f.addressee_id
       where f.requester_id = auth.uid() and f.status = 'pending'
    ), '[]'::jsonb)
  );
$$;

-- Public hunter search with the relationship to the caller, so the roster page
-- can render the right button without a second round trip.
create or replace function public.search_hunters(p_query text, p_limit integer default 10)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  hunter_rank  text,
  level        integer,
  xp_total     bigint,
  relationship text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (
    select btrim(coalesce(p_query, '')) as term
  )
  select p.id,
         p.username,
         coalesce(p.display_name, p.username),
         p.avatar_url,
         p.rank::text,
         p.level,
         p.xp_total,
         case
           when p.id = auth.uid() then 'self'
           when exists (
             select 1 from public.friendships f
              where f.status = 'accepted'
                and ((f.requester_id = auth.uid() and f.addressee_id = p.id)
                  or (f.requester_id = p.id and f.addressee_id = auth.uid()))
           ) then 'friend'
           when exists (
             select 1 from public.friendships f
              where f.status = 'pending' and f.requester_id = auth.uid() and f.addressee_id = p.id
           ) then 'outgoing'
           when exists (
             select 1 from public.friendships f
              where f.status = 'pending' and f.requester_id = p.id and f.addressee_id = auth.uid()
           ) then 'incoming'
           else 'none'
         end as relationship
    from public.profiles p, q
   where p.is_public
     and char_length(q.term) >= 2
     and p.username ilike '%' || q.term || '%'
   order by (p.username ilike q.term || '%') desc, p.xp_total desc
   limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

-- Friends board: the caller plus accepted friends, including hunters who opted
-- out of the global board. Private hunters stay excluded.
create or replace function public.friend_leaderboard(
  p_period text default 'all',
  p_limit  integer default 50
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
  with v as (
    select public.leaderboard_period_start(p_period) as period_start
  ),
  circle as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
      from public.friendships f
     where f.status = 'accepted'
       and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ),
  scored as (
    select p.id, p.username,
           coalesce(p.display_name, p.username) as display_name,
           p.avatar_url, p.rank::text as hunter_rank, p.level, p.created_at, p.xp_total,
           case
             when v.period_start is null then p.xp_total
             else coalesce((
               select sum(t.amount)::bigint from public.xp_transactions t
                where t.user_id = p.id and t.created_at >= v.period_start
             ), 0)
           end as period_xp
      from public.profiles p
      join circle c on c.id = p.id
      cross join v
     where p.is_public
  ),
  ranked as (
    select s.*, row_number() over (
      order by s.period_xp desc, s.xp_total desc, s.created_at asc, s.id asc
    ) as pos
      from scored s
  )
  select r.pos, r.id, r.username, r.display_name, r.avatar_url,
         r.hunter_rank, r.level, r.period_xp, r.id = auth.uid()
    from ranked r
   order by r.pos
   limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
revoke all on function public.hunter_id_by_username(text) from public;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.hunter_id_by_username(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.search_hunters(text, integer) to authenticated;
grant execute on function public.friend_leaderboard(text, integer) to authenticated;
