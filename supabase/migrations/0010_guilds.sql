-- ============================================================================
-- 0010_guilds.sql - Hunter guilds, rosters and the guild board
-- ----------------------------------------------------------------------------
-- A guild is a small persistent party of hunters. Membership is one-per-hunter
-- (enforced by a unique index, not by hope), and every write goes through a
-- SECURITY DEFINER function so a client can never add itself to a guild, edit
-- someone else's roster, or inflate a score.
--
-- Guild score = the sum of the period XP of its members, computed from the same
-- xp_transactions ledger the hunter leaderboard uses. Nobody can award guild XP
-- directly.
-- ============================================================================

create table public.guilds (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 3 and 32),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  tag           text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  description   text check (description is null or char_length(description) <= 280),
  emblem_color  text not null default '#38e1ff' check (emblem_color ~ '^#[0-9A-Fa-f]{6}$'),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  is_open       boolean not null default true,
  member_limit  integer not null default 30 check (member_limit between 2 and 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index guilds_name_lower_idx on public.guilds (lower(btrim(name)));

create table public.guild_members (
  guild_id  uuid not null references public.guilds (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('leader', 'officer', 'member')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

-- One guild per hunter.
create unique index guild_members_one_guild_idx on public.guild_members (user_id);
create index guild_members_guild_idx on public.guild_members (guild_id, joined_at);

create trigger guilds_touch before update on public.guilds
  for each row execute function public.tg_touch_updated_at();

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;

revoke all on public.guilds from anon, authenticated;
revoke all on public.guild_members from anon, authenticated;
grant select on public.guilds to anon, authenticated;
grant select on public.guild_members to authenticated;

create policy guilds_read_all on public.guilds
  for select to anon, authenticated using (true);

create policy guild_members_read_all on public.guild_members
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function public.guild_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select gm.guild_id from public.guild_members gm where gm.user_id = p_user;
$$;

create or replace function public.guild_role_of(p_user uuid, p_guild uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select gm.role from public.guild_members gm
   where gm.user_id = p_user and gm.guild_id = p_guild;
$$;

create or replace function public.guild_slug(p_name text, p_tag text)
returns text
language plpgsql
volatile
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  base := lower(btrim(p_name));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := btrim(base, '-');
  if char_length(base) < 3 then
    base := lower(p_tag) || '-' || base;
  end if;
  base := left(base, 40);
  candidate := base;

  while exists (select 1 from public.guilds g where g.slug = candidate) loop
    n := n + 1;
    candidate := left(base, 40) || '-' || n::text;
  end loop;

  return candidate;
end;
$$;

-- ----------------------------------------------------------------------------
-- Create / join / leave
-- ----------------------------------------------------------------------------
create or replace function public.create_guild(
  p_name        text,
  p_tag         text,
  p_description text default null,
  p_is_open     boolean default true,
  p_color       text default '#38e1ff'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_tag  text := upper(btrim(coalesce(p_tag, '')));
  v_id   uuid;
  v_slug text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.check_rate_limit('create_guild', 5, 86400) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 32 then
    raise exception 'INVALID_GUILD_NAME' using errcode = '22023';
  end if;
  if v_tag !~ '^[A-Z0-9]{2,5}$' then
    raise exception 'INVALID_GUILD_TAG' using errcode = '22023';
  end if;
  if p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_GUILD_COLOR' using errcode = '22023';
  end if;
  if public.guild_of(v_user) is not null then
    raise exception 'ALREADY_IN_GUILD' using errcode = '23505';
  end if;
  if exists (select 1 from public.guilds g where lower(btrim(g.name)) = lower(v_name)) then
    raise exception 'GUILD_NAME_TAKEN' using errcode = '23505';
  end if;

  v_slug := public.guild_slug(v_name, v_tag);

  insert into public.guilds (name, slug, tag, description, emblem_color, owner_id, is_open)
  values (v_name, v_slug, v_tag, nullif(btrim(coalesce(p_description, '')), ''), p_color, v_user,
          coalesce(p_is_open, true))
  returning id into v_id;

  insert into public.guild_members (guild_id, user_id, role) values (v_id, v_user, 'leader');

  insert into public.notifications (user_id, type, title, message, payload)
  values (v_user, 'system', 'Guild founded', 'Your guild is registered with the Association.',
          jsonb_build_object('kind', 'guild', 'guild_id', v_id));

  return jsonb_build_object('guild_id', v_id, 'slug', v_slug);
end;
$$;

create or replace function public.join_guild(p_guild_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_guild public.guilds;
  v_count integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.check_rate_limit('join_guild', 20, 3600) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  select * into v_guild from public.guilds where id = p_guild_id;
  if v_guild.id is null then
    raise exception 'GUILD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.guild_of(v_user) is not null then
    raise exception 'ALREADY_IN_GUILD' using errcode = '23505';
  end if;
  if not v_guild.is_open then
    raise exception 'GUILD_CLOSED' using errcode = '22023';
  end if;

  select count(*) into v_count from public.guild_members where guild_id = v_guild.id;
  if v_count >= v_guild.member_limit then
    raise exception 'GUILD_FULL' using errcode = '22023';
  end if;

  insert into public.guild_members (guild_id, user_id) values (v_guild.id, v_user);

  insert into public.notifications (user_id, type, title, message, payload)
  values (v_guild.owner_id, 'system', 'New guild member', 'A hunter joined your guild.',
          jsonb_build_object('kind', 'guild', 'guild_id', v_guild.id, 'hunter_id', v_user));

  return jsonb_build_object('guild_id', v_guild.id, 'slug', v_guild.slug);
end;
$$;

-- The leader hands over to the longest-serving officer (or member) when they
-- leave; the last member out dissolves the guild.
create or replace function public.leave_guild()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_guild uuid;
  v_role  text;
  v_next  uuid;
  v_left  integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  v_guild := public.guild_of(v_user);
  if v_guild is null then
    raise exception 'NOT_IN_GUILD' using errcode = 'P0002';
  end if;
  v_role := public.guild_role_of(v_user, v_guild);

  delete from public.guild_members where guild_id = v_guild and user_id = v_user;

  select count(*) into v_left from public.guild_members where guild_id = v_guild;

  if v_left = 0 then
    delete from public.guilds where id = v_guild;
    return jsonb_build_object('left', true, 'dissolved', true);
  end if;

  if v_role = 'leader' then
    select user_id into v_next
      from public.guild_members
     where guild_id = v_guild
     order by (role = 'officer') desc, joined_at asc
     limit 1;

    update public.guild_members set role = 'leader'
     where guild_id = v_guild and user_id = v_next;
    update public.guilds set owner_id = v_next where id = v_guild;

    insert into public.notifications (user_id, type, title, message, payload)
    values (v_next, 'system', 'Guild leadership', 'You are now the leader of your guild.',
            jsonb_build_object('kind', 'guild', 'guild_id', v_guild));
  end if;

  return jsonb_build_object('left', true, 'dissolved', false);
end;
$$;

-- Leader-only settings; officers may promote and remove members.
create or replace function public.update_my_guild(
  p_description text default null,
  p_is_open     boolean default null,
  p_color       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_guild uuid := public.guild_of(auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if v_guild is null then
    raise exception 'NOT_IN_GUILD' using errcode = 'P0002';
  end if;
  if public.guild_role_of(v_user, v_guild) <> 'leader' then
    raise exception 'GUILD_LEADER_ONLY' using errcode = '42501';
  end if;
  if p_color is not null and p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_GUILD_COLOR' using errcode = '22023';
  end if;

  update public.guilds
     set description = case when p_description is null then description
                            else nullif(btrim(p_description), '') end,
         is_open = coalesce(p_is_open, is_open),
         emblem_color = coalesce(p_color, emblem_color)
   where id = v_guild;

  return (select to_jsonb(g) from public.guilds g where g.id = v_guild);
end;
$$;

create or replace function public.remove_guild_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_guild  uuid := public.guild_of(auth.uid());
  v_actor  text;
  v_target text;
  v_count  integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if v_guild is null then
    raise exception 'NOT_IN_GUILD' using errcode = 'P0002';
  end if;

  v_actor := public.guild_role_of(v_user, v_guild);
  v_target := public.guild_role_of(p_user, v_guild);

  if p_user is null or v_target is null then
    raise exception 'NOT_IN_GUILD' using errcode = 'P0002';
  end if;
  if p_user = v_user then
    raise exception 'USE_LEAVE_GUILD' using errcode = '22023';
  end if;
  if v_target = 'leader' then
    raise exception 'CANNOT_REMOVE_LEADER' using errcode = '42501';
  end if;
  if v_actor not in ('leader', 'officer') then
    raise exception 'GUILD_LEADER_ONLY' using errcode = '42501';
  end if;
  if v_actor = 'officer' and v_target = 'officer' then
    raise exception 'GUILD_LEADER_ONLY' using errcode = '42501';
  end if;

  delete from public.guild_members where guild_id = v_guild and user_id = p_user;
  get diagnostics v_count = row_count;

  return jsonb_build_object('removed', v_count);
end;
$$;

create or replace function public.set_guild_member_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_guild uuid := public.guild_of(auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if v_guild is null or public.guild_role_of(v_user, v_guild) <> 'leader' then
    raise exception 'GUILD_LEADER_ONLY' using errcode = '42501';
  end if;
  if p_role not in ('officer', 'member') then
    raise exception 'INVALID_GUILD_ROLE' using errcode = '22023';
  end if;
  if p_user = v_user then
    raise exception 'CANNOT_DEMOTE_LEADER' using errcode = '22023';
  end if;

  update public.guild_members set role = p_role
   where guild_id = v_guild and user_id = p_user;

  return jsonb_build_object('role', p_role);
end;
$$;

-- ----------------------------------------------------------------------------
-- Reads
-- ----------------------------------------------------------------------------
create or replace function public.guild_leaderboard(
  p_period text default 'week',
  p_limit  integer default 20,
  p_search text default null
)
returns table (
  rank_position bigint,
  guild_id      uuid,
  name          text,
  slug          text,
  tag           text,
  emblem_color  text,
  member_count  integer,
  period_xp     bigint,
  is_my_guild   boolean
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
    select g.id, g.name, g.slug, g.tag, g.emblem_color,
           coalesce(count(gm.user_id), 0)::int as member_count,
           coalesce((
             select sum(case
                          when v.period_start is null then p.xp_total
                          else coalesce((
                            select sum(t.amount)::bigint from public.xp_transactions t
                             where t.user_id = gm2.user_id and t.created_at >= v.period_start
                          ), 0)
                        end)
               from public.guild_members gm2
               join public.profiles p on p.id = gm2.user_id
              where gm2.guild_id = g.id
           ), 0)::bigint as period_xp
      from public.guilds g
      left join public.guild_members gm on gm.guild_id = g.id
      cross join v
     where p_search is null or btrim(p_search) = ''
        or g.name ilike '%' || btrim(p_search) || '%'
        or g.tag ilike '%' || btrim(p_search) || '%'
     group by g.id, g.name, g.slug, g.tag, g.emblem_color, v.period_start
  ),
  ranked as (
    select s.*, row_number() over (
      order by s.period_xp desc, s.member_count desc, s.name asc
    ) as pos
      from scored s
  )
  select r.pos, r.id, r.name, r.slug, r.tag, r.emblem_color,
         r.member_count, r.period_xp,
         exists (select 1 from public.guild_members m
                  where m.guild_id = r.id and m.user_id = auth.uid())
    from ranked r
   order by r.pos
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create or replace function public.guild_roster(p_guild_id uuid)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  hunter_rank  text,
  level        integer,
  xp_total     bigint,
  guild_role   text,
  joined_at    timestamptz,
  is_me        boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.username, coalesce(p.display_name, p.username), p.avatar_url,
         p.rank::text, p.level, p.xp_total, gm.role, gm.joined_at, p.id = auth.uid()
    from public.guild_members gm
    join public.profiles p on p.id = gm.user_id
   where gm.guild_id = p_guild_id
     and p.is_public
   order by (gm.role = 'leader') desc, (gm.role = 'officer') desc, gm.joined_at asc;
$$;

-- Everything the guild page needs in one payload.
create or replace function public.guild_detail(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with g as (
    select * from public.guilds where slug = lower(btrim(coalesce(p_slug, ''))) limit 1
  ),
  agg as (
    select coalesce(count(*), 0)::int as member_count,
           coalesce(sum(p.xp_total), 0)::bigint as xp_total,
           coalesce(sum(p.total_study_seconds), 0)::bigint as study_seconds,
           coalesce(sum(p.sessions_completed), 0)::int as sessions
      from public.guild_members gm
      join public.profiles p on p.id = gm.user_id
      join g on g.id = gm.guild_id
  ),
  week as (
    select coalesce(sum(t.amount), 0)::bigint as xp
      from public.guild_members gm
      join public.xp_transactions t on t.user_id = gm.user_id
      join g on g.id = gm.guild_id
     where t.created_at >= date_trunc('week', now())
  ),
  members as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', p.id, 'username', p.username,
             'display_name', coalesce(p.display_name, p.username),
             'avatar_url', p.avatar_url, 'rank', p.rank::text,
             'level', p.level, 'xp_total', p.xp_total,
             'role', gm.role, 'joined_at', gm.joined_at
           ) order by (gm.role = 'leader') desc, (gm.role = 'officer') desc, gm.joined_at asc), '[]'::jsonb) as items
      from public.guild_members gm
      join public.profiles p on p.id = gm.user_id
      join g on g.id = gm.guild_id
  ),
  standing as (
    select r.rank_position from public.guild_leaderboard('week', 50, null) r, g where r.guild_id = g.id
  )
  select case when g.id is null then null else jsonb_build_object(
    'id', g.id, 'name', g.name, 'slug', g.slug, 'tag', g.tag,
    'description', g.description, 'emblem_color', g.emblem_color,
    'owner_id', g.owner_id, 'is_open', g.is_open, 'member_limit', g.member_limit,
    'created_at', g.created_at,
    'member_count', (select member_count from agg),
    'xp_total', (select xp_total from agg),
    'study_seconds', (select study_seconds from agg),
    'sessions', (select sessions from agg),
    'weekly_xp', (select xp from week),
    'weekly_position', (select rank_position from standing),
    'members', (select items from members),
    'my_role', public.guild_role_of(auth.uid(), g.id)
  ) end
  from g;
$$;

create or replace function public.my_guild()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.slug
    from public.guild_members gm
    join public.guilds g on g.id = gm.guild_id
   where gm.user_id = auth.uid();
$$;

revoke all on function public.guild_of(uuid) from public;
revoke all on function public.guild_role_of(uuid, uuid) from public;
revoke all on function public.guild_slug(text, text) from public;

grant execute on function public.guild_of(uuid) to authenticated;
grant execute on function public.guild_role_of(uuid, uuid) to authenticated;
grant execute on function public.create_guild(text, text, text, boolean, text) to authenticated;
grant execute on function public.join_guild(uuid) to authenticated;
grant execute on function public.leave_guild() to authenticated;
grant execute on function public.update_my_guild(text, boolean, text) to authenticated;
grant execute on function public.remove_guild_member(uuid) to authenticated;
grant execute on function public.set_guild_member_role(uuid, text) to authenticated;
grant execute on function public.guild_leaderboard(text, integer, text) to anon, authenticated;
grant execute on function public.guild_roster(uuid) to anon, authenticated;
grant execute on function public.guild_detail(text) to anon, authenticated;
grant execute on function public.my_guild() to authenticated;
